import asyncio
import base64
import json
import re
import subprocess
import sys

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app import auth, models
from app.config import OPENLUX_API_KEY, OPENLUX_BASE_URL, VIDU_API_KEY, VIDU_BASE_URL
from app.schemas import (
    ChatCompletionRequest,
    DesignGenerateRequest,
    ImageGenerationRequest,
    VideoGenerateRequest,
)

router = APIRouter(prefix="/api/ai", tags=["ai-proxy"])

# 跟 imageApi.ts 里的 ASPECT_SIZE 保持一致的 5 档比例，图片槽按宽高比就近取一档
_ASPECT_SIZES: list[tuple[str, int, int]] = [
    ("1:1", 768, 768),
    ("3:4", 768, 1024),
    ("4:3", 1024, 768),
    ("9:16", 576, 1024),
    ("16:9", 1024, 576),
]
_DESIGN_MAX_ELEMENTS = 12


def _require_openlux():
    if not OPENLUX_API_KEY:
        raise HTTPException(status_code=503, detail="AI 服务未配置，请联系管理员")


def _require_vidu():
    if not VIDU_API_KEY:
        raise HTTPException(status_code=503, detail="AI 视频服务未配置，请联系管理员")


async def _post_openlux(url: str, timeout: float, max_retries: int = 2, **kwargs) -> httpx.Response:
    """统一处理超时异常 + 429（"上游负载已饱和"，官方原话是临时性的、稍后重试即可）自动退避重试，
    避免每个转发接口都重复写这段逻辑。detail 里不带中文前缀——前端 authPostJson 自己会按各自场景拼
    "生成接口请求失败"/"消除接口请求失败"这类 label，后端再拼一遍会导致文案重复两遍。"""
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(url, **kwargs)
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=504, detail=f"请求超时或网络异常，请重试：{exc}")
        if res.status_code != 429 or attempt == max_retries:
            return res
        await asyncio.sleep(3 * (attempt + 1))
    return res  # 理论上循环内已经 return，这行只是让类型检查满意


@router.post("/images/generations")
async def images_generations(
    payload: ImageGenerationRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/images/generations",
        timeout=170,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json=payload.model_dump(),
    )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"{res.status_code} {res.text}")
    return res.json()


@router.post("/images/edits")
async def images_edits(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(...),
    model: str = Form("gpt-image-2"),
    n: int = Form(1),
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    image_bytes = await image.read()
    mask_bytes = await mask.read()
    res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/images/edits",
        timeout=170,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        data={"model": model, "prompt": prompt, "n": str(n)},
        files={
            "image": (image.filename or "image.png", image_bytes, image.content_type or "image/png"),
            "mask": (mask.filename or "mask.png", mask_bytes, mask.content_type or "image/png"),
        },
    )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"{res.status_code} {res.text}")
    return res.json()


def _run_bg_removal_subprocess(image_bytes: bytes) -> subprocess.CompletedProcess:
    """用同步 subprocess.run（不是 asyncio.create_subprocess_exec）——后者在 Windows 上
    uvicorn --reload 强制用的 SelectorEventLoop 下会直接抛 NotImplementedError（Windows
    独有的坑，asyncio 文档里写明 selector loop 不支持子进程；Linux 生产环境不受影响，
    但这样写本地 Windows 开发环境也能跑通同一条代码路径，不用靠"生产是 Linux 应该没事"硬赌）。
    外层用 asyncio.to_thread 扔到线程池，不阻塞事件循环。"""
    return subprocess.run(
        [sys.executable, "-m", "app.bg_removal_worker"],
        input=image_bytes,
        capture_output=True,
        timeout=170,
    )


@router.post("/background-removal")
async def background_removal(
    image: UploadFile = File(...),
    _user: models.User = Depends(auth.get_current_user),
):
    """本地跑 rembg（u2net 模型），不依赖任何第三方 key。放到独立子进程里跑（见
    bg_removal_worker.py）——模型稳定态占约 1GB RSS，不能常驻在主 uvicorn 进程里，
    不然这台 2 核 2GB 的机器迟早被这个功能拖垮。首次调用要下载模型（~176MB），
    会明显慢一次，之后走本地缓存就快了（现测 <1s）。"""
    image_bytes = await image.read()
    try:
        proc = await asyncio.to_thread(_run_bg_removal_subprocess, image_bytes)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="抠图处理超时，请重试")
    if proc.returncode != 0:
        raise HTTPException(status_code=502, detail=f"抠图处理失败：{proc.stderr.decode(errors='ignore')[:500]}")
    b64 = base64.b64encode(proc.stdout).decode()
    return {"data": [{"b64_json": b64}]}


