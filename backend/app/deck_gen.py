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
    "red":   ["#b01f24", "#d99b2b", "#8c1519", "#f4f4f4", "#2b2b2b"],
    "blue":  ["#1f4e9c", "#e0a52b", "#16336b", "#f5f6f8", "#2b2b2b"],
    "green": ["#2f7d55", "#e0a52b", "#1f5c3d", "#f4f7f5", "#2b2b2b"],
    "dark":  ["#e8b04b", "#3f7cc4", "#c8963a", "#1c2230", "#f2f2f2"],
}


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
def _cover(t: dict, title: str, subtitle: str, bg: str | None) -> dict:
    on_img = bg is not None
    tcol = "#ffffff" if (on_img or t["dark"]) else t["primary"]
    scol = "#f0f0f0" if (on_img or t["dark"]) else t["muted"]
    els = _bg_layer(t, bg, "cover")
    tlines = estimate_text_lines(title, CW - 60, DISPLAY)
    title_h = DISPLAY * (1 + 1.15 * (tlines - 1))
    els += [
        _t(M, 168, CW, "KEYNOTE PRESENTATION", CAP, t["accent"], bold=True, font=t["kicker_font"], spacing=4),
        _t(M, 214, CW - 60, title, DISPLAY, tcol, bold=True, font=t["title_font"],
           stroke="#ffffff" if on_img else None, sw=1.4),
        _r(M + 4, 214 + title_h + 26, 84, 6, t["accent"]),
    ]
    ty = 214 + title_h + 48
    if subtitle:
        els.append(_t(M, ty, CW, subtitle, H3, scol))
    els += [
        _t(M, H - 96, 400, "汇报单位：____________", CAP, scol),
        _t(M, H - 72, 400, "汇报时间：____________", CAP, scol),
    ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _toc(t: dict, sections: list[dict], bg: str | None) -> dict:
    els = _bg_layer(t, bg, "content")
    els += [
        _t(M, 76, CW, "目录", H1, t["primary"] if not t["dark"] else "#fff", bold=True, font=t["title_font"]),
        _t(M + 4, 130, 300, "CONTENTS", CAP, t["accent"], bold=True, font=t["kicker_font"], spacing=3),
        _r(M + 4, 156, 64, 4, t["accent"]),
    ]
    rows = sections[:6]
    two_col = len(rows) > 4
    top, rh = 200, 92 if not two_col else 150
    col_w = (CW - 40) / 2 if two_col else CW
    for i, sec in enumerate(rows):
        col = i % 2 if two_col else 0
        row = i // 2 if two_col else i
        x = M + col * (col_w + 40)
        y = top + row * rh
        els += [
            _t(x, y - 10, 70, f"{i + 1:02d}", H1, _mix(t["primary"], t["paper"], 0.35), bold=True, font=t["kicker_font"]),
            _t(x + 78, y + 6, col_w - 90, sec.get("heading", ""), H3, t["ink"], bold=True),
            _r(x + 78, y + 40, col_w - 90, 2, _mix(t["ink"], t["paper"], 0.8)),
        ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _section(t: dict, idx: int, total: int, heading: str, bg: str | None) -> dict:
    on_img = bg is not None
    els = _bg_layer(t, bg, "section")
    tcol = "#ffffff" if (on_img or t["dark"]) else t["primary"]
    els += [
        _t(M, 210, 400, f"PART {idx:02d}", H3, t["accent"], bold=True, font=t["kicker_font"], spacing=6),
        _t(M, 250, 520, f"共 {total} 个部分", CAP, "#e8e8e8" if (on_img or t["dark"]) else t["muted"]),
        _t(M - 6, 292, CW + 12, f"{idx:02d}", 150, _mix(t["accent"], t["paper"] if not on_img else "#333333", 0.42),
           bold=True, font=t["kicker_font"]),
        _t(M, 452, CW, heading, H1, tcol, bold=True, font=t["title_font"],
           stroke="#ffffff" if on_img else None, sw=1.2),
    ]
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _content_head(t: dict, section: str, title: str, page: int, bg: str | None) -> tuple[list[dict], float]:
    els = _bg_layer(t, bg, "content")
    els += [
        _r(M, 66, 30, 4, t["accent"]),
        _t(M + 40, 58, CW - 200, section, CAP, t["muted"], bold=True, spacing=1),
        _t(W - M - 120, 58, 120, f"{page:02d}", CAP, t["muted"], align="right", font=t["kicker_font"]),
        _t(M, 92, CW, title, H2, t["primary"] if not t["dark"] else "#fff", bold=True, font=t["title_font"]),
        _r(M, 92 + H2 * 1.2 + 8, 60, 4, t["accent"]),
    ]
    return els, 92 + H2 * 1.2 + 28


def _content(t: dict, section: str, title: str, intro: str, bullets: list[str], page: int, bg: str | None) -> dict:
    els, y = _content_head(t, section, title, page, bg)
    items = [b for b in bullets if b][:5]
    if intro:
        ih = estimate_text_height(intro, CW, BODY)
        els.append(_t(M, y, CW, intro, BODY, t["muted"]))
        y += ih + 24
    bottom = H - 60
    n = len(items)

    if n == 1:
        # 一句话 → 引言块
        b = items[0]
        els += [
            _r(M, y + 6, 8, min(bottom - y - 12, 200), t["accent"]),
            _t(M + 32, y - 8, 60, "“", 64, _mix(t["primary"], t["paper"], 0.4), bold=True, font=t["title_font"]),
            _t(M + 34, y + 46, CW - 60, b, H3, t["ink"]),
        ]
    elif n == 2:
        # 两张大卡片
        gap = 32
        cw = (CW - gap) / 2
        ch = bottom - y - 8
        for i, b in enumerate(items):
            x = M + i * (cw + gap)
            els += [
                _r(x, y, cw, ch, t["panel"], rx=14, stroke=t["soft"], sw=1.5),
                _r(x, y, cw, 8, t["primary"] if i == 0 else t["accent"]),
                _t(x + 28, y + 34, 48, f"{i + 1:02d}", H1, _mix(t["primary"], t["panel"], 0.3), bold=True, font=t["kicker_font"]),
                _t(x + 28, y + 108, cw - 56, b, H3, t["ink"]),
            ]
    elif n == 3:
        # 三栏
        gap = 28
        cw = (CW - 2 * gap) / 3
        ch = bottom - y - 8
        for i, b in enumerate(items):
            x = M + i * (cw + gap)
            els += [
                _r(x, y, cw, ch, t["panel"], rx=12, stroke=t["soft"], sw=1.5),
                _r(x + cw / 2 - 22, y + 26, 44, 44, t["primary"], rx=22),
                _t(x + cw / 2 - 22, y + 34, 44, f"{i + 1}", H3, "#ffffff", align="center", bold=True),
                _t(x + 20, y + 92, cw - 40, b, BODY, t["ink"], align="center"),
            ]
    else:
        # 4~5 条 → 竖排清单（不用重框，靠留白和分隔线）
        avail = bottom - y
        size = BODY
        for _ in range(3):
            hs = [estimate_text_height(b, CW - 84, size) for b in items]
            if sum(h + 28 for h in hs) <= avail or size <= 13:
                break
            size -= 1
        hs = [estimate_text_height(b, CW - 84, size) for b in items]
        for i, b in enumerate(items):
            row_h = hs[i]
            els += [
                _r(M, y + 2, 34, 34, t["primary"], rx=8),
                _t(M, y + 8, 34, f"{i + 1:02d}", CAP + 1, "#ffffff", align="center", bold=True),
                _t(M + 52, y + max(0, (34 - row_h) / 2), CW - 84, b, size, t["ink"]),
            ]
            y += max(row_h, 34) + 28
            if i < len(items) - 1:
                els.append(_r(M + 52, y - 16, CW - 84, 1, _mix(t["ink"], t["paper"], 0.86)))
    return {"background": t["paper"], "elements": els, "w": W, "h": H}


def _closing(t: dict, title: str, bg: str | None) -> dict:
    on_img = bg is not None
    tcol = "#ffffff" if (on_img or t["dark"]) else t["primary"]
    els = _bg_layer(t, bg, "cover")
    els += [
        _t(M, 260, CW, "THANK YOU", H3, t["accent"], bold=True, font=t["kicker_font"], spacing=6),
        _t(M, 300, CW, "感谢观看", DISPLAY, tcol, bold=True, font=t["title_font"],
           stroke="#ffffff" if on_img else None, sw=1.4),
        _r(M + 4, 300 + DISPLAY * 1.2 + 20, 84, 6, t["accent"]),
        _t(M, 300 + DISPLAY * 1.2 + 44, CW, title, H3, "#f0f0f0" if (on_img or t["dark"]) else t["muted"]),
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

    slides = [_cover(t, title, subtitle, bg.get("cover"))]
    if sections:
        slides.append(_toc(t, sections, bg.get("content")))
    page = len(slides) + 1
    for i, sec in enumerate(sections):
        slides.append(_section(t, i + 1, total, sec["heading"], bg.get("section")))
        page += 1
        for sl in (sec.get("slides") or [])[:4]:
            slides.append(_content(
                t, sec["heading"], (sl.get("title") or "").strip(), (sl.get("intro") or "").strip(),
                [str(x).strip() for x in (sl.get("bullets") or []) if str(x).strip()],
                page, bg.get("content"),
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
        r, g, b = _hex(c if c and c.startswith("#") else "#333333")
        return RGBColor(r, g, b)

    amap = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}

    for page_no, sl in enumerate(slides, 1):
        s = prs.slides.add_slide(blank)
        s.background.fill.solid()
        s.background.fill.fore_color.rgb = rgb(sl.get("background", "#ffffff"))
        for el in sl.get("elements", []):
            x, y = Emu(int(el["x"] * ex)), Emu(int(el["y"] * ey))
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
                tb = s.shapes.add_textbox(x, y, Emu(int(el["width"] * ex)), Emu(int(el["fontSize"] * ey * 2.2)))
                tf = tb.text_frame
                tf.word_wrap = True
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
