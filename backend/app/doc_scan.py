"""照片转扫描件：本地 OpenCV，无 AI 模型，跟 detect-face / 去红眼一样零 openlux 依赖。

流程：EXIF 摆正 → 限尺寸 → 自动找文档四边做透视校正（失败退回整图）→ 按背景光照归一化
把纸面拉白 → 按模式出黑白/灰度/彩色。多张在上层拼成一个 PDF。

内存：单页峰值约 150~250MB（12MP 照片，几个 float32 副本），一张处理完就释放，
多页不累积——没有常驻模型，2 核 2GB 机器无压力。
"""
import io

import cv2
import numpy as np
from PIL import Image, ImageOps

_MAX_SIDE = 2400


def _load(data: bytes) -> np.ndarray:
    """PIL 读（带 EXIF 方向修正）→ BGR ndarray → 限制长边。cv2.imdecode 不认 EXIF，所以走 PIL。"""
    try:
        pil = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:
        raise ValueError("无法解析图片")
    img = cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    s = _MAX_SIDE / max(h, w)
    if s < 1:
        img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    return img


def _order_points(pts: np.ndarray) -> np.ndarray:
    """四点排成 左上 右上 右下 左下。用坐标和/差判断，跟旋转无关。"""
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array(
        [pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]],
        dtype=np.float32,
    )


def _detect_and_warp(img: np.ndarray) -> np.ndarray | None:
    """找最大的四边形轮廓（且要占画面 1/4 以上）当作纸张边界，做透视校正拉正。"""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 60, 180)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:6]:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(approx) > 0.22 * h * w:
            quad = _order_points(approx.reshape(4, 2).astype(np.float32))
            (tl, tr, br, bl) = quad
            out_w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
            out_h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
            if out_w < 100 or out_h < 100:
                return None
            dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
            m = cv2.getPerspectiveTransform(quad, dst)
            return cv2.warpPerspective(img, m, (out_w, out_h))
    return None


def _flatten(gray: np.ndarray) -> np.ndarray:
    """按背景光照归一化：大核膨胀+模糊估出"纸面"亮度，原图除以它，阴影/偏黄的纸被拉成均匀白。"""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    bg = cv2.morphologyEx(gray, cv2.MORPH_DILATE, k)
    bg = cv2.GaussianBlur(bg, (0, 0), 17)
    norm = gray.astype(np.float32) / np.maximum(bg.astype(np.float32), 1.0)
    return np.clip(norm * 255.0, 0, 255).astype(np.uint8)


def scan_page(data: bytes, mode: str, auto_crop: bool) -> Image.Image:
    """mode: bw（黑白二值，最清晰）/ gray（灰度，留印章手写）/ color（彩色增强）。"""
    img = _load(data)
    if auto_crop:
        warped = _detect_and_warp(img)
        if warped is not None:
            img = warped

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    flat = _flatten(gray)

    if mode == "bw":
        bw = cv2.adaptiveThreshold(
            flat, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 12
        )
        bw = cv2.medianBlur(bw, 3)  # 去掉零星噪点
        return Image.fromarray(bw).convert("1")

    if mode == "gray":
        # 简单 levels：纸面提到接近纯白、字迹压深，不用 CLAHE（局部均衡会把平坦背景的噪点放大）
        g = np.clip((flat.astype(np.float32) - 25) * 1.18, 0, 255).astype(np.uint8)
        return Image.fromarray(g).convert("L")

    # color：用灰度背景比例把每个通道的光照拉平，再轻微提饱和/对比
    bg = cv2.GaussianBlur(cv2.morphologyEx(gray, cv2.MORPH_DILATE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))), (0, 0), 17)
    ratio = 255.0 / np.maximum(bg.astype(np.float32), 1.0)
    out = np.clip(img.astype(np.float32) * ratio[..., None], 0, 255).astype(np.uint8)
    hsv = cv2.cvtColor(out, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] = np.clip(hsv[..., 1] * 1.15, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))


def pages_to_pdf(pages: list[Image.Image]) -> bytes:
    buf = io.BytesIO()
    pages[0].save(
        buf, format="PDF", save_all=True, append_images=pages[1:], resolution=200.0
    )
    return buf.getvalue()
