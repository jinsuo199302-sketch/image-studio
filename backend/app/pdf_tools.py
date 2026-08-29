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

from app import doc_format, doc_scan, office_tools

router = APIRouter(prefix="/api/pdf", tags=["pdf"])

# HEIC 解码是这个文件里唯一吃内存的活（12MP 解出来 ~36MB + libheif 缓冲），
# 2 核 2GB 的机器上最多同时跑 2 个，多的排队——HEIC 转换本身很快，队列很快消化。
_HEIC_SEM = asyncio.Semaphore(2)
_HEIC_MAX_BYTES = 30 * 1024 * 1024
_HEIC_MAX_SIDE = 4096

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


# 「PDF 转图片」渲染时每页 pixmap 会吃内存（300dpi 的 A4 约 25MB），2 核 2GB 上限并发 2，
# 再靠页数/dpi 上限兜底，避免一个大 PDF 高 dpi 把机器打爆。
_RENDER_SEM = asyncio.Semaphore(2)
_MAX_RENDER_PAGES = 60
_MAX_IMAGES_TO_PDF = 100


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


def _heic_decode(data: bytes) -> bytes:
    from pillow_heif import register_heif_opener

    register_heif_opener()
    from PIL import Image as PILImg

    try:
        im = PILImg.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise ValueError("无法解析 HEIC 文件")
    if max(im.size) > _HEIC_MAX_SIDE:
        s = _HEIC_MAX_SIDE / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), PILImg.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=95)
    return buf.getvalue()


@router.post("/heic-to-jpg")
async def heic_to_jpg(image: UploadFile = File(...)):
    """HEIC/HEIF → JPEG。苹果默认拍照格式，浏览器 canvas 解不了，只能后端转。
    纯格式转换，无 AI/openlux 依赖。解码放线程池 + 全局限并发 2，避免高峰把小机器压垮。"""
    data = await image.read()
    if len(data) > _HEIC_MAX_BYTES:
        raise HTTPException(status_code=413, detail="HEIC 文件超过 30MB")
    async with _HEIC_SEM:
        try:
            jpg = await asyncio.to_thread(_heic_decode, data)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(io.BytesIO(jpg), media_type="image/jpeg",
                             headers={"Content-Disposition": "attachment; filename=converted.jpg"})


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


# ---------------------------------------------------------------------------
# PDF 工具箱补全：图片转 PDF / PDF 转图片 / 加密解密 / 页面管理
# 全部纯本地，不调 openlux，不接敏感文件检测——只是格式转换/页面重排，跟合并拆分同一性质。
# ---------------------------------------------------------------------------

_A4_PT = (595.0, 842.0)  # A4 in PostScript points (72dpi)


