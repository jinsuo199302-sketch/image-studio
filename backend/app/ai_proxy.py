import asyncio
import base64
import io
import json
import math
import re
import subprocess
import sys
import uuid

import cv2
import httpx
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image as PILImage
from sqlalchemy.orm import Session

from app import auth, crud, models
from app import content_research
from app.config import (
    BASE_DIR,
    DISABLE_SENSITIVE_DOC_CHECK,
    OPENLUX_API_KEY,
    OPENLUX_BASE_URL,
    VIDU_API_KEY,
    VIDU_BASE_URL,
)
from app.database import get_db
from app.design_tokens import COMPONENT_SIZE
from app.text_metrics import chars_per_line, estimate_text_height, estimate_text_lines
from app import layout_presets
from app.schemas import (
    ChatCompletionRequest,
    ContentResearchRequest,
    DesignGenerateRequest,
    DesignLayoutRequest,
    LayoutPresetRequest,
    ImageGenerationRequest,
    VideoGenerateRequest,
)

router = APIRouter(prefix="/api/ai", tags=["ai-proxy"])

# "参考图生成"产出的背景图自动存一份到这里，供"素材"面板浏览/删除——只存文件名不存完整 URL，
# 换域名/端口不用改数据；实际对外访问路径由 main.py 把这个目录挂到 /api/ai/generated 静态托管。
GENERATED_ASSETS_DIR = BASE_DIR / "generated_assets"
GENERATED_ASSETS_DIR.mkdir(exist_ok=True)


def _persist_asset_bytes(db: Session, user_id: str, category: str, image_bytes: bytes) -> models.GeneratedAsset:
    file_name = f"{uuid.uuid4().hex}.png"
    (GENERATED_ASSETS_DIR / file_name).write_bytes(image_bytes)
    return crud.create_generated_asset(db, user_id, category, file_name)


async def _save_generated_asset(db: Session, user_id: str, category: str, src: str) -> models.GeneratedAsset:
    """src 可能是 data URI（gpt-image-2 直接返回 b64_json 时）或外部 URL（返回 url 时）——
    两种都落盘成本地文件，不满足于存一个可能过期/限流的外链，"自动保存"才是真的能一直看到。"""
    if src.startswith("data:"):
        _, b64data = src.split(",", 1)
        image_bytes = base64.b64decode(b64data)
    else:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.get(src)
            res.raise_for_status()
            image_bytes = res.content
    return _persist_asset_bytes(db, user_id, category, image_bytes)


async def _extract_openai_image_bytes(gen_json: dict, error_prefix: str) -> bytes:
    data = (gen_json.get("data") or [None])[0]
    if not data:
        raise HTTPException(status_code=502, detail=f"{error_prefix}未返回图片数据")
    if data.get("b64_json"):
        return base64.b64decode(data["b64_json"])
    url = data.get("url")
    if not url:
        raise HTTPException(status_code=502, detail=f"{error_prefix}未返回可用图片数据")
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.content

# 跟 imageApi.ts 里的 ASPECT_SIZE 保持一致的 5 档比例，图片槽按宽高比就近取一档
_ASPECT_SIZES: list[tuple[str, int, int]] = [
    ("1:1", 768, 768),
    ("3:4", 768, 1024),
    ("4:3", 1024, 768),
    ("9:16", 576, 1024),
    ("16:9", 1024, 576),
]
_DESIGN_MAX_ELEMENTS = 12
# /design/layout 的元素上限比 /design/generate 高不少——那边是"AI 自己编内容"，
# 丢一个装饰性元素问题不大；这边是"用户原文一个字都不能丢"，同一份内容切分成的
# text/icon-list 项数天然就比一版凭空创作的海报多，加上 AI 还会自己加几个装饰性
# 色块/图片，12 个很容易在内容还没排完之前就被截断（实测过：真的截断过一次）。
_LAYOUT_MAX_ELEMENTS = 24


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


# 生图/写作/AI消除三个"用户自由输入直达生成能力"的入口专用合规检查——design/generate、
# reference-to-background 这类内部业务逻辑自己拼系统 prompt 调 openlux，不走这层，
# 不需要也不应该被这个检查拦（用户填不了自由文本，风险面完全不同）。
# 不是接的专业内容审核 API（没有这类订阅），是借同一个对话模型做 best-effort 分类——
# 不追求完美，重点是明确挡住"帮忙P证件/仿造官方文件"这类一眼能判断出来的高风险请求。
_ILLEGAL_TEXT_REQUEST_INSTRUCTION = """You are a content-safety classifier for an ordinary consumer design/writing tool (posters, ads, articles, translations, illustrations, etc.). Given the user's request below, decide whether fulfilling it would likely facilitate illegal activity under Chinese law — for example: forging or altering an official ID card/passport/driver's license/household register/certificate/diploma/official seal/government document; counterfeiting currency, stamps, or financial instruments; producing fraudulent contracts, invoices, or medical/legal documents; or otherwise clearly facilitating fraud, forgery, or another crime.

The overwhelming majority of requests to this tool are completely legitimate. Only answer REJECT when illegal intent is reasonably clear from the request itself — when in doubt, or for an ordinary creative/business request, answer ALLOW.

User request:
\"\"\"
{content}
\"\"\"

Respond with EXACTLY one line, no other text:
ALLOW
or
REJECT: <one short Chinese sentence explaining why>"""

_SENSITIVE_DOCUMENT_IMAGE_CHECK_INSTRUCTION = """Look at this image carefully. Does it show — fully, partially, or as a photo/scan/screenshot of one — any of the following:
- a government-issued ID card, passport, driver's license, household register, certificate, diploma, official seal/stamp, or banknote; OR
- a financial/business document such as an invoice (发票), receipt (收据), expense reimbursement form (报销单), bank statement, payslip, or contract?

Respond with EXACTLY one word, no other text: YES or NO."""