@router.post("/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/chat/completions",
        timeout=60,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json=payload.model_dump(),
    )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"{res.status_code} {res.text}")
    return res.json()


@router.post("/video/generate")
async def video_generate(
    payload: VideoGenerateRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_vidu()
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{VIDU_BASE_URL}/ent/v2/text2video",
            headers={"Authorization": f"Bearer {VIDU_API_KEY}", "Accept": "application/json"},
            json=payload.model_dump(),
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"视频生成接口请求失败：{res.status_code} {res.text}")
    return res.json()


@router.get("/video/tasks/{task_id}")
async def video_task_status(
    task_id: str,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_vidu()
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(
            f"{VIDU_BASE_URL}/ent/v2/tasks/{task_id}/creations",
            headers={"Authorization": f"Bearer {VIDU_API_KEY}", "Accept": "application/json"},
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"视频任务状态查询失败：{res.status_code} {res.text}")
    return res.json()


def _clamp_num(value, lo: float, hi: float, default: float) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, num))


def _nearest_image_size(width: float, height: float) -> str:
    target_ratio = (width / height) if height else 1.0
    _, w, h = min(_ASPECT_SIZES, key=lambda item: abs((item[1] / item[2]) - target_ratio))
    return f"{w}x{h}"


def _sanitize_design_elements(
    raw_elements: object, canvas_width: int, canvas_height: int, allowed_fonts: list[str]
) -> list[dict]:
    if not isinstance(raw_elements, list):
        return []
    sanitized: list[dict] = []
    for el in raw_elements[:_DESIGN_MAX_ELEMENTS]:
        if not isinstance(el, dict) or el.get("type") not in ("text", "image", "rect"):
            continue
        x = int(_clamp_num(el.get("x"), 0, canvas_width, 0))
        y = int(_clamp_num(el.get("y"), 0, canvas_height, 0))
        width = int(_clamp_num(el.get("width"), 1, canvas_width, min(200, canvas_width)))

        if el["type"] == "text":
            text = str(el.get("text") or "").strip()[:200]
            if not text:
                continue
            font_family = el.get("fontFamily")
            if not isinstance(font_family, str) or font_family not in allowed_fonts:
                font_family = allowed_fonts[0] if allowed_fonts else None
            item = {
                "type": "text",
                "x": x,
                "y": y,
                "width": width,
                "text": text,
                "fontSize": int(_clamp_num(el.get("fontSize"), 10, 160, 32)),
                "fontWeight": str(el.get("fontWeight") or "normal"),
                "color": str(el.get("color") or "#000000"),
                "align": el.get("align") if el.get("align") in ("left", "center", "right") else "left",
            }
            if font_family:
                item["fontFamily"] = font_family
            sanitized.append(item)
        elif el["type"] == "rect":
            height = int(_clamp_num(el.get("height"), 1, canvas_height, min(200, canvas_height)))
            sanitized.append(
                {
                    "type": "rect",
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                    "fill": str(el.get("fill") or "#000000"),
                    "rx": int(_clamp_num(el.get("rx"), 0, 200, 0)),
                }
            )
        elif el["type"] == "image":
            height = int(_clamp_num(el.get("height"), 1, canvas_height, min(200, canvas_height)))
            image_prompt = el.get("imagePrompt")
            if not isinstance(image_prompt, str) or not image_prompt.strip():
                continue
            sanitized.append(
                {
                    "type": "image",
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                    "imagePrompt": image_prompt.strip()[:300],
                }
            )
    return sanitized


