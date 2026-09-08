"""AI PPT 一期：把 LLM 出的大纲排成一套幻灯片（每页 = elements 数组 + 背景，跟手抄报
一个数据结构），再用 python-pptx 导出成可在 PowerPoint 里改的原生形状。

不联网、不调模型——大纲生成在 ai_proxy 里做，这里是纯排版 + 导出。
参考 1ppt 那类党政/商务模板的**结构**（顶部标题栏 + 星标 + 编号圆点 + 圆角内容框 +
章节大标题页），装饰用代码画，不含国徽/党徽（封面留占位框让用户自己传）。
"""

from __future__ import annotations

import io

from app.text_metrics import estimate_text_height

W, H = 1280, 720  # 16:9，跟 PPT 的 13.333×7.5 英寸同比

# ── 主题 ──────────────────────────────────────────────────────────
THEMES: dict[str, dict] = {
    "red": {
        "label": "党政红金",
        "bg": "#ffffff",
        "primary": "#c0272d",
        "primary_soft": "#f3d3d4",
        "accent": "#d4a72c",
        "title": "#b02226",
        "text": "#333333",
        "muted": "#8a8a8a",
        "title_font": '"ZCOOL KuaiLe", sans-serif',
        "body_font": '"Noto Sans SC", sans-serif',
    },
    "blue": {
        "label": "商务蓝",
        "bg": "#ffffff",
        "primary": "#1f4e9c",
        "primary_soft": "#d3ddf0",
        "accent": "#e0a52b",
        "title": "#1a4488",
        "text": "#333333",
        "muted": "#8a8a8a",
        "title_font": '"ZCOOL XiaoWei", serif',
        "body_font": '"Noto Sans SC", sans-serif',
    },
    "green": {
        "label": "清新绿",
        "bg": "#ffffff",
        "primary": "#2f7d55",
        "primary_soft": "#cfe6da",
        "accent": "#e0a52b",
        "title": "#276b49",
        "text": "#333333",
        "muted": "#8a8a8a",
        "title_font": '"ZCOOL XiaoWei", serif',
        "body_font": '"Noto Sans SC", sans-serif',
    },
}


def _theme(key: str) -> dict:
    return THEMES.get(key, THEMES["red"])


_CN = "零一二三四五六七八九十"