async def _moderate_text(content: str) -> None:
    """涉及生图/写作的用户自由文本先过一遍合规判断，命中 REJECT 直接 403。
    分类调用本身失败（超时/网络异常/解析失败）一律当成检查失败拒绝这次请求，
    不静默放行——宁可用户重试一次，不能让检查失效变成事实上没有这层拦截。"""
    if not content or not content.strip():
        return
    try:
        res = await _post_openlux(
            f"{OPENLUX_BASE_URL}/chat/completions",
            timeout=30,
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json={
                "model": "gemini-3-flash-preview",
                "messages": [{"role": "user", "content": _ILLEGAL_TEXT_REQUEST_INSTRUCTION.format(content=content[:2000])}],
            },
        )
        if res.status_code >= 400:
            raise ValueError(f"{res.status_code} {res.text}")
        verdict = res.json()["choices"][0]["message"]["content"].strip()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="内容安全检查失败，请重试")
    if verdict.upper().startswith("REJECT"):
        reason = verdict.split(":", 1)[1].strip() if ":" in verdict else "该请求可能涉及违法内容"
        raise HTTPException(status_code=403, detail=f"请求已被拒绝：{reason}")


async def _check_not_sensitive_document(image_bytes: bytes, media_type: str, feature_label: str) -> None:
    """凡是接受用户上传图片的功能都要过这一层——先判断上传图是不是身份证/证件/公文，或者
    发票/报销单/银行流水这类财务票据，防止被用来篡改/伪造这些材料。所有工具统一走这一个
    分类器，不是只有 AI 消除才防，跟 _moderate_text 一样：分类调用本身失败就拒绝这次请求，
    不静默放行。feature_label 只用来给拒绝提示换个功能名字，检测逻辑完全一样。

    DISABLE_SENSITIVE_DOC_CHECK=1 时整个跳过（本地/自测用，见 config.py 注释）。"""
    if DISABLE_SENSITIVE_DOC_CHECK:
        print(f"[WARN] 敏感文件检查已被 DISABLE_SENSITIVE_DOC_CHECK 关闭，放行 {feature_label} 请求", file=sys.stderr, flush=True)
        return
    b64 = base64.b64encode(image_bytes).decode()
    try:
        res = await _post_openlux(
            f"{OPENLUX_BASE_URL}/chat/completions",
            timeout=30,
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json={
                "model": "gemini-3-flash-preview",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": _SENSITIVE_DOCUMENT_IMAGE_CHECK_INSTRUCTION},
                            {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                        ],
                    }
                ],
            },
        )
        if res.status_code >= 400:
            raise ValueError(f"{res.status_code} {res.text}")
        verdict = res.json()["choices"][0]["message"]["content"].strip().upper()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="内容安全检查失败，请重试")
    if verdict.startswith("YES"):
        raise HTTPException(
            status_code=403,
            detail=f"为防止被用于伪造证件/票据，{feature_label}功能不支持处理身份证、证件、发票、报销单等敏感文件类图片",
        )


