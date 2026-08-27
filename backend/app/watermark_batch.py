"""批量去重复水印：框选一个水印实例 → 模板匹配找出画面里所有相同的 → 按水印笔画形状
合成蒙版 → cv2.inpaint 补掉。

纯本地 OpenCV，不额外调 AI（合规检测那次视觉调用另算）。best-effort：
- 适合颜色/形态一致的平铺文字水印
- 水印很淡、跟背景几乎同色、或每处被不同图案盖住时，可能只去掉一部分
  —— 剩下的用「涂抹消除」补

内存：单张峰值 ~150MB 级，无常驻模型。
"""
import io

import cv2
import numpy as np
from PIL import Image, ImageOps

_MAX_SIDE = 2600


def _load(data: bytes) -> np.ndarray:
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


def _merge_hits(pts: list[tuple[int, int]], tw: int, th: int) -> list[tuple[int, int]]:
    """一个水印周围会有一小片高分像素，按距离归并成一个点。"""
    if not pts:
        return []
    p = np.array(pts, dtype=np.float32)
    used = np.zeros(len(p), bool)
    keep = []
    for i in range(len(p)):
        if used[i]:
            continue
        near = (np.abs(p[:, 0] - p[i, 0]) < tw * 0.6) & (np.abs(p[:, 1] - p[i, 1]) < th * 0.6)
        used |= near
        keep.append(tuple(p[near].mean(axis=0).astype(int)))
    return keep


def remove_repeated(data: bytes, box: tuple[float, float, float, float],
                    threshold: float, feather: int) -> tuple[bytes, int]:
    """box = (x, y, w, h)，均为相对整图宽高的 0~1。threshold 越低匹配越宽松。
    返回 (清理后的 PNG 字节, 去除的实例数)。"""
    img = _load(data)
    H, W = img.shape[:2]
    bx, by, bw, bh = box
    x0, y0 = int(bx * W), int(by * H)
    tw, th = max(8, int(bw * W)), max(8, int(bh * H))
    x0 = min(max(0, x0), W - tw)
    y0 = min(max(0, y0), H - th)
    if tw < 8 or th < 8:
        raise ValueError("框选区域太小")

    grayf = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gt = grayf[y0:y0 + th, x0:x0 + tw]

    # 水印笔画掩码：模板里偏离局部背景一点点的像素（水印一般半透明、低对比）
    paper = float(np.median(grayf))
    stroke = ((gt < paper - 4) & (gt > paper - 120)).astype(np.float32)
    if stroke.mean() < 0.03:  # 找不到浅色笔画 => 深色/彩色 logo 水印，退回整框
        stroke = np.ones_like(stroke)

    # 高通图（去掉背景低频）+ 笔画掩码做匹配，对压在杂乱背景上的实例更稳
    hp = grayf - cv2.GaussianBlur(grayf, (0, 0), 5)
    hpt = hp[y0:y0 + th, x0:x0 + tw]
    res = cv2.matchTemplate(hp, hpt, cv2.TM_CCORR_NORMED, mask=stroke)
    res = np.nan_to_num(res, nan=0.0, posinf=0.0, neginf=0.0)

    thr = float(np.clip(threshold, 0.2, 0.97))
    ys, xs = np.where(res >= thr)
    if len(xs) < 2:
        thr = max(0.2, float(res.max()) - 0.05)
        ys, xs = np.where(res >= thr)
    hits = _merge_hits(list(zip(xs.tolist(), ys.tolist())), tw, th)

    sm = cv2.dilate((stroke * 255).astype(np.uint8),
                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    mask = np.zeros((H, W), np.uint8)
    for (mx, my) in hits:
        sx, sy = max(0, mx), max(0, my)
        ex, ey = min(mx + tw, W), min(my + th, H)
        if ex <= sx or ey <= sy:
            continue
        mask[sy:ey, sx:ex] = np.maximum(mask[sy:ey, sx:ex], sm[sy - my:ey - my, sx - mx:ex - mx])

    f = max(1, min(feather, 20))
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (f * 2 + 1, f * 2 + 1)))
    out = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)

    ok, buf = cv2.imencode(".png", out)
    if not ok:
        raise ValueError("编码失败")
    return buf.tobytes(), len(hits)
