import io
import zipfile
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


def _read_pdf(data: bytes, filename: str) -> PdfReader:
    try:
        return PdfReader(io.BytesIO(data))
    except PdfReadError:
        raise HTTPException(status_code=400, detail=f"{filename} 不是有效的 PDF 文件")


@router.post("/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="至少需要 2 个 PDF 文件才能合并")

    writer = PdfWriter()
    for f in files:
        reader = _read_pdf(await f.read(), f.filename or "文件")
        for page in reader.pages:
            writer.add_page(page)

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=merged.pdf"},
    )


def _parse_ranges(ranges: str, total: int) -> List[tuple[int, int]]:
    parts: List[tuple[int, int]] = []
    for chunk in ranges.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            if "-" in chunk:
                start_s, end_s = chunk.split("-", 1)
                start, end = int(start_s), int(end_s)
            else:
                start = end = int(chunk)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"页码范围格式不对：{chunk}")
        if start < 1 or end > total or start > end:
            raise HTTPException(status_code=400, detail=f"页码范围 {chunk} 超出 PDF 总页数（{total} 页）")
        parts.append((start - 1, end - 1))
    if not parts:
        raise HTTPException(status_code=400, detail="请输入有效的页码范围")
    return parts


@router.post("/split")
async def split_pdf(
    file: UploadFile = File(...),
    mode: str = Form(...),
    pages_per_file: Optional[int] = Form(None),
    ranges: Optional[str] = Form(None),
):
    reader = _read_pdf(await file.read(), file.filename or "文件")
    total = len(reader.pages)

    if mode == "every_n":
        if not pages_per_file or pages_per_file < 1:
            raise HTTPException(status_code=400, detail="每份页数必须大于 0")
        page_groups = [(s, min(s + pages_per_file, total) - 1) for s in range(0, total, pages_per_file)]
    elif mode == "ranges":
        if not ranges:
            raise HTTPException(status_code=400, detail="请输入页码范围")
        page_groups = _parse_ranges(ranges, total)
    else:
        raise HTTPException(status_code=400, detail="未知的拆分模式")

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, (start, end) in enumerate(page_groups):
            writer = PdfWriter()
            for i in range(start, end + 1):
                writer.add_page(reader.pages[i])
            part_buf = io.BytesIO()
            writer.write(part_buf)
            zf.writestr(f"part_{idx + 1}_{start + 1}-{end + 1}.pdf", part_buf.getvalue())
    zip_buf.seek(0)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=split.zip"},
    )