@router.post("/images/generations")
async def images_generations(
    payload: ImageGenerationRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    await _moderate_text(payload.prompt)
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
    await _check_not_sensitive_document(image_bytes, image.content_type or "image/png", "AI 消除/文字替换")
    await _moderate_text(prompt)
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


# 参考图→整图背景生成这条链路专用：只要求视觉模型输出"氛围/色调 + 元素类别 + 构图留白说明"
# 这个粒度的风格描述，不要具体坐标/精确外形/可读文字——这是守住"参考图边界判断指南"里
# 版权红线的关键机制，格式严格照抄党建展板那次人工写的 prompt 验证过管用的结构。
_REFERENCE_STYLE_PROMPT_INSTRUCTION = """You are extracting a STYLE-DESCRIPTION prompt from a reference poster image, to be used as input for a text-to-image generation model. Write ONE paragraph in Chinese, following exactly this structure: [整体氛围/光影/色调] + [核心视觉元素类别，用类别名词，不是精确外形] + [构图与留白说明，供后续叠加文字用]。

Strict rules:
- Do NOT include precise coordinates, exact positions, exact sizes/proportions, or counts.
- Do NOT transcribe or describe any specific readable text/words visible in the image.
- Do NOT describe exact rendering details that would let someone reconstruct the image precisely. Describe visual elements only as CATEGORY/TYPE the way a mood-board brief would, not as a blueprint.
- Match the length, tone, and format of this reference example exactly:
"国风，柔和金色光影，飘扬的五星红旗元素、华表、长城剪影、和平鸽、祥云纹样、飘带，简约肌理底纹，画面上方三分之一留白，不能出现文字"
- Output ONLY the style-description paragraph itself, in Chinese, no markdown, no extra commentary, no quotation marks around it.

After that paragraph, on a NEW final line, classify ONLY the RENDERING TECHNIQUE CATEGORY of the reference poster's main title text (never its exact wording, font, or precise shape) using this exact format:
TITLE_STYLE: <effect> <shape>
where <effect> is exactly one of: outline | emboss | neon | plain
and <shape> is exactly one of: straight | arc | wave | ribbon | circle
Pick the closest category by technique only, e.g. a poster with a raised/3D-looking title with soft drop shadow -> "emboss straight"; a title curved along a banner -> "outline arc". If unsure, use "plain straight"."""


_TITLE_EFFECT_MAP = {"outline": "outline", "emboss": "emboss", "neon": "neon", "plain": "none"}
_TITLE_SHAPE_MAP = {"straight": "none", "arc": "arc-up", "wave": "wave", "ribbon": "flag", "circle": "ring"}
_DEFAULT_TITLE_STYLE = {"effect": "none", "warp": "none"}


def _parse_title_style(raw_content: str) -> tuple[str, dict]:
    """从视觉模型输出里拆出末尾的 TITLE_STYLE 分类行，映射成编辑器已有的文字特效/变形预设名。
    只学"手法类别"（描边/浮雕/霓虹 + 直线/拱形/波浪/旗帜/圆环），不涉及具体字形/字体，
    是 [[feedback_reference_image_boundary]] 里"工艺手法可学习复用，具体表达要自己重新实现"
    这条原则在标题文字上的落地。格式解析失败一律回退成"无特效"，不能让格式问题打断生成链路。"""
    lines = raw_content.strip().splitlines()
    if not lines or not lines[-1].strip().upper().startswith("TITLE_STYLE:"):
        return raw_content.strip(), dict(_DEFAULT_TITLE_STYLE)
    style_description = "\n".join(lines[:-1]).strip()
    tokens = lines[-1].split(":", 1)[1].strip().lower().split()
    effect = _TITLE_EFFECT_MAP.get(tokens[0], "none") if tokens else "none"
    warp = _TITLE_SHAPE_MAP.get(tokens[1], "none") if len(tokens) >= 2 else "none"
    return style_description or raw_content.strip(), {"effect": effect, "warp": warp}


@router.post("/design/reference-to-background")
async def design_reference_to_background(
    image: UploadFile = File(...),
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """参考图 → 风格描述（视觉模型，只提取氛围/元素类别/构图留白，不提取可判定为复刻的精确细节）
    → 整图背景生成（gpt-image-2）。三次跨风格实测（国风红金/卡通插画/极简科技）验证过，
    质量稳定在 tpl-board-party-building 那次人工调用的水准，全部一次生成成功。
    标题/副标题文字层不在这里加——那部分复用前端已有的文字编辑能力，用户自己调。"""
    _require_openlux()
    image_bytes = await image.read()
    media_type = image.content_type or "image/png"
    await _check_not_sensitive_document(image_bytes, media_type, "参考图生成")
    b64_in = base64.b64encode(image_bytes).decode()

    vision_res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/chat/completions",
        timeout=60,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json={
            "model": "gemini-3-flash-preview",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _REFERENCE_STYLE_PROMPT_INSTRUCTION},
                        {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64_in}"}},
                    ],
                }
            ],
        },
    )
    if vision_res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"参考图风格分析失败：{vision_res.status_code} {vision_res.text}")
    raw_content = vision_res.json()["choices"][0]["message"]["content"].strip()
    style_description, title_style = _parse_title_style(raw_content)

    gen_res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/images/generations",
        timeout=170,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json={"model": "gpt-image-2", "prompt": style_description, "n": 1, "size": "1024x1536"},
    )
    if gen_res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"背景图生成失败：{gen_res.status_code} {gen_res.text}")
    data = (gen_res.json().get("data") or [None])[0]
    if not data:
        raise HTTPException(status_code=502, detail="背景图生成未返回图片数据")
    src = data.get("url") or (f"data:image/png;base64,{data['b64_json']}" if data.get("b64_json") else None)
    if not src:
        raise HTTPException(status_code=502, detail="背景图生成未返回可用图片数据")

    asset_id = None
    try:
        asset = await _save_generated_asset(db, user.id, "reference-background", src)
        asset_id = asset.id
    except Exception:
        pass  # 自动保存失败不能拖累主流程——用户还是要拿到刚生成的背景图，大不了这次没存进素材库

    return {"backgroundSrc": src, "styleDescription": style_description, "titleStyle": title_style, "assetId": asset_id}


@router.get("/assets")
def list_generated_assets(
    category: str | None = None,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """"素材"面板用——只列当前登录用户自己生成/保存的图，私有，不是公共素材库。"""
    rows = crud.list_generated_assets(db, user.id, category)
    return {
        "list": [
            {"id": r.id, "category": r.category, "url": f"/api/ai/generated/{r.file_name}", "createdAt": r.created_at.isoformat()}
            for r in rows
        ]
    }


@router.delete("/assets/{asset_id}")
def delete_generated_asset(
    asset_id: str,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    asset = crud.get_generated_asset(db, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="素材不存在")
    file_path = GENERATED_ASSETS_DIR / asset.file_name
    if file_path.exists():
        file_path.unlink()
    crud.delete_generated_asset(db, asset_id)
    return {"deleted": True}


def _run_bg_removal_subprocess(image_bytes: bytes, edge: str = "soft") -> subprocess.CompletedProcess:
    """用同步 subprocess.run（不是 asyncio.create_subprocess_exec）——后者在 Windows 上
    uvicorn --reload 强制用的 SelectorEventLoop 下会直接抛 NotImplementedError（Windows
    独有的坑，asyncio 文档里写明 selector loop 不支持子进程；Linux 生产环境不受影响，
    但这样写本地 Windows 开发环境也能跑通同一条代码路径，不用靠"生产是 Linux 应该没事"硬赌）。
    外层用 asyncio.to_thread 扔到线程池，不阻塞事件循环。edge 透传给 worker 决定边缘处理档位。"""
    return subprocess.run(
        [sys.executable, "-m", "app.bg_removal_worker", edge],
        input=image_bytes,
        capture_output=True,
        timeout=170,
    )


@router.post("/background-removal")
async def background_removal(
    image: UploadFile = File(...),
    edge: str = Form("soft"),
    _user: models.User = Depends(auth.get_current_user),
):
    """本地跑 rembg（isnet-general-use 模型）本身不依赖任何第三方 key，但合规检查需要调用
    openlux 的视觉模型，所以这个接口现在也要求 OPENLUX_API_KEY 配置好——这是"所有工具统一走
    一层敏感文件检测"这条要求带来的必然依赖，不是抠图本身需要。放到独立子进程里跑（见
    bg_removal_worker.py）——模型稳定态占约 1GB RSS，不能常驻在主 uvicorn 进程里，
    不然这台 2 核 2GB 的机器迟早被这个功能拖垮。首次调用要下载模型（~178MB），
    会明显慢一次，之后走本地缓存就快了。edge=soft 保细节，edge=hard 出照相馆硬边。"""
    _require_openlux()
    image_bytes = await image.read()
    await _check_not_sensitive_document(image_bytes, image.content_type or "image/png", "AI 抠图")
    edge_mode = edge if edge in ("soft", "hard") else "soft"
    try:
        proc = await asyncio.to_thread(_run_bg_removal_subprocess, image_bytes, edge_mode)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="抠图处理超时，请重试")
    if proc.returncode != 0:
        raise HTTPException(status_code=502, detail=f"抠图处理失败：{proc.stderr.decode(errors='ignore')[:500]}")
    b64 = base64.b64encode(proc.stdout).decode()
    return {"data": [{"b64_json": b64}]}


_FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


@router.post("/detect-face")
async def detect_face(
    image: UploadFile = File(...),
    _user: models.User = Depends(auth.get_current_user),
):
    """证件照制作专用：本地跑 OpenCV Haar 级联检测人脸位置，纯本地算法不调用 openlux，
    零额外 AI 成本。返回人脸框相对图片宽高的 0~1 比例坐标，跟 reference-to-asset 的框选坐标
    是同一套单位约定，前端好复用。

    minSize 按图片自身尺寸的比例算，不能用固定像素——实测过：固定 100px 在 4032×3024 的真实
    照片上能准确避开衣服纹理这类误判，但换到 128×121 的小图上 100px 比整张图还大，直接测不出
    人脸。多张脸（真实照片背景纹理偶尔会被误判成好几个小"脸"）取面积最大的一个，实测这个策略
    在真实测试照片上（一张 128×121 小头像 + 一张 4032×3024 手机原图，原图上有 7 个误判但都
    明显小于真脸）都精确只留下真脸。检测不到人脸时返回 null，前端退回原来"整图占比"的粗略估算。"""
    image_bytes = await image.read()
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="无法解析上传的图片")
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    min_size = (max(30, int(w * 0.08)), max(30, int(h * 0.08)))
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=min_size)
    if len(faces) == 0:
        return {"face": None}
    fx, fy, fw, fh = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    return {"face": {"x": float(fx) / w, "y": float(fy) / h, "width": float(fw) / w, "height": float(fh) / h}}


