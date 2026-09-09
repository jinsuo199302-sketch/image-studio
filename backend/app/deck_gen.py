"""AI PPT 一期：LLM 大纲 → 排成一套幻灯片（每页 = elements 数组 + 背景，跟手抄报同结构），
再用 python-pptx 导出成可在 PowerPoint 里改的原生形状。

排版走一套设计系统（统一页边距/字号阶梯/栅格/留白），内容页按要点条数选不同版式，
章节轮换强调色 —— 目标是"像资深平面设计师排的"，而不是每页一个模板套死。

背景 / 装饰可以是 AI 生成的整图（build_deck 传 bg={"cover":url,"content":url,"section":url}），
没有就用代码画的简版（纯色块 + 巨号水印）。大纲和 AI 生图都在 ai_proxy 里做，这里不联网。
"""

from __future__ import annotations

import io

from app.text_metrics import estimate_text_height, estimate_text_lines

W, H = 1280, 720           # 16:9
M = 76                     # 页边距
CW = W - 2 * M             # 内容区宽

# 字号阶梯
DISPLAY, H1, H2, H3, BODY, CAP = 58, 40, 26, 19, 16, 13

# ── 主题：一组配色 + 字体。palette 可由 LLM 给，缺了用这里兜底 ──────
_FALLBACK = {
    "red":    ["#b01f24", "#d99b2b", "#8c1519", "#f4f4f4", "#2b2b2b"],
    "blue":   ["#1f4e9c", "#e0a52b", "#16336b", "#f5f6f8", "#2b2b2b"],
    "green":  ["#2f7d55", "#e0a52b", "#1f5c3d", "#f4f7f5", "#2b2b2b"],
    "purple": ["#6b4ea8", "#e0a52b", "#463079", "#f6f4fa", "#2b2b2b"],
    "slate":  ["#37506b", "#c98a3c", "#243447", "#f4f6f8", "#2b2b2b"],
    "teal":   ["#1f7a72", "#e0a52b", "#134b46", "#f2f7f6", "#2b2b2b"],
    "dark":   ["#e8b04b", "#3f7cc4", "#c8963a", "#1c2230", "#f2f2f2"],
}


def apply_theme_palette(outline: dict, theme_key: str) -> dict:
    """用户选了具体配色主题（非 auto）时，用固定 palette 覆盖 LLM 给的，让结果可预期。
    auto / 未知 key 保持 LLM 的 palette 不动。"""
    if theme_key and theme_key != "auto" and theme_key in _FALLBACK:
        outline = dict(outline)
        outline["palette"] = list(_FALLBACK[theme_key])
    return outline


def _mk_theme(theme_key: str, palette: list[str] | None) -> dict:
    p = list(palette) if palette and len(palette) >= 3 else _FALLBACK.get(theme_key, _FALLBACK["red"])
    while len(p) < 5:
        p.append("#f4f4f4" if len(p) == 3 else "#2b2b2b")
    primary, accent, primary_dk, paper, ink = p[0], p[1], p[2], p[3], p[4]
    dark = theme_key == "dark"
    return {
        "primary": primary,
        "accent": accent,
        "primary_dk": primary_dk,
        "paper": paper if not dark else primary_dk,
        "ink": ink,
        "muted": "#8a8a8a" if not dark else "#b9b9b9",
        "soft": _mix(primary, "#ffffff", 0.86),
        "panel": "#ffffff" if not dark else _mix(primary_dk, "#000000", 0.25),
        "on_primary": "#ffffff",
        "dark": dark,
        "title_font": '"ZCOOL KuaiLe", "Noto Sans SC", sans-serif',
        "kicker_font": '"Oswald", "Noto Sans SC", sans-serif',
        "body_font": '"Noto Sans SC", sans-serif',
    }


def _hex(c: str) -> tuple[int, int, int]:
    h = (c or "#000000").lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _mix(a: str, b: str, t: float) -> str:
    ra, ga, ba = _hex(a)
    rb, gb, bb = _hex(b)
    return "#%02x%02x%02x" % (
        round(ra + (rb - ra) * t), round(ga + (gb - ga) * t), round(ba + (bb - ba) * t))


_CN = "零一二三四五六七八九十"


