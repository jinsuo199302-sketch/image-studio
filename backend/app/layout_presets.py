"""参数化排版预设——跟 ai_proxy.py 里靠 AI 猜坐标的 /design/generate、/design/layout 是完全不同
的机制：这里是纯确定性代码，喂进已经分好类的结构化内容（标题/引言/要点/分区），用固定算法
算坐标，不调用任何 AI，没有网络延迟，也不存在"数值判断不准"这个 AI 排版天然会有的问题
（多模态/文本模型对精确坐标、精确列数这类数值输出的可靠性本来就弱于语义判断）。

先做两种，验证"参数化排版"这个机制本身可不可行：
- bullet-list（要点罗列式）：技术风险最低，直接复用已经验证过的 icon-list 组件。
- dense-board（多栏密排信息板）：技术难度最高（动态栏数 + 组件嵌套 + 跨栏内容均衡分配），
  如果这个能跑通，说明这套机制的上限没问题，后面再加别的结构会更有把握。

两种都要处理"变长内容自适应"：条目数/文字长度差异很大时，排出来的版面不能重叠、不能大片空白。
"""
import math

from app.design_tokens import CIVIC_THEME, COMPONENT_SIZE
from app.text_metrics import estimate_text_height

MARGIN = 60
GAP = 20
ICON_LIST_ROW_H = COMPONENT_SIZE["iconList"]["rowH"]
ICON_LIST_W = COMPONENT_SIZE["iconList"]["badge"] + 10 + COMPONENT_SIZE["iconList"]["labelW"]  # 212
RIBBON_H = COMPONENT_SIZE["ribbon"]["height"]


def _ribbon(x: int, y: int, text: str, color: str, width: int) -> dict:
    return {
        "type": "group",
        "x": x,
        "y": y,
        "children": [],
        "componentKind": "ribbon-title",
        "componentData": [{"text": text, "color": color, "width": width}],
    }


def _icon_list(x: int, y: int, items: list[str], color: str, start_num: int = 1) -> dict:
    data = [{"shape": "circle", "color": color, "icon": str(start_num + i), "label": item} for i, item in enumerate(items)]
    return {"type": "group", "x": x, "y": y, "children": [], "componentKind": "icon-list", "componentData": data}


def _text(x: int, y: int, width: int, text: str, font_size: int, color: str, weight: str = "normal", align: str = "left") -> dict:
    return {"type": "text", "x": x, "y": y, "width": width, "text": text, "fontSize": font_size, "color": color, "fontWeight": weight, "align": align}


