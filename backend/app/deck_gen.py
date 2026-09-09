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


def _section(t: dict, idx: int, total: int, heading: str, en: str, bg: str | None) -> dict:
    """章节过渡页：深底大色块（就算没 AI 背景也是深色，跟内容页的白形成节奏）。"""
    els: list[dict]
    if bg:
        els = [_img(0, 0, W, H, bg)]
    else:
        dk = t["primary_dk"]
        els = [
            _r(0, 0, W, H, dk),
            _r(0, 0, W, 6, t["accent"]),
            _r(W - 300, H - 300, 300, 300, _mix(dk, "#ffffff", 0.06)),
        ]
    els += [
        _t(M, 250, CW + 12, f"{idx:02d}", 168, _mix(t["accent"], t["primary_dk"], 0.62), bold=True, font=t["kicker_font"]),
        _t(M + 6, 232, 400, f"PART {idx:02d} / {total:02d}", H3, t["accent"], bold=True, font=t["kicker_font"], spacing=6),
        _t(M + 6, 452, CW, heading, H1, "#ffffff", bold=True, font=t["title_font"]),
        _r(M + 10, 452 + H1 * 1.25 + 16, 72, 4, t["accent"]),
    ]
    if en:
        els.append(_t(M + 10, 452 + H1 * 1.25 + 30, CW, en, CAP, "rgba(255,255,255,0.5)",
                      font=t["kicker_font"], spacing=3))
    return {"background": t["primary_dk"], "elements": els, "w": W, "h": H}


_EN_CAP = ["OVERVIEW", "ANALYSIS", "KEY POINTS", "ACTION PLAN", "SUMMARY", "OUTLOOK"]


def _content_head(t: dict, title: str, en: str, page: int, bg: str | None) -> tuple[list[dict], float]:
    """居中标题 + 两侧短线 + 下方英文小字（模仿主流模板的内容页页眉）。"""
    els = _bg_layer(t, bg, "content")
    hcol = "#ffffff" if (bg or t["dark"]) else t["primary"]
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


def _content(t: dict, sec_idx: int, title: str, en: str, intro: str, bullets: list[str], page: int, bg: str | None) -> dict:
    els, y = _content_head(t, title, en or _EN_CAP[sec_idx % len(_EN_CAP)], page, bg)
    items = [b for b in bullets if b][:5]
    if intro:
        ih = estimate_text_height(intro, CW - 120, BODY)
        els.append(_t(M + 60, y, CW - 120, intro, BODY, t["muted"], align="center"))
        y += ih + 26
    bottom = H - 60
    n = len(items)

    ink = "#ffffff" if bg else t["ink"]
    sub = _mix(ink, t["paper"], 0.5) if not bg else "#e6e6e6"
    rule = _mix(ink, t["paper"], 0.85) if not bg else "rgba(255,255,255,0.25)"

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
        cy = y + 40
        for i, b in enumerate(items):
            x = M + i * (cw + gap)
            els += [
                _r(x + cw / 2 - 30, cy, 60, 60, "none", rx=30, stroke=t["accent"], sw=2),
                _t(x + cw / 2 - 30, cy + 15, 60, f"{i + 1:02d}", H3, t["accent"], align="center", bold=True, font=t["kicker_font"]),
                _t(x, cy + 92, cw, b, H3, ink, align="center"),
            ]
            if i == 0:
                els.append(_r(M + cw + gap / 2 - 1, y + 20, 2, bottom - y - 60, rule))
    elif n == 3:
        gap = 40
        cw = (CW - 2 * gap) / 3
        cy = y + 30
        for i, b in enumerate(items):
            x = M + i * (cw + gap)
            els += [
                _r(x + cw / 2 - 32, cy, 64, 64, "none", rx=32, stroke=_mix(t["primary"], t["paper"], 0.15), sw=2),
                _t(x + cw / 2 - 32, cy + 16, 64, f"{i + 1}", H2, t["primary"] if not bg else "#fff", align="center", bold=True, font=t["kicker_font"]),
                _r(x + cw / 2 - 14, cy + 82, 28, 3, t["accent"]),
                _t(x + 12, cy + 100, cw - 24, b, BODY, ink, align="center"),
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
        slides.append(_section(t, i + 1, total, sec["heading"], (sec.get("en") or "").strip(), bg.get("section")))
        page += 1
        for sl in (sec.get("slides") or [])[:4]:
            slides.append(_content(
                t, i, (sl.get("title") or "").strip(), (sl.get("en") or "").strip(),
                (sl.get("intro") or "").strip(),
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
