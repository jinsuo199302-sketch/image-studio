"""独立子进程跑老照片上色（黑白 -> 彩色），跟主 FastAPI 进程隔离——上色模型加载后进程占
约 500~800MB RSS，跟抠图一样不能常驻在长期运行的 uvicorn worker 里，2 核 2GB 的小机器
扛不住。每次调用起新进程，处理完立刻退出，内存马上还给系统。stdin 读原图字节，stdout 写
上色后的 JPEG 字节。

argv[1] 是饱和度系数（默认 "1.0"，范围 0.5~2.0）——>1 提饱和，1.0 是模型原始输出。

模型：DeOldify（jantic/DeOldify）的 ONNX 导出版，走 onnxruntime CPU。
  - 依赖 opencv-python-headless + numpy + onnxruntime，**全是项目已装的，零新增依赖**；
  - 固定 256×256 输入，CPU 推理 ~0.5s，权重 255MB；
  - **只取模型输出的 ab 色度，亮度 L 用原图原分辨率**——脸部/细节结构一个像素不动，
    只是"上色"，贴合"给爷爷奶奶的老照片上色"这种对人脸忠实度要求极高的场景。
  比之前用的 Zhang ECCV16 老模型明显更自然（肤色不发黄、草地天空更接近真实），
  是 2026-08-28 按用户"上色感觉不太好"的反馈换的。

模型文件 deoldify.onnx（255MB）首次调用现场下载并缓存到 ~/.cache/image-studio-colorize/
（或 COLORIZE_MODEL_DIR 指定的目录），之后走本地缓存。从 GitHub release 下载，跟抠图
isnet 首次下模型是同一个套路，建议部署后手动预热一次别让线上第一个真实用户干等。
"""
import io
import os
import sys
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

ort.set_default_logger_severity(3)

_MODEL_DIR = Path(os.environ.get("COLORIZE_MODEL_DIR") or (Path.home() / ".cache" / "image-studio-colorize"))
_MODEL = _MODEL_DIR / "deoldify.onnx"
_MODEL_URLS = [
    "https://github.com/instant-high/deoldify-onnx/releases/download/deoldify-onnx/deoldify.onnx",
]

# 模型固定 256×256 输入。
_INPUT = 256

# 内存安全阀：亮度通道按原分辨率保留，超大图上 float32 的 LAB 数组能把小机器逼到 OOM。
# 长边超过 2000 再多的像素对上色收益很小（色度本来就是 256 出的再放大），先等比缩。
_MAX_SIDE = 2000


def _ensure_model() -> Path:
    if _MODEL.exists() and _MODEL.stat().st_size > 200 * 1024 * 1024:
        return _MODEL
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _MODEL.with_suffix(".onnx.part")
    last_err: Exception | None = None
    for url in _MODEL_URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "image-studio-colorize/1.0"})
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp, "wb") as f:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            if tmp.stat().st_size < 200 * 1024 * 1024:
                raise OSError(f"下载文件过小（{tmp.stat().st_size} 字节），可能是错误页")
            tmp.replace(_MODEL)
            return _MODEL
        except Exception as e:  # noqa: BLE001 —— 逐个镜像试，全挂了再抛
            last_err = e
            tmp.unlink(missing_ok=True)
    raise RuntimeError(f"上色模型下载失败：{last_err}")


def _colorize(sess: ort.InferenceSession, rgb_u8: np.ndarray, saturation: float) -> np.ndarray:
    h, w = rgb_u8.shape[:2]
    lab_src = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2LAB)
    L = lab_src[:, :, 0]  # 原图亮度，原分辨率，一个像素不动

    # 预处理：灰度铺三通道，缩到 256，原始 0~255 float（DeOldify 这个 ONNX 导出不做归一化）
    gray = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2GRAY)
    x = cv2.resize(cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB), (_INPUT, _INPUT))
    x = x.astype(np.float32).transpose(2, 0, 1)[None]

    out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]  # 3×256×256，RGB
    out = np.clip(out.transpose(1, 2, 0), 0, 255).astype(np.uint8)
    out = cv2.resize(out, (w, h))

    # 只保留模型给的 ab 色度，L 用原图的。饱和度 = ab 围绕中性点（128）缩放。
    ab = cv2.cvtColor(out, cv2.COLOR_RGB2LAB).astype(np.float32)
    if abs(saturation - 1.0) > 1e-3:
        ab[:, :, 1] = np.clip((ab[:, :, 1] - 128.0) * saturation + 128.0, 0, 255)
        ab[:, :, 2] = np.clip((ab[:, :, 2] - 128.0) * saturation + 128.0, 0, 255)
    merged = np.dstack([L, ab[:, :, 1], ab[:, :, 2]]).astype(np.uint8)
    return cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)


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

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(str(_ensure_model()), sess_options=so, providers=["CPUExecutionProvider"])
    out = _colorize(sess, np.array(img), saturation)

    buf = io.BytesIO()
    Image.fromarray(out, mode="RGB").save(buf, "JPEG", quality=92)
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == "__main__":
    main()