@router.post("/design/generate")
async def design_generate(
    payload: DesignGenerateRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    """
    AI 一键生成设计：先让文字模型拟一版版式 JSON（图片元素只给 imagePrompt），
    再并发调图片生成把 imagePrompt 换成真实 src，最后拼装成 CanvasElement[] 返回。
    未经真实联调验证——如果调用报错或解析失败，把报错信息发给我，按实际返回结构调整。
    """
    _require_openlux()

    allowed_fonts = [f.value for f in payload.fonts] or ["sans-serif"]
    font_list_text = "\n".join(f"- {f.label}：{f.value}" for f in payload.fonts) or "- 默认：sans-serif"

    system_prompt = (
        f"你是专业的平面设计师。请为一个宽 {payload.canvas_width}px、高 {payload.canvas_height}px 的画布设计一版海报/宣传图版式。\n"
        "只能使用三种元素类型：\n"
        "- text：{type:'text', x, y, width, text, fontSize, fontWeight, color, align, fontFamily}\n"
        "- image：{type:'image', x, y, width, height, imagePrompt}（用 imagePrompt 描述这张图应该是什么内容，不要写 src）\n"
        "- rect：{type:'rect', x, y, width, height, fill, rx}\n"
        f"可选字体（fontFamily 必须从下面列表里原样选一个，不要自己编）：\n{font_list_text}\n\n"
        "只返回一个严格的 JSON 对象，不要 markdown 代码块，不要任何多余说明文字，形如：\n"
        '{"background": "#ffffff", "elements": [ ... ]}\n'
        "要求：elements 数量 4~12 个；所有坐标、宽高不能超出画布范围；文案要贴合用户描述的主题，"
        "写真实、具体的中文文案，不要用「标题」「正文」这类占位字样；整体版面要有主次层次（标题/副标题/正文/装饰色块）。\n"
        "字体选择要有主次区分，不要所有文字都用同一个字体：标题、副标题这类需要吸引注意力的文字，"
        "优先挑选列表里风格醒目/有辨识度的字体（比如手写体、圆体、书法风格），不要默认全用「默认」这个选项；"
        "正文说明、联系方式这类信息性文字，选清晰易读的字体即可。同一版设计里可以搭配 2~3 种不同字体，避免单调。"
    )

    async with httpx.AsyncClient(timeout=60) as client:
        chat_res = await client.post(
            f"{OPENLUX_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json={
                "model": "gemini-3-flash-preview",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": payload.prompt},
                ],
            },
        )
    if chat_res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"设计生成接口请求失败：{chat_res.status_code} {chat_res.text}")

    content = chat_res.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    match = re.search(r"\{[\s\S]*\}", content)
    try:
        parsed = json.loads(match.group(0) if match else content)
    except (json.JSONDecodeError, AttributeError):
        raise HTTPException(status_code=502, detail="AI 设计生成解析失败，请重试")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI 设计生成解析失败，请重试")

    background = str(parsed.get("background") or "#ffffff")
    elements = _sanitize_design_elements(
        parsed.get("elements"), payload.canvas_width, payload.canvas_height, allowed_fonts
    )

    async def _fill_image(el: dict) -> dict | None:
        size = _nearest_image_size(el["width"], el["height"])
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                res = await client.post(
                    f"{OPENLUX_BASE_URL}/images/generations",
                    headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
                    json={"model": "gpt-image-2", "prompt": el["imagePrompt"], "n": 1, "size": size},
                )
            if res.status_code >= 400:
                return None
            data = (res.json().get("data") or [None])[0]
            if not data:
                return None
            src = data.get("url") or (f"data:image/png;base64,{data['b64_json']}" if data.get("b64_json") else None)
            if not src:
                return None
            return {"type": "image", "x": el["x"], "y": el["y"], "width": el["width"], "height": el["height"], "src": src}
        except httpx.HTTPError:
            return None

    image_indices = [i for i, el in enumerate(elements) if el["type"] == "image"]
    filled = (
        await asyncio.gather(*(_fill_image(elements[i]) for i in image_indices)) if image_indices else []
    )
    filled_by_index = dict(zip(image_indices, filled))

    final_elements = []
    for i, el in enumerate(elements):
        if el["type"] == "image":
            replacement = filled_by_index.get(i)
            if replacement is not None:
                final_elements.append(replacement)
            # 图片生成失败就整个丢掉这个槽位，不让整个请求失败
        else:
            final_elements.append(el)

    return {"background": background, "elements": final_elements}