def _images_to_pdf_sync(images: list[bytes], page_size: str) -> bytes:
    from PIL import Image as PILImage, ImageOps

    pages: list[PILImage.Image] = []
    for raw in images:
        try:
            im = PILImage.open(io.BytesIO(raw))
            im = ImageOps.exif_transpose(im).convert("RGB")
        except Exception:
            raise ValueError("有文件不是能识别的图片")
        if max(im.size) > 3000:
            s = 3000 / max(im.size)
            im = im.resize((round(im.width * s), round(im.height * s)), PILImage.LANCZOS)
        if page_size == "a4":
            # A4 @150dpi 白底画布，图片等比缩放居中（resolution=150 存出，页面即真实 A4 尺寸）
            canvas_w, canvas_h = 1240, 1754
            if im.width > im.height:
                canvas_w, canvas_h = canvas_h, canvas_w
            scale = min(canvas_w / im.width, canvas_h / im.height)
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), PILImage.LANCZOS)
            bg = PILImage.new("RGB", (canvas_w, canvas_h), "white")
            bg.paste(im, ((canvas_w - im.width) // 2, (canvas_h - im.height) // 2))
            im = bg
        pages.append(im)

    buf = io.BytesIO()
    pages[0].save(buf, "PDF", save_all=True, append_images=pages[1:], resolution=150.0)
    return buf.getvalue()


@router.post("/images-to-pdf")
async def images_to_pdf(
    files: List[UploadFile] = File(...),
    page_size: str = Form("auto"),
):
    """多张图片打包成一个 PDF。page_size=auto 每页贴合图片本身比例；a4 统一放进 A4 白底居中。
    跟「照片转扫描件」不同——这个不做任何图像处理，就是原样打包。"""
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一张图片")
    if len(files) > _MAX_IMAGES_TO_PDF:
        raise HTTPException(status_code=400, detail=f"一次最多 {_MAX_IMAGES_TO_PDF} 张图片")
    images = [await f.read() for f in files]
    if sum(len(b) for b in images) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片总体积超过 100MB")
    try:
        pdf_bytes = await asyncio.to_thread(_images_to_pdf_sync, images, "a4" if page_size == "a4" else "auto")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=images.pdf"},
    )


def _pdf_to_images_sync(data: bytes, fmt: str, dpi: int) -> bytes:
    import fitz  # PyMuPDF

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise ValueError("不是有效的 PDF 文件")
    if doc.needs_pass:
        raise ValueError("这个 PDF 有密码，请先在「PDF 解密」里去掉密码")
    if doc.page_count > _MAX_RENDER_PAGES:
        raise ValueError(f"PDF 超过 {_MAX_RENDER_PAGES} 页，转图片请先拆分")

    ext = "jpg" if fmt == "jpg" else "png"
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i in range(doc.page_count):
            pix = doc.load_page(i).get_pixmap(dpi=dpi)
            if ext == "jpg":
                img_bytes = pix.tobytes("jpg", jpg_quality=90)
            else:
                img_bytes = pix.tobytes("png")
            zf.writestr(f"page_{i + 1:03d}.{ext}", img_bytes)
    doc.close()
    return zip_buf.getvalue()


@router.post("/to-images")
async def pdf_to_images(
    file: UploadFile = File(...),
    fmt: str = Form("png"),
    dpi: int = Form(150),
):
    """PDF 每页导出成图片，打包 ZIP。dpi 限 72~300。"""
    data = await file.read()
    dpi = max(72, min(300, dpi))
    async with _RENDER_SEM:
        try:
            zip_bytes = await asyncio.to_thread(_pdf_to_images_sync, data, fmt, dpi)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=pages.zip"},
    )


@router.post("/encrypt")
async def encrypt_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    """给 PDF 加打开密码。"""
    if not password.strip():
        raise HTTPException(status_code=400, detail="密码不能为空")
    reader = _read_pdf(await file.read(), file.filename or "文件")
    if reader.is_encrypted:
        raise HTTPException(status_code=400, detail="这个 PDF 已经加密了")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(password)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=encrypted.pdf"},
    )


@router.post("/decrypt")
async def decrypt_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    """已知密码，去掉 PDF 的打开密码。只能处理自己知道密码的文件，不是破解。"""
    try:
        reader = PdfReader(io.BytesIO(await file.read()))
    except PdfReadError:
        raise HTTPException(status_code=400, detail="不是有效的 PDF 文件")
    if reader.is_encrypted:
        if reader.decrypt(password) == 0:
            raise HTTPException(status_code=400, detail="密码不对")
    else:
        raise HTTPException(status_code=400, detail="这个 PDF 没有加密，不需要解密")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=decrypted.pdf"},
    )


@router.post("/pages")
async def edit_pdf_pages(
    file: UploadFile = File(...),
    op: str = Form(...),
    pages: str = Form(...),
    angle: int = Form(90),
):
    """页面管理：op=delete 删除指定页 / op=extract 只保留指定页 / op=rotate 旋转指定页。
    pages 用「1,3,5-8」这种格式；rotate 时 angle 取 90/180/270。"""
    reader = _read_pdf(await file.read(), file.filename or "文件")
    total = len(reader.pages)
    ranges = _parse_ranges(pages, total)
    selected = sorted({i for start, end in ranges for i in range(start, end + 1)})

    writer = PdfWriter()
    if op == "delete":
        keep = [i for i in range(total) if i not in set(selected)]
        if not keep:
            raise HTTPException(status_code=400, detail="不能把所有页都删掉")
        for i in keep:
            writer.add_page(reader.pages[i])
    elif op == "extract":
        for i in selected:
            writer.add_page(reader.pages[i])
    elif op == "rotate":
        if angle not in (90, 180, 270):
            raise HTTPException(status_code=400, detail="旋转角度只能是 90 / 180 / 270")
        sel = set(selected)
        for i in range(total):
            page = reader.pages[i]
            if i in sel:
                page.rotate(angle)
            writer.add_page(page)
    else:
        raise HTTPException(status_code=400, detail="未知操作")

    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={op}.pdf"},
    )