def _cn(n: int) -> str:
    if n <= 10:
        return _CN[n]
    if n < 20:
        return "十" + _CN[n - 10]
    return _CN[n // 10] + "十" + (_CN[n % 10] if n % 10 else "")


# ── 元素工厂 ──────────────────────────────────────────────────────
def _text(x, y, width, text, size, color, *, align="left", bold=False, font=None, stroke=None, sw=0.0):
    e = {"type": "text", "x": round(x), "y": round(y), "width": round(width),
         "text": str(text), "fontSize": round(size), "color": color, "align": align}
    if bold:
        e["fontWeight"] = "bold"
    if font:
        e["fontFamily"] = font
    if stroke:
        e["stroke"] = stroke
        e["strokeWidth"] = sw
    return e


def _rect(x, y, w, h, fill, *, rx=0, stroke=None, sw=0.0):
    e = {"type": "rect", "x": round(x), "y": round(y), "width": round(w), "height": round(h),
         "fill": fill, "rx": round(rx)}
    if stroke:
        e["stroke"] = stroke
        e["strokeWidth"] = sw
    return e


def _badge(x, y, d, label, fill):
    """编号圆点：正方形 rect + rx=半径 ≈ 圆，中间放号码"""
    return [
        _rect(x, y, d, d, fill, rx=d / 2),
        _text(x, y + d / 2 - d * 0.3, d, label, d * 0.42, "#ffffff", align="center", bold=True),
    ]


def _header(t: dict, section: str) -> list[dict]:
    """内容页顶部标题栏 + 星标"""
    return [
        _rect(0, 0, W, 60, t["primary"]),
        _text(28, 14, 34, "★", 26, t["accent"], align="center"),
        _text(72, 16, W - 150, section, 21, "#ffffff", bold=True),
    ]


def _title_tag(t: dict, title: str, y=92) -> list[dict]:
    """红底小标题标签 + 下面一条金线"""
    tag_w = min(W - 120, 120 + len(title) * 24)
    return [
        _rect(56, y, tag_w, 40, t["primary"]),
        _text(74, y + 8, tag_w - 30, title, 21, "#ffffff", bold=True),
        _rect(56, y + 46, W - 112, 3, t["accent"]),
    ]


# ── 各种页型 ──────────────────────────────────────────────────────
def _cover(t: dict, title: str, subtitle: str) -> dict:
    els = [
        _rect(0, 0, W, 12, t["primary"]),
        _rect(0, H - 96, W, 96, t["primary"]),
        _rect(0, H - 102, W, 5, t["accent"]),
        # 徽标占位
        _rect(W / 2 - 46, 96, 92, 92, "#f6f6f6", rx=10, stroke="#dddddd", sw=1),
        _text(W / 2 - 46, 132, 92, "单位徽标", 13, "#bbbbbb", align="center"),
        _text(80, 250, W - 160, title, 60, t["title"], align="center", bold=True,
              font=t["title_font"], stroke="#ffffff", sw=1.5),
    ]
    if subtitle:
        els.append(_text(80, 348, W - 160, subtitle, 24, t["text"], align="center"))
    els += [
        _rect(W / 2 - 190, 402, 380, 46, "#ffffff", rx=23, stroke=t["primary"], sw=2),
        _text(W / 2 - 190, 414, 380, "这里填写您所在单位的名称", 17, t["primary"], align="center"),
    ]
    return {"background": t["bg"], "elements": els, "w": W, "h": H}


def _toc(t: dict, sections: list[dict]) -> dict:
    els = [
        _rect(0, 0, W, 12, t["primary"]),
        _text(80, 46, W - 160, "目录", 46, t["title"], align="center", bold=True, font=t["title_font"]),
        _rect(W / 2 - 66, 112, 132, 4, t["accent"]),
    ]
    rows = sections[:6]
    top = 178
    gap = min(84, (H - top - 40) / max(1, len(rows)))
    for i, sec in enumerate(rows):
        y = top + i * gap
        els += _badge(150, y, 46, f"{i + 1:02d}", t["primary"])
        els.append(_text(224, y + 8, W - 340, sec.get("heading", ""), 23, t["text"]))
    return {"background": t["bg"], "elements": els, "w": W, "h": H}


def _section(t: dict, idx: int, heading: str) -> dict:
    els = [
        _rect(0, 0, W, 12, t["primary"]),
        _rect(0, H - 12, W, 12, t["primary"]),
        _rect(W / 2 - 96, 236, 192, 42, t["primary"], rx=21),
        _text(W / 2 - 96, 246, 192, f"第{_cn(idx)}章节", 20, "#ffffff", align="center", bold=True),
        _text(110, 306, W - 220, heading, 44, t["title"], align="center", bold=True,
              font=t["title_font"], stroke="#ffffff", sw=1.2),
    ]
    return {"background": t["bg"], "elements": els, "w": W, "h": H}


def _content(t: dict, section: str, title: str, intro: str, bullets: list[str]) -> dict:
    els = _header(t, section) + _title_tag(t, title)
    y = 150
    if intro:
        ih = estimate_text_height(intro, W - 120, 16)
        els.append(_text(60, y, W - 120, intro, 16, t["muted"]))
        y += ih + 22

    items = [b for b in bullets if b][:6]
    avail = H - y - 30
    # 先按 16 号估总高，超了就缩小
    size = 16
    for _ in range(4):
        heights = [estimate_text_height(b, W - 250, size) for b in items]
        total = sum(h + 26 for h in heights)
        if total <= avail or size <= 12:
            break
        size -= 1
    heights = [estimate_text_height(b, W - 250, size) for b in items]
    for i, b in enumerate(items):
        ih = heights[i]
        box_h = ih + 16
        els.append(_rect(84, y - 6, W - 168, box_h, "#ffffff", rx=10, stroke=t["primary_soft"], sw=1.5))
        els += _badge(62, y + box_h / 2 - 20, 40, f"{i + 1:02d}", t["primary"])
        els.append(_text(128, y + (box_h - ih) / 2, W - 250, b, size, t["text"]))
        y += box_h + 14
    return {"background": t["bg"], "elements": els, "w": W, "h": H}


def _closing(t: dict, title: str) -> dict:
    return {
        "background": t["bg"],
        "elements": [
            _rect(0, 0, W, 12, t["primary"]),
            _rect(0, H - 96, W, 96, t["primary"]),
            _rect(0, H - 102, W, 5, t["accent"]),
            _text(80, 286, W - 160, "感谢观看", 58, t["title"], align="center", bold=True,
                  font=t["title_font"], stroke="#ffffff", sw=1.5),
            _text(80, 380, W - 160, title, 22, t["muted"], align="center"),
        ],
        "w": W, "h": H,
    }


def build_deck(outline: dict, theme_key: str = "red") -> list[dict]:
    t = _theme(theme_key)
    title = (outline.get("title") or "演示文稿").strip()
    subtitle = (outline.get("subtitle") or "").strip()
    sections = [s for s in (outline.get("sections") or []) if s.get("heading")]

    slides = [_cover(t, title, subtitle)]
    if sections:
        slides.append(_toc(t, sections))
    for i, sec in enumerate(sections):
        slides.append(_section(t, i + 1, sec["heading"]))
        for sl in (sec.get("slides") or [])[:4]:
            slides.append(_content(
                t, sec["heading"], (sl.get("title") or "").strip(),
                (sl.get("intro") or "").strip(),
                [str(x).strip() for x in (sl.get("bullets") or []) if str(x).strip()],
            ))
    slides.append(_closing(t, title))
    return slides


# ── PPTX 导出（原生形状，可在 PowerPoint 里改）───────────────────
def deck_to_pptx(slides: list[dict], theme_key: str = "red", title: str = "演示文稿") -> bytes:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Emu, Inches, Pt

    from app.office_tools import _set_cjk

    t = _theme(theme_key)
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]
    ex = prs.slide_width / W
    ey = prs.slide_height / H

    def rgb(hex_: str) -> RGBColor:
        h = (hex_ or "#000000").lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    align_map = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}
    # PPTX 用 PC/PowerPoint 一定有的中文字体，别用网页字体
    body_font = "微软雅黑"

    for page_no, sl in enumerate(slides, 1):
        s = prs.slides.add_slide(blank)
        s.background.fill.solid()
        s.background.fill.fore_color.rgb = rgb(sl.get("background", "#ffffff"))
        for el in sl.get("elements", []):
            x, y = Emu(int(el["x"] * ex)), Emu(int(el["y"] * ey))
            if el["type"] == "rect":
                w, hh = Emu(int(el["width"] * ex)), Emu(int(el["height"] * ey))
                is_round = (el.get("rx") or 0) > 1
                shp = s.shapes.add_shape(
                    MSO_SHAPE.ROUNDED_RECTANGLE if is_round else MSO_SHAPE.RECTANGLE, x, y, w, hh)
                shp.fill.solid()
                shp.fill.fore_color.rgb = rgb(el["fill"])
                if el.get("stroke"):
                    shp.line.color.rgb = rgb(el["stroke"])
                    shp.line.width = Pt(max(0.5, el.get("strokeWidth", 1)))
                else:
                    shp.line.fill.background()
                if is_round:
                    try:
                        shp.adjustments[0] = min(0.5, el["rx"] / max(el["width"], el["height"]))
                    except Exception:
                        pass
                shp.shadow.inherit = False
            elif el["type"] == "text":
                w = Emu(int(el["width"] * ex))
                tb = s.shapes.add_textbox(x, y, w, Emu(int(el["fontSize"] * ey * 2)))
                tf = tb.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                p.text = el["text"]
                p.alignment = align_map.get(el.get("align", "left"), PP_ALIGN.LEFT)
                run = p.runs[0]
                run.font.size = Pt(el["fontSize"] * 0.75)
                run.font.color.rgb = rgb(el["color"])
                run.font.bold = el.get("fontWeight") == "bold"
                _set_cjk(run, body_font)
        # 页码
        pn = s.shapes.add_textbox(prs.slide_width - Inches(1.1), prs.slide_height - Inches(0.5),
                                  Inches(0.9), Inches(0.35))
        r = pn.text_frame.paragraphs[0]
        r.text = str(page_no)
        r.alignment = PP_ALIGN.RIGHT
        r.runs[0].font.size = Pt(9)
        r.runs[0].font.color.rgb = rgb(t["muted"])
        _set_cjk(r.runs[0], body_font)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
