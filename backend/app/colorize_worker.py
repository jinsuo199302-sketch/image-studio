"""独立子进程跑老照片上色（黑白 -> 彩色），跟主 FastAPI 进程隔离——上色模型加载后进程占
约 300~500MB RSS，跟抠图一样不常驻在长期运行的 uvicorn worker 里。每次调用起新进程，
处理完立刻退出，内存马上还给系统。stdin 读原图字节，stdout 写上色后的 JPEG 字节。

argv[1] 是饱和度系数（默认 "1.0"，范围 0.5~2.0）——>1 提饱和，1.0 是模型原始输出。

模型：DDColor（Alibaba，ECCV/CVPR 系工作，当前开源上色里对人像最稳的之一）的 int8
量化 ONNX。
  - 依赖 opencv-python-headless + numpy + onnxruntime，**全是项目已装的，零新增依赖**；
  - 固定 256×256 输入，**只输出 ab 两个色度通道**，亮度 L 用原图原分辨率——脸部/细节
    结构一个像素不动；
  - int8 量化，CPU 推理 ~0.7s，模型才 62MB，内存占用比抠图的 isnet 小得多；
  - 换 DDColor 之前先用过 Zhang ECCV16（发黄发闷）和 DeOldify（白发/阴影处爱泛紫），
    用户两次反馈"上色感觉不太好"。真实老照片（"Migrant Mother"）+ 人像转黑白回测，
    DDColor 明显更干净：不泛紫、不脑补怪色（DeOldify 会把白色雏菊上成红色，DDColor
    正确上成黄色），整体偏克制但对褪色老照片正合适。

模型文件 ddcolor-int8.onnx（62MB）首次调用现场下载并缓存到 ~/.cache/image-studio-colorize/
（或 COLORIZE_MODEL_DIR 指定的目录），之后走本地缓存。跟抠图 isnet 首次下模型一个套路，
建议部署后手动预热一次别让线上第一个真实用户干等。
"""
import hashlib
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
_MODEL = _MODEL_DIR / "ddcolor-int8.onnx"
_MODEL_SHA256 = "8c9a8acd16dadc2ca3d6134717b6ca838540712b3a4624fd0f7eb9aab3e3a654"
_MODEL_SIZE = 61926813
_MODEL_URLS = [
    "https://huggingface.co/Faridzar/ddcolor-mirror/resolve/main/ddcolor-int8.onnx?download=true",
]

_INPUT = 256  # 模型固定输入边长

# 内存安全阀：亮度按原分辨率保留，超大图上 float32 的 LAB 数组能把小机器逼到 OOM。
# 长边超过 2000 再多的像素对上色收益很小（色度本来就是 256 出的再放大），先等比缩。
_MAX_SIDE = 2000


def _ensure_model() -> Path:
    if _MODEL.exists() and _MODEL.stat().st_size == _MODEL_SIZE:
        return _MODEL
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _MODEL.with_suffix(".onnx.part")
    last_err: Exception | None = None
    for url in _MODEL_URLS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "image-studio-colorize/1.0"})
            h = hashlib.sha256()
            with urllib.request.urlopen(req, timeout=180) as resp, open(tmp, "wb") as f:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    h.update(chunk)
                    f.write(chunk)
            if h.hexdigest() != _MODEL_SHA256:
                raise OSError(f"校验和不匹配（{h.hexdigest()[:12]}…），可能下到了错误页或半截文件")
            tmp.replace(_MODEL)
            return _MODEL
        except Exception as e:  # noqa: BLE001 —— 逐个镜像试，全挂了再抛
            last_err = e
            tmp.unlink(missing_ok=True)
    raise RuntimeError(f"上色模型下载失败：{last_err}")


def _colorize(sess: ort.InferenceSession, bgr_u8: np.ndarray, saturation: float) -> np.ndarray:
    h, w = bgr_u8.shape[:2]
    img = bgr_u8.astype(np.float32) / 255.0
    orig_l = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[:, :, :1]  # 原图亮度，原分辨率，一个像素不动

    small = cv2.resize(img, (_INPUT, _INPUT))
    small_l = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)[:, :, :1]
    gray_lab = np.concatenate([small_l, np.zeros_like(small_l), np.zeros_like(small_l)], axis=-1)
    gray_rgb = cv2.cvtColor(gray_lab, cv2.COLOR_LAB2RGB)
    x = gray_rgb.transpose(2, 0, 1)[None].astype(np.float32)

    ab = sess.run(None, {sess.get_inputs()[0].name: x})[0][0].transpose(1, 2, 0)  # 256×256×2
    ab = cv2.resize(ab, (w, h))

    if abs(saturation - 1.0) > 1e-3:
        ab = np.clip(ab * saturation, -127.0, 127.0)

    out_lab = np.concatenate([orig_l, ab], axis=-1)
    out_bgr = np.clip(cv2.cvtColor(out_lab, cv2.COLOR_LAB2BGR), 0.0, 1.0)
    return (out_bgr * 255.0).round().astype(np.uint8)


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

    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(str(_ensure_model()), sess_options=so, providers=["CPUExecutionProvider"])
    out_bgr = _colorize(sess, bgr, saturation)

    out_rgb = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2RGB)
    buf = io.BytesIO()
    Image.fromarray(out_rgb, mode="RGB").save(buf, "JPEG", quality=92)
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == "__main__":
    main()