@router.get("/doc-templates")
async def doc_templates():
    return {"templates": doc_format.templates()}


@router.get("/doc-skeleton")
async def doc_skeleton(key: str):
    return {"text": doc_format.skeleton(key)}


_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


@router.post("/text-to-pptx")
async def text_to_pptx(text: str = Form(...), title: str = Form("")):
    """结构化文字 -> PPT 大纲（一级标题一页，其下条目当要点）。纯本地 python-pptx。"""
    if len(text) > 200_000:
        raise HTTPException(status_code=413, detail="文本过长")
    try:
        data = await asyncio.to_thread(office_tools.text_to_pptx, text, title.strip() or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(io.BytesIO(data), media_type=_PPTX_MIME,
                             headers={"Content-Disposition": "attachment; filename=outline.pptx"})


@router.post("/images-to-pptx")
async def images_to_pptx(files: List[UploadFile] = File(...)):
    """每张图片一页。"""
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一张图片")
    if len(files) > 60:
        raise HTTPException(status_code=400, detail="一次最多 60 张")
    imgs = [await f.read() for f in files]
    if sum(len(b) for b in imgs) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片总体积超过 100MB")
    data = await asyncio.to_thread(office_tools.images_to_pptx, imgs)
    return StreamingResponse(io.BytesIO(data), media_type=_PPTX_MIME,
                             headers={"Content-Disposition": "attachment; filename=slides.pptx"})


@router.post("/payslips")
async def payslips(file: UploadFile = File(...), slip_title: str = Form(""), per_page: int = Form(12)):
    """工资总表 -> 每人一条工资条，堆在一个 xlsx 里，打印后裁开。"""
    data = await file.read()
    try:
        out = await asyncio.to_thread(office_tools.payslips, data, slip_title.strip(), max(1, min(40, per_page)))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"无法处理这个表格：{str(e)[:200]}")
    return StreamingResponse(io.BytesIO(out), media_type=_XLSX_MIME,
                             headers={"Content-Disposition": "attachment; filename=payslips.xlsx"})


@router.post("/merge-sheets")
async def merge_sheets(
    files: List[UploadFile] = File(...),
    dedupe: str = Form("false"),
    key_column: str = Form(""),
):
    """多个 Excel 合并成一个，可按整行或指定列去重。"""
    if not files:
        raise HTTPException(status_code=400, detail="请至少上传一个 Excel 文件")
    if len(files) > 30:
        raise HTTPException(status_code=400, detail="一次最多 30 个文件")
    blobs = [await f.read() for f in files]
    try:
        out = await asyncio.to_thread(
            office_tools.merge_sheets, blobs, dedupe == "true", key_column.strip()
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(io.BytesIO(out), media_type=_XLSX_MIME,
                             headers={"Content-Disposition": "attachment; filename=merged.xlsx"})


@router.post("/format-doc")
async def format_doc(
    text: str = Form(...),
    template: str = Form("general"),
    title: str = Form(""),
):
    """把 AI 生成的带 markdown 符号、没排版的文本，解析后按中文办公模板重排成 .docx。
    纯本地 python-docx 生成，不调任何模型——用户自己的文字自己排版。"""
    if len(text) > 200_000:
        raise HTTPException(status_code=413, detail="文本过长，请分批处理")
    try:
        docx_bytes = await asyncio.to_thread(doc_format.format_to_docx, text, template, title.strip() or None)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=formatted.docx"},
    )