_EYE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")


@router.post("/fix-red-eye")
async def fix_red_eye(
    image: UploadFile = File(...),
    _user: models.User = Depends(auth.get_current_user),
):
    """去红眼——纯本地 OpenCV，跟人脸检测同一套零成本算法，不调用 openlux。先用人脸检测框
    缩小眼部检测的搜索范围（直接在整张图上跑眼部级联，背景纹理误判率明显更高——这是复用
    人脸检测代码路径的直接原因，不是巧合）；在人脸区域里跑眼部检测，对每个检测到的眼睛，
    把"红色通道明显高于绿蓝通道且不算太暗"的像素（闪光灯反射视网膜的典型特征）单独替换成
    去掉红色分量后的灰阶，只动红色通道，不是整片涂黑——保留瞳孔原有的明暗结构。

    没检测到人脸时退回整张图找眼睛（不直接放弃），检测不到眼睛就原样返回，不报错——
    没有真实红眼样张走过真实场景测试，效果依赖真实红眼照片实测反馈。"""
    image_bytes = await image.read()
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="无法解析上传的图片")
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    face_min_size = (max(30, int(w * 0.08)), max(30, int(h * 0.08)))
    faces = _FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=face_min_size)
    if len(faces) > 0:
        fx, fy, fw, fh = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    else:
        fx, fy, fw, fh = 0, 0, w, h

    face_gray = gray[fy : fy + fh, fx : fx + fw]
    eye_min_size = (max(15, int(fw * 0.12)), max(15, int(fh * 0.12)))
    eyes = _EYE_CASCADE.detectMultiScale(face_gray, scaleFactor=1.1, minNeighbors=8, minSize=eye_min_size)

    fixed_count = 0
    for ex, ey, ew, eh in eyes:
        ax, ay = fx + int(ex), fy + int(ey)
        region = img[ay : ay + eh, ax : ax + ew].astype(np.int16)
        b, g, r = region[:, :, 0], region[:, :, 1], region[:, :, 2]
        red_mask = (r > g * 1.4) & (r > b * 1.4) & (r > 60)
        # 至少 2% 的区域被判定为偏红才当作真的红眼处理——实测过一只完全正常的眼睛也会有
        # 零星 1~2 个像素误判（反光高光点），只看"有没有"会把正常眼睛也算进"修复了几只"，
        # 卡个比例门槛能把这类噪声排除掉
        if red_mask.mean() < 0.02:
            continue
        avg_gb = ((g + b) / 2).astype(np.uint8)
        red_channel = img[ay : ay + eh, ax : ax + ew, 2]
        red_channel[red_mask] = avg_gb[red_mask]
        fixed_count += 1

    success, buf = cv2.imencode(".png", img)
    if not success:
        raise HTTPException(status_code=500, detail="图片编码失败")
    b64 = base64.b64encode(buf.tobytes()).decode()
    return {"data": [{"b64_json": b64}], "eyesFixed": fixed_count}


