import asyncio
import io
import zipfile
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas as pdfcanvas

from app import doc_scan

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

# reportlab 内置的 Helvetica 等 14 种基础字体不含中文字形——实测直接拿 Helvetica 画中文水印，
# 每个汉字被拆成好几个乱码符号（不是异常，是静默画错）。STSong-Light 是 reportlab 自带的
# Adobe CID 字体，不用额外装字体文件，注册一次全局生效。
pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
_WATERMARK_FONT = "STSong-Light"


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


def _watermark_overlay_bytes(width: float, height: float, text: str, font_size: int, opacity: float, rotation: int) -> bytes:
    """画一张跟目标页同尺寸的透明覆盖层，文字按网格斜向平铺——比只在正中间画一次更接近
    真实水印工具的效果（不会被裁切/挖掉一角就整页失效）。reportlab 是纯 Python 库，
    不依赖任何原生二进制，装起来比 PaddleOCR 这类模型库轻得多，适合这台小机器。"""
    buf = io.BytesIO()
    c = pdfcanvas.Canvas(buf, pagesize=(width, height))
    c.setFont(_WATERMARK_FONT, font_size)
    c.setFillColorRGB(0.5, 0.5, 0.5, alpha=opacity)
    text_w = c.stringWidth(text, _WATERMARK_FONT, font_size)
    step_x = text_w + font_size * 3
    step_y = font_size * 5
    # 覆盖范围故意比页面大一圈——旋转后网格边缘会露出缺角，往外扩一圈保证转完还能铺满整页
    margin = max(width, height)
    y = -margin
    while y < height + margin:
        x = -margin
        while x < width + margin:
            c.saveState()
            c.translate(x, y)
            c.rotate(rotation)
            c.drawString(0, 0, text)
            c.restoreState()
            x += step_x
        y += step_y
    c.save()
    buf.seek(0)
    return buf.read()


@router.post("/watermark")
async def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    opacity: float = Form(0.3),
    font_size: int = Form(36),
    rotation: int = Form(45),
):
    if not text.strip():
        raise HTTPException(status_code=400, detail="水印文字不能为空")
    reader = _read_pdf(await file.read(), file.filename or "文件")
    writer = PdfWriter()
    for page in reader.pages:
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        overlay_bytes = _watermark_overlay_bytes(w, h, text.strip(), font_size, opacity, rotation)
        overlay_page = PdfReader(io.BytesIO(overlay_bytes)).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=watermarked.pdf"},
    )


@router.post("/scan")
async def scan_to_pdf(
    files: List[UploadFile] = File(...),
    mode: str = Form("bw"),
    auto_crop: str = Form("true"),
):
    """照片转扫描件 PDF。纯本地 OpenCV，不调 openlux——扫描是"复制/重现"不是"篡改/伪造"，
    跟 OCR 一样不接敏感文件检测。见 doc_scan.py。"""
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一张图片")
    if mode not in ("bw", "gray", "color"):
        mode = "bw"
    crop = auto_crop != "false"

    pages = []
    for f in files:
        data = await f.read()
        try:
            page = await asyncio.to_thread(doc_scan.scan_page, data, mode, crop)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"{f.filename or '图片'}：{e}")
        pages.append(page)

    pdf_bytes = await asyncio.to_thread(doc_scan.pages_to_pdf, pages)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=scan.pdf"},
    )


@router.post("/signature")
async def sign_pdf(
    file: UploadFile = File(...),
    signature: UploadFile = File(...),
    page_number: int = Form(...),
    # x/y/width 都是相对页面宽高的 0~1 比例，不用绝对像素——这样前端不用管每页实际尺寸，
    # 拖拽签名图放在"页面70%宽、85%高"这种相对位置直接换算得出，不同尺寸的 PDF 都适用
    x: float = Form(...),
    y: float = Form(...),
    width: float = Form(...),
):
    reader = _read_pdf(await file.read(), file.filename or "文件")
    total = len(reader.pages)
    if page_number < 1 or page_number > total:
        raise HTTPException(status_code=400, detail=f"页码超出范围（共 {total} 页）")

    sig_bytes = await signature.read()
    try:
        sig_img = ImageReader(io.BytesIO(sig_bytes))
        sig_w_px, sig_h_px = sig_img.getSize()
    except Exception:
        raise HTTPException(status_code=400, detail="签名图片无法解析")

    writer = PdfWriter()
    for idx, page in enumerate(reader.pages):
        if idx == page_number - 1:
            page_w, page_h = float(page.mediabox.width), float(page.mediabox.height)
            draw_w = width * page_w
            draw_h = draw_w * (sig_h_px / sig_w_px)
            draw_x = x * page_w
            draw_y = (1 - y) * page_h - draw_h  # PDF 坐标原点在左下角，前端给的 y 是从顶部算的比例，要翻转

            overlay_buf = io.BytesIO()
            c = pdfcanvas.Canvas(overlay_buf, pagesize=(page_w, page_h))
            c.drawImage(sig_img, draw_x, draw_y, width=draw_w, height=draw_h, mask="auto")
            c.save()
            overlay_buf.seek(0)
            overlay_page = PdfReader(overlay_buf).pages[0]
            page.merge_page(overlay_page)
        writer.add_page(page)

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=signed.pdf"},
    )
