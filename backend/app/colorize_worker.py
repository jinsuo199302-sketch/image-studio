"""独立子进程跑老照片修复上色（黑白/褪色 -> 彩色），跟主 FastAPI 进程隔离——上色模型加载
后进程占约 300MB、推理峰值 ~750MB RSS，不常驻在长期运行的 uvicorn worker 里。每次调用起
新进程，处理完立刻退出，内存马上还给系统。stdin 读原图字节，stdout 写 JPEG 字节。

argv[1] 是饱和度系数（默认 "1.0"，范围 0.5~2.0）——>1 提饱和，1.0 是模型原始输出。

模型：DDColor（Alibaba）large 模型的 int8 量化 ONNX。
  - 依赖 opencv-python-headless + numpy + onnxruntime，**全是项目已装的，零新增依赖**；
  - 固定 256×256 输入，**只输出 ab 两个色度通道**；
  - int8 量化，CPU 推理 ~1.2s，模型 235MB。

**换过三轮模型 + 一个关键修复（都是用户反馈驱动）**：
  1. Zhang ECCV16（cv2.dnn）——真实人像发黄发闷；
  2. DeOldify ONNX——白发/阴影处泛紫，还会脑补怪色（白雏菊上成红）；
  3. DDColor **small** int8——干净不泛紫，但**对"翻拍的老照片"这种低对比+带底色的输入
     会直接塌成灰度输出**（chroma≈0），用户"这个上色不了"就是踩了这个；
  4. DDColor **large** int8（当前）——对退化输入稳得多，配合下面的修复预处理才够看。

**修复预处理**：翻拍的老照片普遍偏黄/发灰/对比压缩，直接喂模型上色效果很淡。先转纯灰度
（去掉泛黄/偏色）+ 轻度 CLAHE + 1~99 百分位拉伸，把这张"修复过对比"的灰度图既喂给模型
（让它看清楚、给出更饱满的颜色），也当作输出的亮度通道（老照片本来就需要顺带修一下）。
CLAHE 力度压得比较轻（clipLimit 1.5），避免人脸被拉出脏噪点。

模型文件 ddcolor-large-int8.onnx（235MB）首次调用现场下载并缓存到
~/.cache/image-studio-colorize/（或 COLORIZE_MODEL_DIR 指定的目录），带 sha256 校验，
之后走本地缓存。跟抠图 isnet 首次下模型一个套路，建议部署后手动预热一次。
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
_MODEL = _MODEL_DIR / "ddcolor-large-int8.onnx"
_MODEL_SHA256 = "733233ca8926439e9d8ef9dbc5b5d82733f67c6e2dc2209047aae3a617810c20"
_MODEL_SIZE = 235337627
_MODEL_URLS = [
    "https://huggingface.co/Faridzar/ddcolor-mirror/resolve/main/ddcolor-large-int8.onnx?download=true",
]

_INPUT = 256  # 模型固定输入边长

# 内存安全阀：亮度按原分辨率保留，超大图上 float32 的 LAB 数组能把小机器逼到 OOM。
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


def _restore_gray(bgr_u8: np.ndarray) -> np.ndarray:
    """翻拍老照片修复：转纯灰度（去掉泛黄/偏色）+ 轻度 CLAHE + 百分位拉伸。
    拉伸的百分位只在非纯白/纯黑像素上算——抠图结果那种大片白底会把百分位带偏，
    导致真正的主体被压成一小段灰阶。"""
    g = cv2.cvtColor(bgr_u8, cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8)).apply(g)
    mid = g[(g > 8) & (g < 247)]
    lo, hi = np.percentile(mid if mid.size else g, [1, 99])
    if hi > lo:
        g = np.clip((g.astype(np.float32) - lo) * 255.0 / (hi - lo), 0, 255).astype(np.uint8)
    return g


def _colorize(sess: ort.InferenceSession, bgr_u8: np.ndarray, saturation: float) -> np.ndarray:
    h, w = bgr_u8.shape[:2]
    gray = _restore_gray(bgr_u8)  # 修复过对比的灰度：既喂模型，也当输出亮度

    gray01 = gray.astype(np.float32) / 255.0
    small = cv2.resize(cv2.cvtColor(gray01, cv2.COLOR_GRAY2BGR), (_INPUT, _INPUT))
    small_l = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)[:, :, :1]
    gray_lab = np.concatenate([small_l, np.zeros_like(small_l), np.zeros_like(small_l)], axis=-1)
    gray_rgb = cv2.cvtColor(gray_lab, cv2.COLOR_LAB2RGB)
    x = gray_rgb.transpose(2, 0, 1)[None].astype(np.float32)

    ab = sess.run(None, {sess.get_inputs()[0].name: x})[0][0].transpose(1, 2, 0)  # 256×256×2
    ab = cv2.resize(ab, (w, h)).astype(np.float32)

    # 近白区域（抠图白底、吹爆的高光）把色度收掉——模型爱给大片平坦白区上一层脏色。
    L = gray01 * 100.0
    ab *= np.where(L > 92.0, np.clip((100.0 - L) / 8.0, 0.0, 1.0), 1.0)[:, :, None]

    if abs(saturation - 1.0) > 1e-3:
        ab = np.clip(ab * saturation, -127.0, 127.0)

    out_lab = np.concatenate([gray01[:, :, None] * 100.0, ab], axis=-1).astype(np.float32)
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