@router.post("/convert-cmyk")
async def convert_cmyk(
    image: UploadFile = File(...),
    _user: models.User = Depends(auth.get_current_user),
):
    """把浏览器画出来的 RGB 图转成 CMYK JPEG——只有真的要送商业印刷厂（胶印/丝网印这类需要
    CMYK 四色分色的场景）才用得上。Canvas API 只能画 RGB，这一步必须经后端：Pillow 的
    convert('CMYK') 是直接的数学换算，不带 ICC 色彩管理描述文件，转出来的颜色（尤其肤色）
    会比印刷厂用专业软件转的偏灰/偏暗——只是格式对了，不代表色彩准。普通冲印店/家用打印机
    认 RGB 就够，不需要这一步；生成的 CMYK JPEG 在浏览器里直接用 <img> 预览可能显示异常
    （多数浏览器的 JPEG 解码器按 RGB/YCbCr 假设，不认 CMYK JPEG），只适合直接下载后
    在 Photoshop 或专业排版软件里打开，不能拿来做站内预览。"""
    image_bytes = await image.read()
    try:
        img = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析上传的图片")
    cmyk_img = img.convert("CMYK")
    buf = io.BytesIO()
    cmyk_img.save(buf, format="JPEG", quality=95)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"image": f"data:image/jpeg;base64,{b64}"}


# "素材插画/文字生成"专用：只从参考图里框选出的一小块区域提炼风格类别（跟 reference-to-background
# 同一条纪律——只说类别/手法，不描述精确外形/不抄录原文文字），插画和文字两种分开写 instruction
# 是因为要防的具体表达完全不同：插画防的是"具体外形/姿势"，文字防的是"照抄原文这几个字"。
_ASSET_ILLUSTRATION_STYLE_INSTRUCTION = """You are extracting a STYLE-DESCRIPTION prompt for ONE isolated illustration/icon element cropped from a reference image, to be used as input for a text-to-image sticker generator. Describe ONLY the element's CATEGORY/TYPE and art style (e.g. "a paint palette with colorful paint blobs, flat cartoon illustration style, thick outline") as a mood-board brief would — not exact pose, not exact proportions, not exact color values. Output ONE short phrase in Chinese, no markdown, no quotation marks, no extra commentary."""

_ASSET_TEXT_STYLE_INSTRUCTION = """You are extracting the ARTISTIC RENDERING STYLE of a piece of text cropped from a reference image — its color scheme, outline/shadow/glow treatment, and letter-shape character (e.g. "彩虹渐变泡泡字，白色粗描边，卡通圆润造型") — for use as a style instruction for a text-to-image generator that will render COMPLETELY DIFFERENT words in this style. Do NOT mention, transcribe, or hint at the actual words/characters shown in the image. Output ONE short phrase in Chinese, no markdown, no quotation marks, no extra commentary."""


@router.post("/design/reference-to-asset")
async def design_reference_to_asset(
    image: UploadFile = File(...),
    region_x: float = Form(...),
    region_y: float = Form(...),
    region_width: float = Form(...),
    region_height: float = Form(...),
    asset_type: str = Form(...),
    text: str | None = Form(None),
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """参考图里框选一小块区域（插画元素或一段造型文字）→ 提炼风格类别 → 生成一张全新的独立
    素材 → 本地 rembg 抠成透明背景 → 自动存进素材库，返回可直接拖进画布的 PNG。
    跟 reference-to-background 是同一套边界纪律的另一个应用场景：插画防"抄具体外形"，
    文字防"抄原文文字"——用户自己填 text 参数，生成的是新内容，只是照抄了"手法"。"""
    if asset_type not in ("illustration", "text"):
        raise HTTPException(status_code=400, detail="asset_type 必须是 illustration 或 text")
    if asset_type == "text" and not (text and text.strip()):
        raise HTTPException(status_code=400, detail="文字类型需要提供 text 内容")
    _require_openlux()
    if asset_type == "text":
        await _moderate_text(text or "")

    image_bytes = await image.read()
    await _check_not_sensitive_document(image_bytes, image.content_type or "image/png", "素材/文字生成")
    try:
        img = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析上传的图片")
    w, h = img.size
    box = (
        max(0, min(w, round(region_x * w))),
        max(0, min(h, round(region_y * h))),
        max(0, min(w, round((region_x + region_width) * w))),
        max(0, min(h, round((region_y + region_height) * h))),
    )
    if box[2] <= box[0] or box[3] <= box[1]:
        raise HTTPException(status_code=400, detail="选区无效")
    crop_buf = io.BytesIO()
    img.crop(box).save(crop_buf, format="PNG")
    crop_b64 = base64.b64encode(crop_buf.getvalue()).decode()

    instruction = _ASSET_ILLUSTRATION_STYLE_INSTRUCTION if asset_type == "illustration" else _ASSET_TEXT_STYLE_INSTRUCTION
    vision_res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/chat/completions",
        timeout=60,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json={
            "model": "gemini-3-flash-preview",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": instruction},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{crop_b64}"}},
                    ],
                }
            ],
        },
    )
    if vision_res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"素材风格分析失败：{vision_res.status_code} {vision_res.text}")
    style_description = vision_res.json()["choices"][0]["message"]["content"].strip()

    if asset_type == "illustration":
        gen_prompt = f"{style_description}，纯白色背景，不要文字，不要水印，贴纸风格，孤立单个物体，居中构图"
    else:
        gen_prompt = f'文字内容"{text.strip()}"，渲染风格：{style_description}，纯白色背景，不要多余装饰，孤立文字图形，居中构图'

    gen_res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/images/generations",
        timeout=170,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json={"model": "gpt-image-2", "prompt": gen_prompt, "n": 1, "size": "1024x1024"},
    )
    if gen_res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"素材生成失败：{gen_res.status_code} {gen_res.text}")
    gen_bytes = await _extract_openai_image_bytes(gen_res.json(), "素材生成")

    try:
        # 贴纸/文字图形是白底孤立单体，要干净的硬边，走 hard 档
        proc = await asyncio.to_thread(_run_bg_removal_subprocess, gen_bytes, "hard")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="抠图处理超时，请重试")
    if proc.returncode != 0:
        raise HTTPException(status_code=502, detail=f"抠图处理失败：{proc.stderr.decode(errors='ignore')[:500]}")

    category = "sticker-illustration" if asset_type == "illustration" else "sticker-text"
    asset = _persist_asset_bytes(db, user.id, category, proc.stdout)

    return {"assetId": asset.id, "url": f"/api/ai/generated/{asset.file_name}", "styleDescription": style_description}


