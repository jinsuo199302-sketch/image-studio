import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app import auth, models
from app.config import OPENLUX_API_KEY, OPENLUX_BASE_URL, VIDU_API_KEY, VIDU_BASE_URL
from app.schemas import ChatCompletionRequest, ImageGenerationRequest, VideoGenerateRequest

router = APIRouter(prefix="/api/ai", tags=["ai-proxy"])


def _require_openlux():
    if not OPENLUX_API_KEY:
        raise HTTPException(status_code=503, detail="AI 服务未配置，请联系管理员")


def _require_vidu():
    if not VIDU_API_KEY:
        raise HTTPException(status_code=503, detail="AI 视频服务未配置，请联系管理员")


@router.post("/images/generations")
async def images_generations(
    payload: ImageGenerationRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{OPENLUX_BASE_URL}/images/generations",
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json=payload.model_dump(),
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"生成接口请求失败：{res.status_code} {res.text}")
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
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{OPENLUX_BASE_URL}/images/edits",
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            data={"model": model, "prompt": prompt, "n": str(n)},
            files={
                "image": (image.filename or "image.png", image_bytes, image.content_type or "image/png"),
                "mask": (mask.filename or "mask.png", mask_bytes, mask.content_type or "image/png"),
            },
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"消除接口请求失败：{res.status_code} {res.text}")
    return res.json()


@router.post("/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{OPENLUX_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json=payload.model_dump(),
        )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"生成接口请求失败：{res.status_code} {res.text}")
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
