"""表格照片 → xlsx。视觉模型输出 JSON 二维数组，这里做容错解析 + openpyxl 生成 Excel。
跟 OCR 一样是"读取/转录"，不接敏感文件检测。"""
import io
import json
import re

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

TABLE_INSTRUCTION = (
    "识别图片里的表格，输出为 JSON：一个二维数组，最外层每个元素是一行，"
    "每行是该行各单元格文本组成的字符串数组。所有行补齐成相同列数，缺的单元格用空字符串。"
    "被合并的单元格，把值放在左上格、其余留空。"
    "只输出能被 JSON.parse 的数组本身——不要 markdown、不要 ```、不要任何解释文字。"
    "图中没有表格就输出 []。"
)


def parse_grid(content: str) -> list[list[str]]:
    """容错解析：去掉可能的 ``` 围栏，直接 json.loads；失败再抠出第一个 [ 到最后一个 ]。"""
    s = content.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.IGNORECASE).strip()
    for candidate in (s, s[s.find("[") : s.rfind("]") + 1] if "[" in s and "]" in s else ""):
        if not candidate:
            continue
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            grid = []
            for row in data:
                if isinstance(row, list):
                    grid.append(["" if c is None else str(c) for c in row])
                else:
                    grid.append([str(row)])
            return grid
    raise ValueError("未能从图片里解析出表格结构")


def build_xlsx(grid: list[list[str]]) -> bytes:
    if not grid or not any(any(cell.strip() for cell in row) for row in grid):
        raise ValueError("图片里没有识别到表格内容")
    ncols = max(len(r) for r in grid)
    wb = Workbook()
    ws = wb.active
    ws.title = "表格"
    for r, row in enumerate(grid, start=1):
        for c in range(ncols):
            val = row[c] if c < len(row) else ""
            cell = ws.cell(row=r, column=c + 1, value=val)
            if r == 1:
                cell.font = Font(bold=True)
    # 按内容估列宽
    for c in range(1, ncols + 1):
        longest = max((len(str(row[c - 1])) for row in grid if c - 1 < len(row)), default=4)
        ws.column_dimensions[get_column_letter(c)].width = min(max(longest * 1.6 + 2, 8), 60)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
