"""用户上传的"备课/汇报资料"→纯文本。AI PPT 的「传资料生成」用：把 Word / PDF / txt
读成一段文字，再交给大纲模型重组。图片走视觉模型转录（在 ai_proxy 里做，不在这）。

纯本地解析，不联网。docx 用 python-docx、pdf 用 pymupdf（都是已有依赖）。
"""

from __future__ import annotations

MAX_CHARS = 12000  # 交给 LLM 的资料上限，超了截断（一份 PPT 的素材够用了）


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
        elif name.endswith((".txt", ".md", ".markdown")) or ct.startswith("text/"):
            text = data.decode("utf-8", errors="replace")
        elif name.endswith(".doc"):
            raise ValueError("旧版 .doc 不支持，请另存为 .docx 再上传")
        else:
            raise ValueError("只支持 Word(.docx)、PDF、txt 文本，或直接粘贴文字")
    except ValueError:
        raise
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"资料解析失败：{e}") from e

    text = _clean(text)
    if len(text) < 20:
        raise ValueError("没能从文件里读到足够的文字（扫描版 PDF 请改用图片上传走识别）")
    return text[:MAX_CHARS]