def _cn(n: int) -> str:
    if n <= 10:
        return _CN[n]
    if n < 20:
        return "十" + _CN[n - 10]
    return _CN[n // 10] + "十" + (_CN[n % 10] if n % 10 else "")


# ── 元素工厂 ──────────────────────────────────────────────────────
def _t(x, y, w, text, size, color, *, align="left", bold=False, font=None, stroke=None, sw=0.0, spacing=0):
    e = {"type": "text", "x": round(x), "y": round(y), "width": round(w), "text": str(text),
         "fontSize": round(size), "color": color, "align": align}
    if bold:
        e["fontWeight"] = "bold"
    if font:
        e["fontFamily"] = font
    if stroke:
        e["stroke"] = stroke
        e["strokeWidth"] = sw
    if spacing:
        e["letterSpacing"] = spacing
    return e


def _r(x, y, w, h, fill, *, rx=0, stroke=None, sw=0.0):
    e = {"type": "rect", "x": round(x), "y": round(y), "width": round(w), "height": round(h),
         "fill": fill, "rx": round(rx)}
    if stroke:
        e["stroke"] = stroke
        e["strokeWidth"] = sw
    return e


def _img(x, y, w, h, src):
    return {"type": "image", "x": round(x), "y": round(y), "width": round(w), "height": round(h), "src": src}


def _line(x1, y1, x2, y2, stroke, sw=2):
    return {"type": "line", "x1": round(x1), "y1": round(y1), "x2": round(x2), "y2": round(y2),
            "stroke": stroke, "strokeWidth": sw}


def _circle(cx, cy, r, *, fill=None, stroke=None, sw=0.0):
    e = {"type": "circle", "cx": round(cx), "cy": round(cy), "r": round(r), "fill": fill or "none"}
    if stroke:
        e["stroke"] = stroke
        e["strokeWidth"] = sw
    return e


# ── 简版线性图标：几笔 line/circle/rect 拼出来，都在 [-1,1] 单位坐标里 ──
def _icon(name: str, cx: float, cy: float, size: float, color: str) -> list[dict]:
    """简单线性图标，2~4 笔，坐标在 [-1,1]。size = 图标直径。"""
    s = size / 2
    sw = max(2.4, size * 0.08)
    L = lambda a, b, cc, d: _line(cx + a * s, cy + b * s, cx + cc * s, cy + d * s, color, sw)  # noqa: E731
    C = lambda a, b, rr: _circle(cx + a * s, cy + b * s, rr * s, stroke=color, sw=sw)  # noqa: E731
    m = {
        "check": [C(0, 0, 0.92), L(-0.4, 0.02, -0.12, 0.32), L(-0.12, 0.32, 0.42, -0.3)],
        "target": [C(0, 0, 0.92), _circle(cx, cy, s * 0.3, fill=color)],
        "flag": [L(-0.42, -0.7, -0.42, 0.72), L(-0.42, -0.62, 0.5, -0.36), L(0.5, -0.36, -0.42, -0.06)],
        "doc": [L(-0.42, -0.72, -0.42, 0.72), L(0.36, -0.72, 0.36, 0.72), L(-0.42, -0.72, 0.36, -0.72),
                L(-0.42, 0.72, 0.36, 0.72), L(-0.22, -0.12, 0.16, -0.12), L(-0.22, 0.2, 0.16, 0.2)],
        "bulb": [C(0, -0.18, 0.62), L(-0.22, 0.52, 0.22, 0.52), L(-0.16, 0.74, 0.16, 0.74)],
        "gear": [C(0, 0, 0.5), L(0, -0.92, 0, -0.5), L(0, 0.92, 0, 0.5), L(-0.92, 0, -0.5, 0), L(0.92, 0, 0.5, 0)],
        "up": [L(0, 0.72, 0, -0.72), L(0, -0.72, -0.4, -0.28), L(0, -0.72, 0.4, -0.28)],
        "shield": [L(-0.5, -0.5, 0, -0.72), L(0, -0.72, 0.5, -0.5), L(-0.5, -0.5, -0.5, 0.14),
                   L(0.5, -0.5, 0.5, 0.14), L(-0.5, 0.14, 0, 0.74), L(0.5, 0.14, 0, 0.74)],
        "chat": [L(-0.6, -0.48, 0.6, -0.48), L(-0.6, 0.28, 0.28, 0.28), L(-0.6, -0.48, -0.6, 0.28),
                 L(0.6, -0.48, 0.6, 0.28), L(-0.4, 0.28, -0.4, 0.6), L(-0.4, 0.6, -0.02, 0.28)],
        "star": [L(0, -0.7, 0.28, 0.5), L(0.28, 0.5, -0.66, -0.24), L(-0.66, -0.24, 0.66, -0.24),
                 L(0.66, -0.24, -0.28, 0.5), L(-0.28, 0.5, 0, -0.7)],
    }
    return m.get(name, m["check"])


_ICON_CYCLE = ["target", "check", "bulb", "flag", "shield", "up", "chat", "star"]


def _bg_layer(t: dict, bg_url: str | None, kind: str) -> list[dict]:
    """整页背景层：有 AI 图铺图，没有就代码画（克制：不挡文字区）。"""
    if bg_url:
        return [_img(0, 0, W, H, bg_url)]
    base = t["primary_dk"] if t["dark"] else t["paper"]
    if kind in ("cover", "section"):
        return [
            _r(0, 0, W, H, base),
            _r(0, 0, W, 10, t["primary"]),
            _r(0, 0, 22, H, t["primary"]),
            _r(0, 0, 22, 120, t["accent"]),
            _r(0, H - 10, W, 10, t["primary"]),
            _r(W - 260, H - 260, 260, 260, t["soft"]),
        ]
    return [
        _r(0, 0, W, H, base),
        _r(0, 0, 12, H, t["primary"]),
        _r(W - 170, 0, 170, 170, t["soft"]),
    ]


# ── 页型 ─────────────────────────────────────────────────────────
def _fit_size(text: str, box_w: float, base: float, max_lines: int = 2) -> float:
    """标题太长就缩字号，尽量控制在 max_lines 行内。"""
    size = base
    while size > base * 0.55 and estimate_text_lines(text, box_w, size) > max_lines:
        size -= 2
    return size


def _cover(t: dict, title: str, subtitle: str, bg: str | None, cover_image: str | None = None) -> dict:
    if cover_image and not bg:
        # 用户上传的真实照片当封面主图：右 46% 放图，左侧留白放标题
        pic_w = W * 0.46
        els = [
            _r(0, 0, W, H, "#ffffff"),
            _img(W - pic_w, 0, pic_w, H, cover_image),
            _r(0, 0, 16, H, t["primary"]),
            _r(0, 0, 16, 128, t["accent"]),
        ]
        box_w = W - pic_w - M - 40
        tsize = _fit_size(title, box_w, DISPLAY, 3)
        tlines = estimate_text_lines(title, box_w, tsize)
        title_h = tsize * (1 + 1.15 * (tlines - 1))
        els += [
            _t(M + 12, 176, box_w, "KEYNOTE PRESENTATION", CAP, t["accent"], bold=True,
               font=t["kicker_font"], spacing=4),
            _t(M + 12, 220, box_w, title, tsize, t["primary_dk"], bold=True, font=t["title_font"]),
            _r(M + 16, 220 + title_h + 22, 84, 6, t["accent"]),
        ]
        yy = 220 + title_h + 52
        if subtitle:
            els.append(_t(M + 12, yy, box_w, subtitle, H3, t["muted"]))
            yy += estimate_text_height(subtitle, box_w, H3) + 24
        els += [
            _t(M + 12, max(yy, H - 150), 400, "汇报单位：____________", CAP, t["muted"]),
            _t(M + 12, max(yy, H - 150) + 26, 400, "汇报时间：____________", CAP, t["muted"]),
        ]
        return {"background": "#ffffff", "elements": els, "w": W, "h": H}

    on_img = bg is not None
    els = _bg_layer(t, bg, "cover")
    tsize = _fit_size(title, CW * 0.66, DISPLAY, 2)
    tlines = estimate_text_lines(title, CW * 0.66, tsize)
    title_h = tsize * (1 + 1.15 * (tlines - 1))
    scol = t["muted"]
    ty = 216 + title_h + 42
    foot = ty + (46 if subtitle else 0) + 26
    if on_img:
        # AI 背景不可控，标题区放一块浅色卡片，深色字压上去，保证能看清
        els.append(_r(M - 12, 150, CW * 0.70, foot + 64 - 150, "rgba(255,255,255,0.88)", rx=8))
    els += [
        _t(M + 16, 172, CW * 0.66, "KEYNOTE PRESENTATION", CAP, t["accent"], bold=True, font=t["kicker_font"], spacing=4),
        _t(M + 16, 216, CW * 0.66, title, tsize, t["primary"], bold=True, font=t["title_font"]),
        _r(M + 20, 216 + title_h + 22, 84, 6, t["accent"]),
    ]
    if subtitle:
        els.append(_t(M + 16, ty, CW * 0.66, subtitle, H3, scol))
    els += [
        _t(M + 16, foot, 400, "汇报单位：____________", CAP, scol),
        _t(M + 16, foot + 26, 400, "汇报时间：____________", CAP, scol),
    ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _toc(t: dict, sections: list[dict], bg: str | None) -> dict:
    els = _bg_layer(t, bg, "content")
    hcol = "#ffffff" if t["dark"] else t["primary"]
    els += [
        _t(M + 40, 96, CW, "目录", H1, hcol, bold=True, font=t["title_font"]),
        _t(M + 44, 150, 300, "CONTENTS", CAP, t["accent"], bold=True, font=t["kicker_font"], spacing=3),
        _r(M + 44, 176, 64, 4, t["accent"]),
    ]
    rows = sections[:6]
    two_col = len(rows) > 4
    top, rh = 236, 84 if not two_col else 140
    ox = M + 40
    aw = CW - 40
    col_w = (aw - 40) / 2 if two_col else aw
    for i, sec in enumerate(rows):
        col = i % 2 if two_col else 0
        row = i // 2 if two_col else i
        x = ox + col * (col_w + 40)
        y = top + row * rh
        els += [
            _t(x, y - 10, 70, f"{i + 1:02d}", H1, _mix(t["primary"], t["paper"], 0.3), bold=True, font=t["kicker_font"]),
            _t(x + 78, y + 4, col_w - 90, sec.get("heading", ""), H3, t["ink"], bold=True),
            _r(x + 78, y + 40, col_w - 90, 2, _mix(t["ink"], t["paper"], 0.82)),
        ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _section(t: dict, idx: int, total: int, heading: str, en: str, bg: str | None) -> dict:
    """章节过渡页：深底（AI 背景不可控，标题区一律压一块深色卡片保证可读）。"""
    dk = t["primary_dk"]
    if bg:
        els = [_img(0, 0, W, H, bg),
               _r(M - 20, 360, CW * 0.62, 220, "rgba(15,18,24,0.55)", rx=10)]
        px = M + 12
    else:
        els = [
            _r(0, 0, W, H, dk),
            _r(0, 0, W, 6, t["accent"]),
            _r(W - 300, H - 300, 300, 300, _mix(dk, "#ffffff", 0.06)),
            _t(M, 250, CW + 12, f"{idx:02d}", 168, _mix(t["accent"], dk, 0.62), bold=True, font=t["kicker_font"]),
        ]
        px = M + 6
    els += [
        _t(px, 392, 420, f"PART {idx:02d} / {total:02d}", H3, t["accent"], bold=True, font=t["kicker_font"], spacing=6),
        _t(px, 432, CW - 40, heading, _fit_size(heading, CW - 40, H1, 2), "#ffffff", bold=True, font=t["title_font"]),
        _r(px + 4, 524, 72, 4, t["accent"]),
    ]
    if en:
        els.append(_t(px + 4, 540, CW - 40, en, CAP, "rgba(255,255,255,0.55)", font=t["kicker_font"], spacing=3))
    return {"background": dk, "elements": els, "w": W, "h": H}


_EN_CAP = ["OVERVIEW", "ANALYSIS", "KEY POINTS", "ACTION PLAN", "SUMMARY", "OUTLOOK"]


def _content_head(t: dict, title: str, en: str, page: int, bg: str | None) -> tuple[list[dict], float]:
    """居中标题 + 两侧短线 + 下方英文小字（模仿主流模板的内容页页眉）。
    内容页的 AI 背景按提示词是接近纯白的，所以正文和标题一律用深色。"""
    els = _bg_layer(t, bg, "content")
    hcol = "#ffffff" if t["dark"] else t["primary"]
    lcol = t["accent"]
    # 标题居中，两侧各一条短线
    tw = min(CW * 0.7, 120 + len(title) * H2 * 0.9)
    cx = W / 2
    els += [
        _t(M, 52, CW, title, H2, hcol, align="center", bold=True, font=t["title_font"]),
        _r(cx - tw / 2 - 46, 52 + H2 * 0.6, 32, 3, lcol),
        _r(cx + tw / 2 + 14, 52 + H2 * 0.6, 32, 3, lcol),
        _t(M, 52 + H2 * 1.25 + 6, CW, en or "", CAP, _mix(hcol, t["paper"], 0.35), align="center",
           font=t["kicker_font"], spacing=3),
        _t(W - M - 60, 44, 60, f"{page:02d}", CAP, _mix(hcol, t["paper"], 0.4), align="right", font=t["kicker_font"]),
    ]
    return els, 52 + H2 * 1.25 + 34


def _content(t: dict, sec_idx: int, title: str, en: str, intro: str, bullets: list[str], page: int,
             bg: str | None, image: str | None = None) -> dict:
    els, y = _content_head(t, title, en or _EN_CAP[sec_idx % len(_EN_CAP)], page, bg)
    items = [b for b in bullets if b][:5]

    if image:
        # 图文分栏：一侧放用户照片，另一侧标题下的要点。左右按章节奇偶交替
        ink = t["ink"]
        img_left = sec_idx % 2 == 0
        gap = 46
        img_w = CW * 0.44
        txt_w = CW - img_w - gap
        top = y + 6
        h_area = (H - 56) - top
        img_x = M if img_left else M + txt_w + gap
        txt_x = (M + img_w + gap) if img_left else M
        els.append(_img(img_x, top, img_w, h_area, image))
        ty = top + 4
        if intro:
            els.append(_t(txt_x, ty, txt_w, intro, BODY, t["muted"]))
            ty += estimate_text_height(intro, txt_w, BODY) + 20
        for b in items:
            bh = estimate_text_height(b, txt_w - 24, BODY)
            els += [
                _circle(txt_x + 5, ty + BODY * 0.7, 3.5, fill=t["accent"]),
                _t(txt_x + 22, ty, txt_w - 24, b, BODY, ink),
            ]
            ty += bh + 18
        return {"background": t["paper"], "elements": els, "w": W, "h": H}

    if intro:
        ih = estimate_text_height(intro, CW - 120, BODY)
        els.append(_t(M + 60, y, CW - 120, intro, BODY, t["muted"], align="center"))
        y += ih + 26
    bottom = H - 60
    n = len(items)

    # 内容页 AI 背景是浅色的，正文一律深色
    ink = t["ink"]
    sub = _mix(ink, t["paper"], 0.5)
    rule = _mix(ink, t["paper"], 0.85)

    if n == 1:
        # 一句话 → 居中引言
        b = items[0]
        my = y + (bottom - y) / 2 - 60
        els += [
            _t(W / 2 - 40, my - 40, 80, "“", 80, t["accent"], align="center", bold=True, font=t["title_font"]),
            _t(M + 100, my + 40, CW - 200, b, H3, ink, align="center"),
            _r(W / 2 - 28, my + 40 + estimate_text_height(b, CW - 200, H3) + 24, 56, 3, t["accent"]),
        ]
    elif n == 2:
        gap = 60
        cw = (CW - gap) / 2
        cy = y + 56
        for i, b in enumerate(items):
            x = M + i * (cw + gap)
            ic = _ICON_CYCLE[(sec_idx * 2 + i) % len(_ICON_CYCLE)]
            els += [
                _circle(x + cw / 2, cy, 36, stroke=t["accent"], sw=2.2),
                *_icon(ic, x + cw / 2, cy, 40, t["accent"]),
                _t(x + cw / 2 - 30, cy + 46, 60, f"0{i + 1}", CAP, _mix(ink, t["paper"], 0.45), align="center", font=t["kicker_font"], spacing=2),
                _t(x, cy + 76, cw, b, H3, ink, align="center"),
            ]
            if i == 0:
                els.append(_r(M + cw + gap / 2 - 1, y + 24, 2, bottom - y - 70, rule))
    elif n == 3:
        gap = 40
        cw = (CW - 2 * gap) / 3
        cy = y + 48
        for i, b in enumerate(items):
            x = M + i * (cw + gap)
            ic = _ICON_CYCLE[(sec_idx * 3 + i) % len(_ICON_CYCLE)]
            els += [
                _circle(x + cw / 2, cy, 38, stroke=_mix(t["primary"], t["paper"], 0.1), sw=2.2),
                *_icon(ic, x + cw / 2, cy, 42, t["primary"]),
                _r(x + cw / 2 - 14, cy + 58, 28, 3, t["accent"]),
                _t(x + 12, cy + 76, cw - 24, b, BODY, ink, align="center"),
            ]
    else:
        # 4~5 条 → 竖排清单，圆圈序号 + 分隔线，留白足
        avail = bottom - y - 10
        size = BODY
        for _ in range(3):
            hs = [estimate_text_height(b, CW - 110, size) for b in items]
            if sum(h + 34 for h in hs) <= avail or size <= 13:
                break
            size -= 1
        hs = [estimate_text_height(b, CW - 110, size) for b in items]
        y += 6
        for i, b in enumerate(items):
            row_h = hs[i]
            cyy = y + max(row_h, 40) / 2
            els += [
                _r(M, cyy - 19, 38, 38, "none", rx=19, stroke=t["accent"], sw=2),
                _t(M, cyy - 11, 38, f"{i + 1:02d}", CAP + 1, t["accent"], align="center", bold=True, font=t["kicker_font"]),
                _t(M + 66, cyy - row_h / 2, CW - 110, b, size, ink),
            ]
            y += max(row_h, 40) + 34
            if i < n - 1:
                els.append(_r(M + 66, y - 20, CW - 110, 1, rule))
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _num(v) -> float:
    try:
        return float(str(v).replace("%", "").replace(",", "").strip())
    except Exception:
        return 0.0


def _chart(t: dict, sec_idx: int, title: str, en: str, kind: str, items: list[dict], page: int, bg: str | None) -> dict:
    els, y = _content_head(t, title, en or "DATA", page, bg)
    ink = t["ink"]
    rows = [it for it in items if it.get("label")][:6]
    bottom = H - 70
    if not rows:
        return {"background": t["paper"], "elements": els, "w": W, "h": H}

    if kind == "stat":
        n = len(rows[:4])
        gap = 40
        cw = (CW - (n - 1) * gap) / n
        cy = y + (bottom - y) / 2 - 60
        for i, it in enumerate(rows[:4]):
            x = M + i * (cw + gap)
            els += [
                _t(x, cy, cw, str(it.get("value", "")), 66, t["primary"],
                   align="center", bold=True, font=t["kicker_font"]),
                _r(x + cw / 2 - 16, cy + 84, 32, 3, t["accent"]),
                _t(x, cy + 100, cw, it.get("label", ""), BODY, ink, align="center"),
            ]
            if i:
                els.append(_r(x - gap / 2, cy + 6, 1, 100, _mix(ink, t["paper"], 0.85)))
    else:  # bar：横向条形
        vals = [_num(it.get("value")) for it in rows]
        mx = max(vals) or 1
        avail = bottom - y - 10
        rh = min(64, avail / len(rows))
        bx = M + 220
        bw_max = W - M - bx - 90
        for i, it in enumerate(rows):
            ry = y + 10 + i * rh
            bw = max(6, bw_max * (_num(it.get("value")) / mx))
            els += [
                _t(M, ry + rh / 2 - 12, 200, it.get("label", ""), BODY, ink),
                _r(bx, ry + rh / 2 - 9, bw_max, 18, _mix(t["primary"], t["paper"], 0.9), rx=9),
                _r(bx, ry + rh / 2 - 9, bw, 18, t["primary"] if i % 2 == 0 else t["accent"], rx=9),
                _t(bx + bw + 12, ry + rh / 2 - 12, 90, str(it.get("value", "")), BODY, t["primary"], bold=True, font=t["kicker_font"]),
            ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _compare(t: dict, sec_idx: int, title: str, en: str, cmp: dict, page: int, bg: str | None) -> dict:
    """对比页：左右两栏，各一个标题 + 要点组。左栏主色描边，右栏强调色描边。"""
    els, y = _content_head(t, title, en or _EN_CAP[sec_idx % len(_EN_CAP)], page, bg)
    ink = t["ink"]
    gap = 48
    cw = (CW - gap) / 2
    top = y + 14
    ch = (H - 60) - top
    sides = [(cmp.get("left") or {}, t["primary"]), (cmp.get("right") or {}, t["accent"])]
    for i, (g, accent) in enumerate(sides):
        x = M + i * (cw + gap)
        els += [
            _r(x, top, cw, ch, t["panel"], rx=14, stroke=_mix(ink, t["paper"], 0.82), sw=1),
            _r(x, top, cw, 4, accent),
            _t(x + 26, top + 24, cw - 52, (g.get("heading") or "").strip(), H3,
               t["primary"] if i == 0 else t["primary_dk"], bold=True),
            _r(x + 28, top + 24 + H3 * 1.3, 26, 3, t["accent"]),
        ]
        yy = top + 24 + H3 * 1.3 + 24
        for p in [str(s).strip() for s in (g.get("points") or []) if str(s).strip()][:5]:
            els += [
                _circle(x + 30, yy + BODY * 0.72, 3, fill=t["accent"]),
                _t(x + 44, yy, cw - 76, p, BODY, ink),
            ]
            yy += estimate_text_height(p, cw - 76, BODY) + 14
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _swot(t: dict, sec_idx: int, title: str, en: str, sw: dict, page: int, bg: str | None) -> dict:
    """SWOT 四象限：优势 / 劣势 / 机会 / 威胁，2×2 淡色块。"""
    els, y = _content_head(t, title, en or "SWOT", page, bg)
    ink = t["ink"]
    gap = 22
    top = y + 12
    cw = (CW - gap) / 2
    chh = ((H - 58) - top - gap) / 2
    quads = [
        ("优势", "STRENGTHS", sw.get("s"), t["primary"]),
        ("劣势", "WEAKNESSES", sw.get("w"), "#c0504d"),
        ("机会", "OPPORTUNITIES", sw.get("o"), t["accent"]),
        ("威胁", "THREATS", sw.get("t"), "#5b6b82"),
    ]
    for idx, (label, sub, items, accent) in enumerate(quads):
        x = M + (idx % 2) * (cw + gap)
        yy0 = top + (idx // 2) * (chh + gap)
        els += [
            _r(x, yy0, cw, chh, _mix(accent, t["paper"], 0.9), rx=14,
               stroke=_mix(accent, t["paper"], 0.6), sw=1),
            _t(x + 24, yy0 + 18, cw - 48, label, H3, accent, bold=True),
            _t(x + 26, yy0 + 20 + H3 * 1.2, 220, sub, CAP - 1, _mix(ink, t["paper"], 0.5),
               font=t["kicker_font"], spacing=2),
        ]
        yy = yy0 + 22 + H3 * 1.2 + CAP + 12
        for p in [str(s).strip() for s in (items or []) if str(s).strip()][:4]:
            line = "· " + p
            els.append(_t(x + 24, yy, cw - 48, line, CAP + 1, ink))
            yy += estimate_text_height(line, cw - 48, CAP + 1) + 8
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _closing(t: dict, title: str, bg: str | None) -> dict:
    """用内容页那张浅底背景（跟封面的深底不同），文字一律深色居中。"""
    els = _bg_layer(t, bg, "content")
    tcol = "#ffffff" if t["dark"] else t["primary"]
    els += [
        _t(M, 262, CW, "THANK YOU", H3, t["accent"], align="center", bold=True, font=t["kicker_font"], spacing=6),
        _t(M, 302, CW, "感谢观看", DISPLAY, tcol, align="center", bold=True, font=t["title_font"]),
        _r(W / 2 - 42, 302 + DISPLAY * 1.2 + 20, 84, 6, t["accent"]),
        _t(M, 302 + DISPLAY * 1.2 + 44, CW, title, H3, t["muted"], align="center"),
    ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def build_deck(outline: dict, theme_key: str = "red", bg: dict | None = None) -> list[dict]:
    """bg = {"cover": url, "content": url, "section": url} 可选（AI 生成的整页背景）。"""
    t = _mk_theme(theme_key, outline.get("palette"))
    bg = bg or {}
    title = (outline.get("title") or "演示文稿").strip()
    subtitle = (outline.get("subtitle") or "").strip()
    sections = [s for s in (outline.get("sections") or []) if s.get("heading")]
    total = len(sections)

    cover_image = outline.get("cover_image") if isinstance(outline.get("cover_image"), str) else None
    slides = [_cover(t, title, subtitle, bg.get("cover"), cover_image)]
    if sections:
        slides.append(_toc(t, sections, bg.get("content")))
    page = len(slides) + 1
    for i, sec in enumerate(sections):
        slides.append(_section(t, i + 1, total, sec["heading"], (sec.get("en") or "").strip(), bg.get("section")))
        page += 1
        for sl in (sec.get("slides") or [])[:4]:
            d = sl.get("data") if isinstance(sl.get("data"), dict) else None
            cmp = sl.get("compare") if isinstance(sl.get("compare"), dict) else None
            sw = sl.get("swot") if isinstance(sl.get("swot"), dict) else None
            ttl = (sl.get("title") or "").strip()
            en = (sl.get("en") or "").strip()
            if sw and any(sw.get(k) for k in ("s", "w", "o", "t")):
                slides.append(_swot(t, i, ttl, en, sw, page, bg.get("content")))
            elif cmp and (cmp.get("left") or cmp.get("right")):
                slides.append(_compare(t, i, ttl, en, cmp, page, bg.get("content")))
            elif d and d.get("items"):
                slides.append(_chart(
                    t, i, ttl, en, d.get("kind", "bar"), d.get("items") or [], page, bg.get("content"),
                ))
            else:
                slides.append(_content(
                    t, i, ttl, en, (sl.get("intro") or "").strip(),
                    [str(x).strip() for x in (sl.get("bullets") or []) if str(x).strip()],
                    page, bg.get("content"),
                    sl.get("image") if isinstance(sl.get("image"), str) else None,
                ))
            page += 1
    slides.append(_closing(t, title, bg.get("content")))
    return slides


# ── PPTX 导出（原生形状）──────────────────────────────────────────
def deck_to_pptx(slides: list[dict], theme_key: str = "red", title: str = "演示文稿",
                 asset_reader=None) -> bytes:
    """asset_reader(url) -> bytes | None：把 image 元素（AI 背景）读成字节嵌进 PPTX；
    None 或读不到就跳过那张图（PPTX 里就没背景图，形状文字都在）。"""
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Emu, Inches, Pt

    from app.office_tools import _set_cjk

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]
    ex = prs.slide_width / W
    ey = prs.slide_height / H
    body_font = "微软雅黑"

    def rgb(c: str) -> RGBColor:
        c = c or "#333333"
        if c.startswith("rgba"):
            m = c[c.find("(") + 1:c.find(")")].split(",")
            try:
                r, g, b, a = float(m[0]), float(m[1]), float(m[2]), float(m[3])
                return RGBColor(*(round(v * a + 255 * (1 - a)) for v in (r, g, b)))
            except Exception:
                return RGBColor(0x33, 0x33, 0x33)
        r, g, b = _hex(c if c.startswith("#") else "#333333")
        return RGBColor(r, g, b)

    amap = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}

    for page_no, sl in enumerate(slides, 1):
        s = prs.slides.add_slide(blank)
        s.background.fill.solid()
        s.background.fill.fore_color.rgb = rgb(sl.get("background", "#ffffff"))
        for el in sl.get("elements", []):
            x, y = Emu(int(el.get("x", 0) * ex)), Emu(int(el.get("y", 0) * ey))
            if el["type"] == "line":
                cn = s.shapes.add_connector(
                    1, Emu(int(el["x1"] * ex)), Emu(int(el["y1"] * ey)),
                    Emu(int(el["x2"] * ex)), Emu(int(el["y2"] * ey)))
                cn.line.color.rgb = rgb(el.get("stroke", "#999999"))
                cn.line.width = Pt(max(0.5, el.get("strokeWidth", 1)))
                continue
            if el["type"] in ("circle", "arc"):
                r = el.get("r", 10)
                d = Emu(int(r * 2 * ex))
                shp = s.shapes.add_shape(
                    MSO_SHAPE.OVAL, Emu(int((el["cx"] - r) * ex)), Emu(int((el["cy"] - r) * ey)), d, d)
                if el.get("fill") and el["fill"] != "none":
                    shp.fill.solid()
                    shp.fill.fore_color.rgb = rgb(el["fill"])
                else:
                    shp.fill.background()
                if el.get("stroke"):
                    shp.line.color.rgb = rgb(el["stroke"])
                    shp.line.width = Pt(max(0.5, el.get("strokeWidth", 1)))
                else:
                    shp.line.fill.background()
                shp.shadow.inherit = False
                continue
            if el["type"] == "image":
                data = asset_reader(el["src"]) if asset_reader else None
                if data:
                    try:
                        s.shapes.add_picture(io.BytesIO(data), x, y,
                                             Emu(int(el["width"] * ex)), Emu(int(el["height"] * ey)))
                    except Exception:
                        pass
                continue
            if el["type"] == "rect":
                w, hh = Emu(int(el["width"] * ex)), Emu(int(el["height"] * ey))
                rnd = (el.get("rx") or 0) > 1
                shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rnd else MSO_SHAPE.RECTANGLE, x, y, w, hh)
                if el.get("fill") == "none":
                    shp.fill.background()
                else:
                    shp.fill.solid()
                    shp.fill.fore_color.rgb = rgb(el["fill"])
                if el.get("stroke"):
                    shp.line.color.rgb = rgb(el["stroke"])
                    shp.line.width = Pt(max(0.5, el.get("strokeWidth", 1)))
                else:
                    shp.line.fill.background()
                if rnd:
                    try:
                        shp.adjustments[0] = min(0.5, el["rx"] / max(el["width"], el["height"]))
                    except Exception:
                        pass
                shp.shadow.inherit = False
            elif el["type"] == "text":
                lines = estimate_text_lines(el["text"], el["width"], el["fontSize"])
                box_h = max(el["fontSize"] * 1.35, el["fontSize"] * 1.3 * lines)
                tb = s.shapes.add_textbox(x, y, Emu(int(el["width"] * ex)), Emu(int(box_h * ey)))
                tf = tb.text_frame
                tf.word_wrap = True
                tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
                p = tf.paragraphs[0]
                p.text = el["text"]
                p.alignment = amap.get(el.get("align", "left"), PP_ALIGN.LEFT)
                run = p.runs[0]
                run.font.size = Pt(el["fontSize"] * 0.75)
                run.font.color.rgb = rgb(el["color"])
                run.font.bold = el.get("fontWeight") == "bold"
                _set_cjk(run, body_font)
        pn = s.shapes.add_textbox(prs.slide_width - Inches(1.1), prs.slide_height - Inches(0.5),
                                  Inches(0.9), Inches(0.35))
        r = pn.text_frame.paragraphs[0]
        r.text = str(page_no)
        r.alignment = PP_ALIGN.RIGHT
        r.runs[0].font.size = Pt(9)
        r.runs[0].font.color.rgb = rgb("#9a9a9a")
        _set_cjk(r.runs[0], body_font)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
