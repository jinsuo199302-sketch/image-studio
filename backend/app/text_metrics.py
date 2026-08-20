"""文字换行高度估算——纯数学，不依赖网络/AI。AI 生成路径（ai_proxy.py 的溢出重排/截断，
处理"AI 猜的坐标可能跟实际渲染高度对不上"）和确定性排版预设（layout_presets.py，处理"按
选定结构主动摆坐标"）两边都要用同一套公式，抽出来共用，不然以后改了行高比例容易一边改
一边忘，两边估算结果慢慢跑偏。"""

import math

LINE_HEIGHT_RATIO = 1.16  # 跟 Fabric Textbox 的默认 lineHeight 保持一致，不然估算跟实际渲染对不上


def chars_per_line(width: float, font_size: float) -> int:
    return max(1, int(width / (font_size * 1.02)))


def estimate_text_lines(text: str, width: float, font_size: float) -> int:
    if not text:
        return 1
    return max(1, math.ceil(len(text) / chars_per_line(width, font_size)))


def estimate_text_height(text: str, width: float, font_size: float) -> float:
    return estimate_text_lines(text, width, font_size) * font_size * LINE_HEIGHT_RATIO