def _flatten_chat_text(messages: list) -> str:
    """把 ChatMessage.content（可能是纯字符串，也可能是多模态 content-parts 数组）拍平成
    一段纯文本给合规分类器看——分类器只关心"这段文字想让 AI 写什么"，不需要图片部分。"""
    parts: list[str] = []
    for m in messages:
        content = m.content
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    parts.append(str(item.get("text", "")))
    return "\n".join(parts)


@router.post("/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    _require_openlux()
    await _moderate_text(_flatten_chat_text(payload.messages))
    res = await _post_openlux(
        f"{OPENLUX_BASE_URL}/chat/completions",
        timeout=60,
        headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
        json=payload.model_dump(exclude_none=True),
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


_ICON_LIST_SHAPES = ("circle", "square", "diamond")
_ICON_LIST_MAX_ITEMS = 12

# design/generate 和 design/layout 两个接口共用的元素类型/组件 JSON 结构说明——两边的
# system prompt 其余部分差别很大（一个是"帮我编内容"，一个是"内容都写好了，只排版"），
# 但"可以用哪些元素类型、每种长什么样"这部分是同一套渲染管线，两边必须保持一致，
# 抽出来是为了避免以后改了一边、另一边忘了同步改。
_COMPONENT_JSON_SCHEMA_DOC = (
    "可以使用四种元素类型：\n"
    "- text：{type:'text', x, y, width, text, fontSize, fontWeight, color, align, fontFamily}\n"
    "- image：{type:'image', x, y, width, height, imagePrompt}（用 imagePrompt 描述这张图应该是什么内容，不要写 src）\n"
    "- rect：{type:'rect', x, y, width, height, fill, rx}\n"
    "- group：结构化组件，两种 componentKind 可选，内容类型和它们匹配时优先用这个而不是堆多个 text：\n"
    "  1. icon-list（编号/勾选/要点清单，3~9 条短句时用这个）：\n"
    "     {type:'group', x, y, children:[], componentKind:'icon-list', componentData:[\n"
    "       {shape:'circle'|'square'|'diamond', color:'#c8161d', icon:'1', label:'一句话要点（12字以内）'}, ...\n"
    "     ]}\n"
    "     componentData 是数组，每项一条列表内容；icon 通常是序号（'1'/'2'）或单字（'✓'/'✕'），最多2个字符；\n"
    "     渲染时每项固定占 34px 高、180px 宽的文字区，label 太长会被截断，务必控制在 12 个汉字以内。\n"
    "  2. ribbon-title（分区小标题，通栏色块+居中白字）：\n"
    "     {type:'group', x, y, children:[], componentKind:'ribbon-title', componentData:[{text:'小标题（8字以内）', color:'#c8161d', width:220}]}\n"
    "     componentData 必须是单元素数组（哪怕只有一项也要包成数组），不能是裸对象。\n"
    "  什么时候该用 group 而不是普通 text：一段内容如果是"
    "「3条以上并列的短要点」，用 icon-list；一段内容如果是「引出下面一块信息的小标题」，用 ribbon-title；"
    "长段落说明文字、单独一句话的大标题，仍然用普通 text，不要什么都往组件里塞。\n"
)


def _sanitize_icon_list_data(raw: object) -> list[dict] | None:
    """对应前端 IconListDatum[]（CanvasStage.vue 的 buildIconList）——数组形状是硬要求，
    applyFieldEdit 双击编辑回写只认数组，裸对象会导致编辑框弹得出来但提交静默不生效。"""
    if not isinstance(raw, list) or not raw:
        return None
    items = []
    for it in raw[:_ICON_LIST_MAX_ITEMS]:
        if not isinstance(it, dict):
            continue
        label = str(it.get("label") or "").strip()[:24]
        if not label:
            continue
        shape = it.get("shape") if it.get("shape") in _ICON_LIST_SHAPES else "circle"
        items.append(
            {
                "shape": shape,
                "color": str(it.get("color") or "#c8161d"),
                "icon": str(it.get("icon") or "").strip()[:2] or "•",
                "label": label,
            }
        )
    return items or None


def _sanitize_ribbon_title_data(raw: object) -> list[dict] | None:
    """对应前端 RibbonTitleDatum[]（buildRibbonTitle）——同样必须是单元素数组，不是裸对象。"""
    if not isinstance(raw, list) or not raw or not isinstance(raw[0], dict):
        return None
    text = str(raw[0].get("text") or "").strip()[:20]
    if not text:
        return None
    item: dict = {"text": text, "color": str(raw[0].get("color") or "#c8161d")}
    width = raw[0].get("width")
    if isinstance(width, (int, float)):
        item["width"] = int(_clamp_num(width, 80, 1000, 220))
    return [item]


_TEXT_MAX_LINES = 8  # 单个文字元素允许撑到的最大行数，超过就截断——防止极端情况下的连锁下推把画布挤爆


def _truncate_to_max_lines(text: str, width: float, font_size: float) -> str:
    """兜底：AI 给的文字量跟它给的框完全不匹配（比如一大段话塞进一个小框）时，
    与其让它在渲染时无限撑高、把下面所有元素连环顶飞，不如硬截断加省略号。
    正常情况下走的是 _reflow_avoid_overlap 顺势下推，不会碰到这个分支。"""
    if estimate_text_lines(text, width, font_size) <= _TEXT_MAX_LINES:
        return text
    max_chars = max(1, chars_per_line(width, font_size) * _TEXT_MAX_LINES - 1)
    return text[:max_chars].rstrip() + "…"


def _element_width(el: dict) -> float:
    if el["type"] in ("text", "rect", "image"):
        return el["width"]
    if el["type"] == "group":
        if el.get("componentKind") == "ribbon-title":
            data = el.get("componentData") or [{}]
            return data[0].get("width", COMPONENT_SIZE["ribbon"]["defaultW"])
        if el.get("componentKind") == "icon-list":
            return COMPONENT_SIZE["iconList"]["badge"] + 10 + COMPONENT_SIZE["iconList"]["labelW"]
    return 200


def _ranges_overlap(a0: float, a1: float, b0: float, b1: float) -> bool:
    return a0 < b1 and b0 < a1


def _reflow_avoid_overlap(elements: list[dict]) -> None:
    """原地调整：AI 给文字元素的坐标是"凭感觉"定的，没有真的算过换行后会撑多高。
    Fabric 的 Textbox 不会裁切溢出内容，只会把自己撑高，直接压到下一个元素身上。
    这里按估算高度，把跟它横向范围有重叠（真正会被压到的，不是并排的另一栏）的
    后续元素顺势下移，避免遮挡/重叠。按数组顺序单趟扫描，靠"后面元素用的是已经
    调整过的 y"自然实现连锁下推，不需要额外的多轮迭代。"""
    for i, el in enumerate(elements):
        if el["type"] != "text":
            continue
        est_bottom = el["y"] + estimate_text_height(el["text"], el["width"], el["fontSize"])
        x0, x1 = el["x"], el["x"] + el["width"]
        for other in elements[i + 1 :]:
            ox0, ox1 = other["x"], other["x"] + _element_width(other)
            if not _ranges_overlap(x0, x1, ox0, ox1):
                continue
            if other["y"] < est_bottom:
                other["y"] = int(est_bottom) + 4


def _sanitize_design_elements(
    raw_elements: object,
    canvas_width: int,
    canvas_height: int,
    allowed_fonts: list[str],
    max_elements: int = _DESIGN_MAX_ELEMENTS,
) -> list[dict]:
    if not isinstance(raw_elements, list):
        return []
    sanitized: list[dict] = []
    for el in raw_elements[:max_elements]:
        if not isinstance(el, dict) or el.get("type") not in ("text", "image", "rect", "group"):
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
            item["text"] = _truncate_to_max_lines(item["text"], item["width"], item["fontSize"])
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
        elif el["type"] == "group":
            kind = el.get("componentKind")
            if kind == "icon-list":
                data = _sanitize_icon_list_data(el.get("componentData"))
            elif kind == "ribbon-title":
                data = _sanitize_ribbon_title_data(el.get("componentData"))
            else:
                continue
            if data is None:
                continue
            sanitized.append({"type": "group", "x": x, "y": y, "children": [], "componentKind": kind, "componentData": data})
    _reflow_avoid_overlap(sanitized)
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
        + _COMPONENT_JSON_SCHEMA_DOC
        + f"可选字体（fontFamily 必须从下面列表里原样选一个，不要自己编）：\n{font_list_text}\n\n"
        "只返回一个严格的 JSON 对象，不要 markdown 代码块，不要任何多余说明文字，形如：\n"
        '{"background": "#ffffff", "elements": [ ... ]}\n'
        "要求：elements 数量 4~12 个（一个 group 算一个元素，不受它内部 componentData 条数影响）；"
        "所有坐标、宽高不能超出画布范围；文案要贴合用户描述的主题，"
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


def _build_layout_prompt(canvas_width: int, canvas_height: int, blocks: list[str] | None, raw_text: str | None) -> tuple[str, str]:
    system_prompt = (
        "你是专业的排版设计师。下面是用户已经写好的正文内容——这是最重要的规则：\n"
        "你绝对不能改写、删减、替换、精简、润色、翻译用户提供的原文任何一个字，你的任务只有排版，不是写作。\n\n"
        f"具体要做两件事，画布宽 {canvas_width}px、高 {canvas_height}px：\n"
        "1. 判断内容在语义上怎么拆成几个逻辑段落（如果输入已经按段落给出，直接按给定的分段来，不要重新合并/拆分）。"
        "每段归类成以下几种之一：「标题」（一句话，通常最短最醒目）、「要点列表」（3条以上并列的短句/短语）、"
        "「正文说明」（一段连续叙述）。\n"
        "2. 给每个逻辑段落分配版面位置和展示方式：\n"
        + _COMPONENT_JSON_SCHEMA_DOC
        + "这个模式暂不支持自动配图——不要生成 type:'image' 的元素，只用 text/rect/group 这三种。\n"
        + "\n再次强调最重要的规则：\n"
        "- 每个元素的 text/label 字段的内容，必须是从用户原文里逐字截取的连续一段，不能是你概括/重写/翻译/精简后的版本，一个字都不能改。\n"
        "- 唯一允许的操作是“在原文的自然断句处切开”（按标点、按换行、按逻辑段落切分成多段），切分内部不能改字、加字、减字。\n"
        "- 如果某一段原文太长装不进一个元素，可以原样拆成前后衔接的多个元素，但拼起来必须跟原文一字不差，不能省略中间内容、不能概括。\n"
        "- 不需要凭空加装饰性文案（比如联系方式、口号）——原文没有的内容，版面上也不应该出现。\n"
        "- 内容完整性优先于版面美观：宁可少加几个纯装饰用的色块/配图，也不能因为元素数量超限把用户原文的某一段挤丢。\n"
        "只返回一个严格的 JSON 对象，不要 markdown 代码块，不要任何多余说明文字，形如：\n"
        '{"background": "#ffffff", "elements": [ ... ]}\n'
    )
    if blocks:
        content_desc = "\n".join(f"[{i}] {b}" for i, b in enumerate(blocks))
        user_prompt = f"用户已经把内容分好段了，请分别给每段选合适的展示方式和位置，不要合并/拆分/改写这些段落原文：\n\n{content_desc}"
    else:
        user_prompt = f"用户原文（还没有分段，请你先按语义切分，再分别排版，原文一个字都不能改）：\n\n{raw_text}"
    return system_prompt, user_prompt


def _check_verbatim_fidelity(elements: list[dict], source_text: str) -> dict:
    """核对排版结果里每一段文字，是不是真的从用户原文逐字截取的，不是模型概括/改写过的版本。
    不能只在 prompt 里嘱咐一句就信——这条经验是从联网搜索那条链路的 quote 校验机制照搬过来的：
    模型自己说"我没有改写"不可信，字符串层面能校验的东西就不要指望模型自觉。
    允许兜底截断留下的结尾"…"不算破坏逐字性（那是 _sanitize_design_elements 自己加的安全网，不是模型编的）。"""
    normalized_source = content_research.normalize_for_match(source_text)
    checks: list[dict] = []

    def check_one(kind: str, text: str) -> None:
        candidate = text[:-1] if text.endswith("…") else text
        verbatim = bool(candidate) and content_research.normalize_for_match(candidate) in normalized_source
        checks.append({"type": kind, "text": text, "verbatim": verbatim})

    for el in elements:
        if el["type"] == "text":
            check_one("text", el["text"])
        elif el["type"] == "group":
            if el.get("componentKind") == "ribbon-title":
                for item in el.get("componentData") or []:
                    check_one("ribbon-title", str(item.get("text", "")))
            elif el.get("componentKind") == "icon-list":
                for item in el.get("componentData") or []:
                    check_one("icon-list", str(item.get("label", "")))

    verbatim_count = sum(1 for c in checks if c["verbatim"])
    return {
        "total": len(checks),
        "verbatim_count": verbatim_count,
        "all_verbatim": verbatim_count == len(checks) if checks else True,
        "checks": checks,
    }


@router.post("/design/layout")
async def design_layout(
    payload: DesignLayoutRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    """跟 /design/generate 是两条独立的链路，不共用 system prompt——那边是"帮我编内容"，
    这边是"内容都写好了，只排版、只选组件"。逐字校验见 _check_verbatim_fidelity。"""
    _require_openlux()

    blocks = [b.strip() for b in (payload.blocks or []) if b and b.strip()]
    raw_text = (payload.raw_text or "").strip()
    if not blocks and not raw_text:
        raise HTTPException(status_code=400, detail="raw_text 和 blocks 至少要提供一个")
    source_text = "".join(blocks) if blocks else raw_text

    system_prompt, user_prompt = _build_layout_prompt(
        payload.canvas_width, payload.canvas_height, blocks or None, raw_text or None
    )

    async with httpx.AsyncClient(timeout=90) as client:
        chat_res = await client.post(
            f"{OPENLUX_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json={
                "model": "gemini-3-flash-preview",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )
    if chat_res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"排版接口请求失败：{chat_res.status_code} {chat_res.text}")

    content = chat_res.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    match = re.search(r"\{[\s\S]*\}", content)
    try:
        parsed = json.loads(match.group(0) if match else content)
    except (json.JSONDecodeError, AttributeError):
        raise HTTPException(status_code=502, detail="排版结果解析失败，请重试")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="排版结果解析失败，请重试")

    allowed_fonts = [f.value for f in payload.fonts] or ["sans-serif"]
    background = str(parsed.get("background") or "#ffffff")
    elements = _sanitize_design_elements(
        parsed.get("elements"), payload.canvas_width, payload.canvas_height, allowed_fonts, max_elements=_LAYOUT_MAX_ELEMENTS
    )
    # 双保险：prompt 里已经说了这个模式不生成 image 元素，但指令不可靠（这次会话已经在别的地方
    # 踩过这个坑），万一模型还是给了，这里直接过滤掉——总比留一个没有 src 的残缺元素在版面里好。
    elements = [el for el in elements if el["type"] != "image"]
    fidelity = _check_verbatim_fidelity(elements, source_text)

    return {"background": background, "elements": elements, "fidelity": fidelity}


@router.post("/design/layout-preset")
async def design_layout_preset(
    payload: LayoutPresetRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    """参数化排版预设——不调用任何 AI，纯确定性代码（见 app/layout_presets.py），
    输入已经是分好类的结构化内容，系统只管按选定结构算坐标。跟 /design/layout 的区别：
    这里没有 AI 猜坐标那种"数值判断不准"的风险，也没有网络延迟。"""
    if payload.structure == "bullet-list":
        if not payload.items:
            raise HTTPException(status_code=400, detail="bullet-list 结构需要提供 items")
        result = layout_presets.build_bullet_list(payload.canvas_width, payload.canvas_height, payload.title, payload.intro, payload.items)
    elif payload.structure == "dense-board":
        if not payload.sections:
            raise HTTPException(status_code=400, detail="dense-board 结构需要提供 sections")
        sections = [{"heading": s.heading, "items": s.items} for s in payload.sections]
        result = layout_presets.build_dense_board(
            payload.canvas_width,
            payload.canvas_height,
            payload.title,
            sections,
            include_title=payload.include_title,
            top_offset=payload.top_offset,
        )
    else:
        raise HTTPException(status_code=400, detail=f"未知的 structure：{payload.structure}")
    return result


@router.post("/content/research")
async def content_research_endpoint(
    payload: ContentResearchRequest,
    _user: models.User = Depends(auth.get_current_user),
):
    """联网搜索一个主题 -> 抓取排名靠前页面的全文 -> 喂给 gemini-3-flash-preview 提炼成
    {claim, quote, source_url, site_name, confidence} 列表。confidence 不是模型自报的分数，
    是拿 quote 去抓到的原文里做字符串校验算出来的（verified/extracted_unverified/not_found，
    具体规则见 content_research.py 顶部注释）。"""
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="topic 不能为空")
    try:
        return await content_research.research_topic(topic)
    except content_research.ResearchUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
