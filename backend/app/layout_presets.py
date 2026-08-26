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
) -> dict:
    """sections: [{"heading": str, "items": list[str]}, ...]。
    栏数按"平均每栏放 2 个分区"倒推，夹在 [3,7] 之间——太窄放不下 icon-list 固定的 212px 宽度，
    太宽单栏又显得空。分配用贪心装箱：每个分区放进当前最矮的一栏，而不是简单按顺序平均分——
    分区条目数差异大的时候，顺序平均分会让某几栏明显比别的高一截，贪心装箱能自然把总高度拉平。

    include_title=False + top_offset：给"参考图生成"复用——那边标题已经是套了 titleStyle 手法
    分类的独立元素，不需要这里再画一个标题占位，栏格直接从调用方算好的 top_offset 开始铺。"""
    theme = CIVIC_THEME
    colors = [theme["red"], theme["blue"]]
    n = len(sections)
    columns = max(3, min(7, math.ceil(n / 2))) if n > 0 else 3
    col_width = (canvas_width - 2 * MARGIN - (columns - 1) * GAP) // columns
    col_x = [MARGIN + i * (col_width + GAP) for i in range(columns)]

    header_h = 140
    grid_top = top_offset if top_offset is not None else header_h + 40
    col_heights = [grid_top] * columns

    elements: list[dict] = []
    if include_title:
        elements.append(_text(0, 40, canvas_width, title, 40, theme["red"], weight="bold", align="center"))

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
