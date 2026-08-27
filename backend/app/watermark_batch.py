"""批量去重复水印：框选一个水印实例 → 模板匹配找出画面里所有相同的 → 合成蒙版 → inpaint 补掉。

纯本地 OpenCV，不额外调 AI（合规检测那次视觉调用另算）。适合平铺/重复的文字水印
（如 "SCJDGL" 斜向铺满整页）；对只出现一次的水印、或压在复杂图案上的效果有限。

内存：单张峰值和扫描件那条差不多（~150MB 级），无常驻模型。
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


def _nms(boxes: list[tuple[int, int, int, int]], iou_thr: float = 0.3) -> list[tuple[int, int, int, int]]:
    if not boxes:
        return []
    b = np.array(boxes, dtype=np.float32)
    x1, y1 = b[:, 0], b[:, 1]
    x2, y2 = b[:, 0] + b[:, 2], b[:, 1] + b[:, 3]
    area = b[:, 2] * b[:, 3]
    order = np.argsort(-area)
    keep = []
    while order.size:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou = inter / (area[i] + area[order[1:]] - inter + 1e-6)
        order = order[1:][iou < iou_thr]
    return [tuple(map(int, b[i])) for i in keep]


def remove_repeated(data: bytes, box: tuple[float, float, float, float],
                    threshold: float, feather: int) -> tuple[bytes, int]:
    """box 是 (x, y, w, h)，均为相对整图宽高的 0~1 比例。threshold 0.3~0.95，越低匹配越宽松。
    返回 (清理后的 PNG 字节, 匹配到的实例数)。"""
    img = _load(data)
    H, W = img.shape[:2]
    bx, by, bw, bh = box
    x0, y0 = int(bx * W), int(by * H)
    tw, th = max(8, int(bw * W)), max(8, int(bh * H))
    x0 = min(max(0, x0), W - tw)
    y0 = min(max(0, y0), H - th)
    tmpl = img[y0:y0 + th, x0:x0 + tw]
    if tmpl.size == 0:
        raise ValueError("框选区域无效")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gt = cv2.cvtColor(tmpl, cv2.COLOR_BGR2GRAY)
    res = cv2.matchTemplate(gray, gt, cv2.TM_CCOEFF_NORMED)
    thr = float(np.clip(threshold, 0.3, 0.97))
    ys, xs = np.where(res >= thr)
    if len(xs) == 0:
        thr = max(0.3, float(res.max()) - 0.03)
        ys, xs = np.where(res >= thr)
    boxes = _nms([(int(x), int(y), tw, th) for x, y in zip(xs, ys)])

    # 只抠"水印笔画"本身，不是整个矩形框——模板里比纸面暗一点、但没正文那么黑的像素，
    # 就是水印。这样蒙版贴合水印形状，inpaint 干净，也不会误伤框内的正文/图案。
    paper = float(np.median(gray))
    wm = ((gt < paper - 6) & (gt > paper - 95)).astype(np.uint8) * 255
    if wm.mean() < 10:
        # 模板里找不到"浅灰水印笔画"（可能是深色/彩色 logo 水印），退回整框抠
        wm = np.full_like(wm, 255)
    wm = cv2.dilate(wm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    mask = np.zeros((H, W), np.uint8)
    for (mx, my, mw, mh) in boxes:
        y2, x2 = min(my + mh, H), min(mx + mw, W)
        mask[my:y2, mx:x2] = np.maximum(mask[my:y2, mx:x2], wm[: y2 - my, : x2 - mx])

    f = max(1, min(feather, 20))
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (f * 2 + 1, f * 2 + 1)))
    out = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)

    ok, buf = cv2.imencode(".png", out)
    if not ok:
        raise ValueError("编码失败")
    return buf.tobytes(), len(boxes)