def build_bullet_list(canvas_width: int, canvas_height: int, title: str, intro: str | None, items: list[str]) -> dict:
    """标题 + 可选引言 + 一份要点清单。条目太多单列装不下时自动拆两栏，而不是让 icon-list
    的固定行高（34px/条）把版面撑到画布外面去。"""
    theme = CIVIC_THEME
    content_width = canvas_width - 2 * MARGIN
    elements: list[dict] = []
    y = MARGIN

    elements.append(_text(MARGIN, y, content_width, title, 36, theme["red"], weight="bold", align="center"))
    y += int(estimate_text_height(title, content_width, 36)) + GAP

    if intro:
        elements.append(_text(MARGIN, y, content_width, intro, 16, "#374151", align="center"))
        y += int(estimate_text_height(intro, content_width, 16)) + GAP * 2
    else:
        y += GAP

    available_height = max(0, canvas_height - MARGIN - y)
    single_col_height = len(items) * ICON_LIST_ROW_H

    if len(items) <= 6 or single_col_height <= available_height:
        x = MARGIN + max(0, (content_width - ICON_LIST_W) // 2)
        elements.append(_icon_list(x, y, items, theme["red"]))
    else:
        half = math.ceil(len(items) / 2)
        left_items, right_items = items[:half], items[half:]
        col_gap = 40
        total_w = ICON_LIST_W * 2 + col_gap
        start_x = MARGIN + max(0, (content_width - total_w) // 2)
        elements.append(_icon_list(start_x, y, left_items, theme["red"], start_num=1))
        elements.append(_icon_list(start_x + ICON_LIST_W + col_gap, y, right_items, theme["red"], start_num=half + 1))

    return {"background": "#fdfbf7", "elements": elements}


def build_dense_board(
    canvas_width: int,
    canvas_height: int,
    title: str,
    sections: list[dict],
    *,
    include_title: bool = True,
    top_offset: int | None = None,
    colors: list[str] | None = None,
) -> dict:
    """sections: [{"heading": str, "items": list[str]}, ...]。
    栏数按"平均每栏放 2 个分区"倒推，夹在 [3,7] 之间——太窄放不下 icon-list 固定的 212px 宽度，
    太宽单栏又显得空。分配用贪心装箱：每个分区放进当前最矮的一栏，而不是简单按顺序平均分——
    分区条目数差异大的时候，顺序平均分会让某几栏明显比别的高一截，贪心装箱能自然把总高度拉平。

    include_title=False + top_offset：给"参考图生成"复用——那边标题已经是套了 titleStyle 手法
    分类的独立元素，不需要这里再画一个标题占位，栏格直接从调用方算好的 top_offset 开始铺。
    colors：不传就用默认的党建红蓝；"手抄报一键生成"按分类传自己的两色配色（见
    app/handout_categories.py），不想所有分类都是同一套红蓝。"""
    colors = colors if colors and len(colors) >= 2 else [CIVIC_THEME["red"], CIVIC_THEME["blue"]]
    n = len(sections)
    columns = max(3, min(7, math.ceil(n / 2))) if n > 0 else 3
    col_width = (canvas_width - 2 * MARGIN - (columns - 1) * GAP) // columns
    col_x = [MARGIN + i * (col_width + GAP) for i in range(columns)]

    header_h = 140
    grid_top = top_offset if top_offset is not None else header_h + 40
    col_heights = [grid_top] * columns

    elements: list[dict] = []
    if include_title:
        elements.append(_text(0, 40, canvas_width, title, 40, colors[0], weight="bold", align="center"))

    for i, sec in enumerate(sections):
        target_col = col_heights.index(min(col_heights))
        x, y = col_x[target_col], col_heights[target_col]
        color = colors[i % 2]
        elements.append(_ribbon(x, y, sec["heading"], color, col_width))
        y += RIBBON_H + 12
        elements.append(_icon_list(x, y, sec["items"], color))
        y += len(sec["items"]) * ICON_LIST_ROW_H + GAP
        col_heights[target_col] = y

    return {"background": "#eef2f6", "elements": elements, "content_bottom": max(col_heights)}


# ─────────────────────────────────────────────────────────────────────────────
# 手抄报专用排版：dense-board 是给党建展板做的（固定像素组件、短语条目、多到 7 栏），
# 直接拿来铺手抄报会挤成一团——手抄报要的是：大边距（躲开 AI 画的外圈花边）、2 栏、
# 每块是一张浅色卡片（叠在装饰背景上文字还能看清）、字号跟着画布缩放、整段句子按
# 实际换行高度预留空间、内容装不下就自动缩字号不溢出。
# ─────────────────────────────────────────────────────────────────────────────
_CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"


def _tint(hex_color: str, ratio: float) -> str:
    """往白里混，ratio 越大越淡。卡片底色用 0.9，很浅一层。"""
    h = hex_color.lstrip("#")
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return "#f5f3ef"
    f = lambda c: round(c + (255 - c) * ratio)  # noqa: E731
    return f"#{f(r):02x}{f(g):02x}{f(b):02x}"


def _handout_pass(canvas_width: int, canvas_height: int, title: str, sections: list[dict], colors: list[str], scale: float, gap_scale: float = 1.0):
    c0 = colors[0]
    margin = max(56, round(min(canvas_width, canvas_height) * 0.085))
    fs_title = round(40 * scale)
    fs_head = round(19 * scale)
    fs_body = round(15 * scale)
    pad = round(16 * scale)
    gap = round(22 * scale)                       # 结构性间距（横向栏距、标题下方）
    vgap = round(22 * scale * gap_scale)          # 卡片竖向间距，内容偏短时拉大把版面撑满
    line_gap = round(7 * scale)

    elements: list[dict] = []

    # 标题：圆角色块 + 白字，居中
    title_h = round(fs_title * 1.7)
    title_w = min(canvas_width - 2 * margin, round(len(title) * fs_title * 1.25) + fs_title * 2)
    tx = round((canvas_width - title_w) / 2)
    ty = margin
    elements.append({"type": "rect", "x": tx, "y": ty, "width": title_w, "height": title_h, "fill": c0, "rx": round(title_h / 2)})
    elements.append({"type": "text", "x": tx, "y": ty + round((title_h - fs_title) / 2) - round(2 * scale),
                     "width": title_w, "text": title, "fontSize": fs_title, "fontWeight": "bold", "color": "#ffffff", "align": "center"})

    grid_top = ty + title_h + gap * 2
    columns = 3 if canvas_width / max(1, canvas_height) >= 1.45 else 2
    col_w = (canvas_width - 2 * margin - (columns - 1) * gap) // columns
    col_x = [margin + i * (col_w + gap) for i in range(columns)]
    col_bottom = [grid_top] * columns
    text_w = col_w - 2 * pad
    head_block = fs_head + round(14 * scale)  # 标题文字 + 下划线 + 到正文的间距

    for i, sec in enumerate(sections):
        col = col_bottom.index(min(col_bottom))
        x, y = col_x[col], col_bottom[col]
        color = colors[i % 2]

        body_h = 0.0
        for j, item in enumerate(sec["items"]):
            prefix = _CIRCLED[j] if j < len(_CIRCLED) else f"{j + 1}."
            body_h += estimate_text_height(f"{prefix} {item}", text_w, fs_body) + line_gap
        card_h = round(pad + head_block + body_h + pad)

        elements.append({"type": "rect", "x": x, "y": y, "width": col_w, "height": card_h, "fill": _tint(color, 0.9), "rx": round(12 * scale)})
        elements.append({"type": "text", "x": x + pad, "y": y + pad, "width": text_w, "text": sec["heading"],
                         "fontSize": fs_head, "fontWeight": "bold", "color": color})
        underline_w = min(text_w, round(len(sec["heading"]) * fs_head + 8 * scale))
        elements.append({"type": "rect", "x": x + pad, "y": y + pad + fs_head + round(4 * scale),
                         "width": underline_w, "height": max(2, round(3 * scale)), "fill": color, "rx": max(1, round(2 * scale))})

        iy = y + pad + head_block
        for j, item in enumerate(sec["items"]):
            prefix = _CIRCLED[j] if j < len(_CIRCLED) else f"{j + 1}."
            line = f"{prefix} {item}"
            elements.append({"type": "text", "x": x + pad, "y": round(iy), "width": text_w, "text": line, "fontSize": fs_body, "color": "#374151"})
            iy += estimate_text_height(line, text_w, fs_body) + line_gap

        col_bottom[col] = y + card_h + vgap

    return elements, max(col_bottom) - vgap


def build_handout(canvas_width: int, canvas_height: int, title: str, sections: list[dict], colors: list[str] | None = None) -> dict:
    """手抄报排版：标题色块 + 2 栏卡片（浅底、彩色小标题 + 下划线 + 圈码正文），贪心装箱平衡栏高。
    先按基准字号排一遍，然后自动适配画布高度：太满就缩字号（最多缩到 0.62），太空就把卡片
    竖向间距拉大 + 字号略放大（最多 1.35 倍）把版面撑到画布高度的 ~88%，不至于上面挤下面空。"""
    colors = colors if colors and len(colors) >= 2 else [CIVIC_THEME["red"], CIVIC_THEME["blue"]]
    grid_start = max(56, round(min(canvas_width, canvas_height) * 0.085)) + round(40 * 1.7) + round(88 * 1.0)
    avail_span = canvas_height - round(canvas_height * 0.06) - grid_start  # 卡片区可用高度

    base = max(0.75, min(1.8, canvas_width / 900))
    elements, bottom = _handout_pass(canvas_width, canvas_height, title, sections, colors, base)
    span = bottom - grid_start

    if span > avail_span and span > 0:
        shrink = max(0.62, avail_span / span)
        elements, _ = _handout_pass(canvas_width, canvas_height, title, sections, colors, base * shrink)
    elif span > 0 and span < avail_span * 0.78:
        target = avail_span * 0.88
        up = min(1.35, (target / span) ** 0.5)          # 一半靠放大字号
        gap_up = min(3.0, target / (span * up))          # 剩下靠拉大卡片竖向间距
        elements, _ = _handout_pass(canvas_width, canvas_height, title, sections, colors, base * up, gap_scale=gap_up)

    return {"background": "#ffffff", "elements": elements}
