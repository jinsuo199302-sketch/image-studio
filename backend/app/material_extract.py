"""用户上传的"备课/汇报资料"→纯文本。AI PPT 的「传资料生成」用：把 Word / PDF / txt
读成一段文字，再交给大纲模型重组。图片走视觉模型转录（在 ai_proxy 里做，不在这）。

纯本地解析，不联网。docx 用 python-docx、pdf 用 pymupdf（都是已有依赖）。
"""

from __future__ import annotations

import re

MAX_CHARS = 24000  # 交给 LLM 的资料上限，超了截断——病例报告/学术材料这类专业文档可能较长，给够空间

# 买来的/没填完的 PPT 模板常见两类垃圾，混进资料文本会把大纲模型带偏：
# 1. PowerPoint 占位符提示语——模板没填的坑，不是真内容
# 2. 图标字体的裸字母残留——模板用了自定义图标字体，换机器打开字体丢了，图标显示成字母
_PPTX_PLACEHOLDER_RE = re.compile(
    r"^[点单]?[击此][处此]?(添加|输入|键入)(标题|文本|文字|副标题|内容)$|^在此[处]?(输入|键入)(文字|文本)?$"
)
_PPTX_GLYPH_JUNK_RE = re.compile(r"^[A-Za-z]{1,2}$")


def _is_pptx_junk_line(t: str) -> bool:
    return bool(_PPTX_PLACEHOLDER_RE.match(t) or _PPTX_GLYPH_JUNK_RE.match(t))


def _clean(text: str) -> str:
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    out: list[str] = []
    blank = 0
    for ln in lines:
        if ln.strip():
            out.append(ln)
            blank = 0
        else:
            blank += 1
            if blank <= 1:
                out.append("")
    return "\n".join(out).strip()


def _from_docx(data: bytes) -> str:
    import io

    from docx import Document

    doc = Document(io.BytesIO(data))
    parts: list[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            parts.append(t)
    for tbl in doc.tables:
        for row in tbl.rows:
            cells = [c.text.strip() for c in row.cells]
            cells = [c for c in cells if c]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _from_pdf(data: bytes) -> str:
    import fitz  # PyMuPDF

    parts: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            t = page.get_text("text")
            if t and t.strip():
                parts.append(t.strip())
    return "\n\n".join(parts)


def _collect_shape_text(shapes, title_id: int | None, depth: int = 0) -> list[str]:
    """递归收集一组形状里的文字，包括"组合"（Group）图形里嵌套的——很多专业模板会把
    "图标+文字"这类元素打包成组合，只扫最外层形状会把这些内容全部漏掉（实测踩过：
    一份真实病例报告表面上只有几百字，实际正文全在组合图形里，多达几千字没被读到）。
    深度限制纯粹是防御性的，正常模板顶多嵌套几层。"""
    if depth > 12:
        return []
    lines: list[str] = []
    for shape in shapes:
        if shape.shape_id == title_id:
            continue
        if getattr(shape, "shape_type", None) is not None and shape.shape_type == 6:  # MSO_SHAPE_TYPE.GROUP
            lines.extend(_collect_shape_text(shape.shapes, title_id, depth + 1))
            continue
        if not shape.has_text_frame:
            continue
        for para in shape.text_frame.paragraphs:
            t = "".join(r.text for r in para.runs).strip() or para.text.strip()
            if t and not _is_pptx_junk_line(t):
                lines.append(t)
    return lines


def _from_pptx(data: bytes) -> str:
    """现成 PPT →一段文字，按页留标题/要点，喂给大纲模型重新设计（"美化 PPT"用）。"""
    import io

    from pptx import Presentation

    prs = Presentation(io.BytesIO(data))
    parts: list[str] = []
    for slide in prs.slides:
        title = ""
        title_shape = getattr(slide.shapes, "title", None)
        title_id = title_shape.shape_id if title_shape is not None else None
        if title_shape is not None and title_shape.has_text_frame:
            title = title_shape.text_frame.text.strip()
            if _is_pptx_junk_line(title):
                title = ""
        lines = _collect_shape_text(slide.shapes, title_id)
        if not title and lines:
            title = lines.pop(0)
        if title or lines:
            parts.append("\n".join(([f"## {title}"] if title else []) + lines))
    return "\n\n".join(parts)


def extract_material(filename: str, content_type: str, data: bytes) -> str:
    """支持 .docx / .pdf / .txt / .md。返回清洗后的纯文本，最多 MAX_CHARS 字。
    解析失败或格式不支持抛 ValueError（调用方转成 400）。"""
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    try:
        if name.endswith(".docx") or "word" in ct or "officedocument.wordprocessing" in ct:
            text = _from_docx(data)
        elif name.endswith(".pdf") or ct == "application/pdf":
            text = _from_pdf(data)
        elif name.endswith(".pptx") or "officedocument.presentationml" in ct:
            text = _from_pptx(data)
        elif name.endswith((".txt", ".md", ".markdown")) or ct.startswith("text/"):
            text = data.decode("utf-8", errors="replace")
        elif name.endswith(".doc"):
            raise ValueError("旧版 .doc 不支持，请另存为 .docx 再上传")
        elif name.endswith(".ppt"):
            raise ValueError("旧版 .ppt 不支持，请另存为 .pptx 再上传")
        else:
            raise ValueError("只支持 Word(.docx)、PDF、PPT(.pptx)、txt 文本，或直接粘贴文字")
    except ValueError:
        raise
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"资料解析失败：{e}") from e

    text = _clean(text)
    if len(text) < 20:
        raise ValueError("没能从文件里读到足够的文字（扫描版 PDF 请改用图片上传走识别）")
    return text[:MAX_CHARS]
