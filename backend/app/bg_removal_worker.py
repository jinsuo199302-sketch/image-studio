"""独立子进程跑 rembg 抠图 + 边缘后处理，跟主 FastAPI 进程隔离——分割模型稳定态占用约 1GB RSS，
如果常驻在长期运行的 web worker 进程里，2 核 2GB 的小机器扛不住。每次调用都是新进程，
处理完立刻退出，内存马上还给系统。stdin 读原图字节，stdout 写抠图后的透明 PNG 字节。

argv[1] 是边缘模式：
  soft（默认）——只做轻微收紧，尽量保留发丝等细节，适合电商图 / 自由创作
  hard        ——强收紧 + 收边 1px + trimap 兜底 + 边缘去色，输出接近照相馆的硬边，
                适合证件照 / 黑白遗像这类要贴纯色底的场景

rembg 的 remove() 默认直接吐合成好的 PNG，边缘是模型概率图的软过渡，贴到纯色底上就
"发虚、不像正规照相馆"。两处改动：
  1. 模型从 u2net 换成 isnet-general-use——u2net 内部把图缩到 320×320 出 mask 再放大回
     原图，天生带 5~6px 羽化；isnet 内部用 1024×1024，边缘细多了。体积/内存两者相当
     （都约 176MB / 稳定态 ~1GB RSS），换了首次要重新下一次模型。
  2. 只取 mask（only_mask），alpha 自己做后处理（收紧 / trimap / 收边 / 去色）再合成。
"""
import io
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps
from rembg import new_session, remove

_MODEL = "isnet-general-use"

# isnet 模型稳定态就吃掉 ~1GB，后处理阶段每个 float32 HxW 数组又是 W*H*4 字节，
# 大图上叠起来能把 2 核 2GB 的机器逼到 OOM。isnet 内部按 1024 出 mask，
# 源图长边超过 2400 再多的像素对边缘精度收益很小（10 寸遗像 300dpi 也才 ~2400px），
# 先等比缩到 2400 以内，纯粹是内存安全阀。
_MAX_SIDE = 2400


def _tighten(alpha: np.ndarray, window: float, center: float = 0.5) -> np.ndarray:
    """把 0~1 的软 alpha 过渡带压窄：以 center 为中心做线性 S 曲线，window 越小边越硬，
    center 往上抬则要更高的 alpha 才算前景，等于把边往里收。"""
    return np.clip((alpha - center) / window + 0.5, 0.0, 1.0)


def _process_soft(alpha: np.ndarray) -> np.ndarray:
    """轻收紧：过渡带从十几像素压到 2~3 像素，但不做 trimap / 收边，发丝这类细节基本保留。"""
    alpha = _tighten(alpha, 0.55)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.5)
    return alpha


def _process_hard(rgb: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """照相馆风格硬边。返回去色后的 RGB 和处理过的 alpha。"""
    h, w = alpha.shape
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    # 1. 二值轮廓上做开+闭运算，去掉毛刺、背景孤立小点、以及轮廓上的小缺口
    binary = (alpha > 0.5).astype(np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, k3)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, k3)

    # 2. trimap 兜底：确定前景 / 确定背景之外的窄带才允许软过渡，
    #    肩膀、衣领这些本该是直线的地方强制成硬边，只有头发边缘留一点软。
    #    "确定背景"侧比"确定前景"侧多逼近 1px（kb2 比 kb 小一圈），把飘在外面
    #    那半圈半透明羽化直接归零——白发贴白墙时模型在最外侧给的都是没意义的弱信号。
    band = max(2, round(min(h, w) * 0.004))
    kb = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (band * 2 + 1, band * 2 + 1))
    kb2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1, band - 1) * 2 + 1,) * 2)
    sure_fg = cv2.erode(binary, kb)
    sure_bg = cv2.dilate(binary, kb2)

    out = _tighten(alpha, 0.30, center=0.56)
    out[sure_fg == 1] = 1.0
    out[sure_bg == 0] = 0.0

    # 3. 收边 1px：削掉最外圈最不可信的半透明像素
    out = cv2.erode(out, k3)

    # 4. 0.6px 抗锯齿，匹配真实相机的自然边缘（完全刀切反而假）
    out = cv2.GaussianBlur(out, (0, 0), 0.6)

    # 5. 边缘去色：轮廓那圈半透明像素混着原背景色，直接贴纯底会留一条脏描边。
    #    把"贴着轮廓、alpha 没到 0.9"的鬼影像素，换成最近那个可信前景像素的颜色。
    #    用距离变换的标签图取最近不透明点——比 cv2.inpaint 干净，inpaint 会把外侧透明区
    #    里残留的背景色也当已知邻居采进来。
    opaque = (out > 0.9).astype(np.uint8)
    halo = (cv2.dilate(opaque, kb) == 1) & (opaque == 0)
    if halo.any() and opaque.any():
        _, labels = cv2.distanceTransformWithLabels(
            1 - opaque, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL
        )
        ys, xs = np.where(opaque == 1)
        own = labels[ys, xs]  # 每个不透明像素在标签图里的自身标签（到自己距离为 0）
        lut_y = np.zeros(int(own.max()) + 1, np.intp)
        lut_x = np.zeros(int(own.max()) + 1, np.intp)
        lut_y[own] = ys
        lut_x[own] = xs
        lab = labels[halo]
        rgb[halo] = rgb[lut_y[lab], lut_x[lab]]

    return rgb, out


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "soft"

    image_bytes = sys.stdin.buffer.read()
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")

    if max(img.size) > _MAX_SIDE:
        scale = _MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)

    session = new_session(_MODEL)
    mask = remove(img, session=session, only_mask=True)

    rgb = np.array(img)
    alpha = np.asarray(mask).astype(np.float32) / 255.0

    if mode == "hard":
        rgb, alpha = _process_hard(rgb, alpha)
    else:
        alpha = _process_soft(alpha)

    rgba = np.dstack([rgb, np.clip(alpha * 255.0, 0, 255).astype(np.uint8)])
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, "PNG")
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == "__main__":
    main()
