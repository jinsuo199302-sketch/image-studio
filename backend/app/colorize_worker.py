"""独立子进程跑老照片上色（黑白 -> 彩色），跟主 FastAPI 进程隔离——上色模型（Zhang
等人 ECCV16 "Colorful Image Colorization" 的 Caffe 权重）加载后进程占约 500MB~1GB RSS，
跟抠图一样不能常驻在长期运行的 uvicorn worker 里，2 核 2GB 的小机器扛不住。每次调用起
新进程，处理完立刻退出，内存马上还给系统。stdin 读原图字节，stdout 写上色后的 JPEG 字节。

argv[1] 是饱和度系数（默认 "1.0"）——这个模型天生偏保守，输出常带一点褪色/泛旧的味道，
放一个 >1 的系数让用户按需提饱和；1.0 就是模型原始输出。

为什么用这个 2016 年的老模型而不是 DeOldify 之类：
  - 只依赖 opencv-python-headless 自带的 cv2.dnn，零新增 Python 依赖；
  - CPU 上 224×224 推理 <1s，权重 ~129MB，内存占用明显比抠图的 isnet 轻；
  - **只预测 ab 两个色度通道，亮度 L 通道原样保留原图全分辨率**——脸部/细节结构
    一个像素都不动，只是"上色"，正好贴合"给爷爷奶奶的老照片上色"这种对人脸忠实度
    要求极高的场景。
权衡：色彩不如 DeOldify 鲜活（红衣服有时会上成暗棕），但对老照片这种本就褪色的素材
反而更自然，够用。

模型文件：
  - colorization_deploy_v2.prototxt / pts_in_hull.npy —— 体积极小，直接 vendor 进仓库
    （app/vendor/colorize/）。
  - colorization_release_v2.caffemodel —— 129MB，首次调用现场下载并缓存到
    ~/.cache/image-studio-colorize/（或 COLORIZE_MODEL_DIR 指定的目录），之后走本地缓存。
    跟抠图 isnet 首次下载模型是同一个套路，建议部署后手动预热一次别让线上第一个真实
    用户干等。
"""
import io
import os
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

_VENDOR_DIR = Path(__file__).resolve().parent / "vendor" / "colorize"
_PROTOTXT = _VENDOR_DIR / "colorization_deploy_v2.prototxt"
_PTS = _VENDOR_DIR / "pts_in_hull.npy"

_MODEL_DIR = Path(os.environ.get("COLORIZE_MODEL_DIR") or (Path.home() / ".cache" / "image-studio-colorize"))
_CAFFEMODEL = _MODEL_DIR / "colorization_release_v2.caffemodel"

# 按可靠性排序的镜像。HuggingFace Space 的 resolve 链接对服务器 curl/urllib 友好，
# 放最前面；伯克利原始地址经常挂，垫底兜底。
_CAFFEMODEL_URLS = [
    "https://huggingface.co/spaces/BilalSardar/Black-N-White-To-Color/resolve/main/colorization_release_v2.caffemodel",
    "https://huggingface.co/spaces/viveknarayan/Image_Colorization/resolve/main/colorization_release_v2.caffemodel",
    "http://eecs.berkeley.edu/~rich.zhang/projects/2016_colorization/files/demo_v2/colorization_release_v2.caffemodel",
]

# 内存安全阀：亮度通道按原分辨率保留，超大图上 float32 的 LAB 数组能把小机器逼到 OOM。
# 长边超过 2000 再多的像素对上色质量收益很小（色度本来就是 224 出的再放大），先等比缩。
_MAX_SIDE = 2000


def _ensure_caffemodel() -> Path:
    if _CAFFEMODEL.exists() and _CAFFEMODEL.stat().st_size > 100 * 1024 * 1024:
        return _CAFFEMODEL
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _CAFFEMODEL.with_suffix(".caffemodel.part")
    last_err: Exception | None = None
    for url in _CAFFEMODEL_URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "image-studio-colorize/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as f:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            if tmp.stat().st_size < 100 * 1024 * 1024:
                raise OSError(f"下载文件过小（{tmp.stat().st_size} 字节），可能是错误页")
            tmp.replace(_CAFFEMODEL)
            return _CAFFEMODEL
        except Exception as e:  # noqa: BLE001 —— 逐个镜像试，全挂了再抛
            last_err = e
            tmp.unlink(missing_ok=True)
    raise RuntimeError(f"上色模型下载失败（已试 {len(_CAFFEMODEL_URLS)} 个镜像）：{last_err}")


def _load_net() -> cv2.dnn.Net:
    caffemodel = _ensure_caffemodel()
    # 读成字节再喂 buffer 重载，不传路径——OpenCV 的 C++ 文件读取器在 Windows 上打不开
    # 含非 ASCII 字符的路径（比如中文用户名下的 ~/.cache/...），传 bytes 绕开这个坑，
    # 对 Linux 也完全无害。
    net = cv2.dnn.readNetFromCaffe(_PROTOTXT.read_bytes(), caffemodel.read_bytes())
    # 把 ab 量化色心和缩放系数塞进对应层——这是 OpenCV DNN 跑这个模型的标准步骤，
    # prototxt 里这两层的 blob 是空的，权重不在 caffemodel 里。
    pts = np.load(_PTS).transpose().reshape(2, 313, 1, 1).astype(np.float32)
    net.getLayer(net.getLayerId("class8_ab")).blobs = [pts]
    net.getLayer(net.getLayerId("conv8_313_rh")).blobs = [np.full([1, 313], 2.606, np.float32)]
    return net


def _colorize(net: cv2.dnn.Net, rgb_u8: np.ndarray, saturation: float) -> np.ndarray:
    rgb = rgb_u8.astype(np.float32) / 255.0
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    L = lab[:, :, 0]  # 0~100

    L_rs = cv2.resize(L, (224, 224)).astype(np.float32)
    L_rs -= 50  # 模型训练时对 L 通道做的中心化
    net.setInput(cv2.dnn.blobFromImage(L_rs))
    ab = net.forward()[0].transpose(1, 2, 0)  # 56×56×2
    ab_up = cv2.resize(ab, (rgb.shape[1], rgb.shape[0])).astype(np.float32)

    # 全程在 LAB 里合成：L 通道直接用原图原分辨率的亮度，一个像素不动（人脸/细节零改动），
    # 只把模型预测的色度 ab 贴上去。饱和度 = 对 ab 整体缩放（围绕中性灰 0 点），
    # 比转 HSV 再调更干净，也不会顺带动到亮度。
    ab_up *= saturation
    ab_up = np.clip(ab_up, -127.0, 127.0)
    out_lab = np.dstack([L, ab_up])
    out_rgb = np.clip(cv2.cvtColor(out_lab, cv2.COLOR_LAB2RGB), 0.0, 1.0)

    return (out_rgb * 255.0).round().astype(np.uint8)


def main() -> None:
    try:
        saturation = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
    except ValueError:
        saturation = 1.0
    saturation = min(2.0, max(0.5, saturation))

    image_bytes = sys.stdin.buffer.read()
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > _MAX_SIDE:
        scale = _MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)

    net = _load_net()
    out = _colorize(net, np.array(img), saturation)

    buf = io.BytesIO()
    Image.fromarray(out, mode="RGB").save(buf, "JPEG", quality=92)
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == "__main__":
    main()
