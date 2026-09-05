from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from pydantic import BaseModel
from starlette.requests import Request

from datetime import datetime, timedelta

from app import analytics, billing, crud, models
from app.ai_proxy import GENERATED_ASSETS_DIR
from app.ai_proxy import router as ai_proxy_router
from app.auth import get_current_user, get_current_user_optional
from app.auth_routes import router as auth_router
from app.database import Base, SessionLocal, engine, get_db, migrate_schema
from app.pdf_tools import router as pdf_router
from app.schemas import (
    DeleteResponse,
    SnippetCreate,
    SnippetItem,
    TemplateCreate,
    TemplateItem,
    TemplateListResponse,
    TemplateUpdate,
)
from app.seed import seed_if_empty

Base.metadata.create_all(bind=engine)
migrate_schema()
with SessionLocal() as _db:
    seed_if_empty(_db)

app = FastAPI(title="万能画图 模板服务 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf_router)
app.include_router(auth_router)
app.include_router(ai_proxy_router)


@app.middleware("http")
async def _track_tool_usage(request: Request, call_next):
    """工具接口调用完自动记一行埋点（异步、失败不影响请求）。"""
    response = await call_next(request)
    try:
        if analytics.feature_for_path(request.url.path):
            with SessionLocal() as db:
                analytics.record_from_request(
                    db, request.url.path, request.headers.get("authorization"), response.status_code
                )
    except Exception:
        pass
    return response


class EventIn(BaseModel):
    feature: str
    kind: str = "view"


@app.post("/api/event")
def log_event(
    payload: EventIn,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    """前端埋点：纯前端工具（计算器/水印/压缩等）没有后端调用，靠这个上报"打开了 X"。"""
    feat = payload.feature.strip()[:60]
    if feat:
        analytics.record(db, feat, "view" if payload.kind != "action" else "action", user.id if user else None, True)
    return {"ok": True}


def _require_admin(user: models.User, db: Session) -> None:
    from app.config import ADMIN_EMAILS

    first_user = db.query(models.User).order_by(models.User.created_at).first()
    allowed = (user.email.lower() in ADMIN_EMAILS) if ADMIN_EMAILS else (first_user and first_user.id == user.id)
    if not allowed:
        raise HTTPException(status_code=403, detail="无权访问")


@app.get("/api/admin/stats")
def admin_stats(
    days: int = 7,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _require_admin(user, db)
    return analytics.stats(db, days=max(1, min(90, days)))


@app.get("/api/billing/info")
def billing_info(user: Optional[models.User] = Depends(get_current_user_optional)):
    from app import config

    return {
        "signup_free": config.SIGNUP_FREE_CREDITS,
        "packages": config.CREDIT_PACKAGES,
        "qr_url": config.PAYMENT_QR_URL,
        "contact": config.PAYMENT_CONTACT,
        "metered": config.METERED_FEATURES,          # {功能: 扣几次}
        "daily_free": config.DAILY_FREE_QUOTA,        # {功能: 每天白送几次}
        "ad_reward": config.AD_REWARD_AMOUNT,
        "membership_price": config.MEMBERSHIP_PRICE,
        "membership_monthly_credits": config.MEMBER_MONTHLY_CREDITS,
        "credits": user.credits if user else 0,
        "is_member": bool(user and user.is_member),
        "membership_until": user.membership_until.isoformat() if user and user.membership_until else None,
    }


@app.get("/api/billing/status")
def billing_status(feature: str, db: Session = Depends(get_db),
                   user: Optional[models.User] = Depends(get_current_user_optional)):
    """前端在生成按钮旁显示"本次消耗 N 次 / 今日还剩 X 次免费"。"""
    return billing.status(db, user, feature)


class AdRewardIn(BaseModel):
    feature: str


@app.post("/api/billing/ad-reward")
def ad_reward(payload: AdRewardIn, db: Session = Depends(get_db),
              user: models.User = Depends(get_current_user)):
    """小程序端：用户看完激励视频后调这个，给对应功能加免费额度。"""
    return billing.grant_ad_reward(db, user, payload.feature.strip())


class RechargeIn(BaseModel):
    kind: str = "credits"       # credits / membership
    amount_yuan: str = ""
    want: str = ""
    note: str = ""


@app.post("/api/billing/recharge-request")
def recharge_request(payload: RechargeIn, db: Session = Depends(get_db),
                     user: models.User = Depends(get_current_user)):
    """用户扫码付款后提交「我已付款」。进 pending 队列，等管理员在 /admin 确认。"""
    pending = (
        db.query(models.RechargeRequest)
        .filter(models.RechargeRequest.user_id == user.id, models.RechargeRequest.status == "pending")
        .count()
    )
    if pending >= 5:
        raise HTTPException(status_code=429, detail="你有多条待处理的充值，请等客服确认")
    r = models.RechargeRequest(
        user_id=user.id, email=user.email, kind=payload.kind,
        amount_yuan=payload.amount_yuan.strip()[:20], want=payload.want.strip()[:60], note=payload.note.strip()[:200],
    )
    db.add(r)
    db.commit()
    return {"ok": True, "id": r.id}


@app.get("/api/billing/logs")
def billing_logs(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    rows = crud.list_credit_logs(db, user.id)
    return {
        "credits": user.credits,
        "logs": [
            {"delta": r.delta, "balance_after": r.balance_after, "reason": r.reason,
             "feature": r.feature, "note": r.note, "at": r.created_at.isoformat()}
            for r in rows
        ],
    }


class GrantCreditsIn(BaseModel):
    email: str
    amount: int
    note: str = ""


@app.post("/api/admin/grant-credits")
def grant_credits(
    payload: GrantCreditsIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _require_admin(user, db)
    target = crud.get_user_by_email(db, payload.email.strip().lower())
    if not target:
        raise HTTPException(status_code=404, detail="没有这个邮箱的用户")
    if not -100000 < payload.amount < 100000 or payload.amount == 0:
        raise HTTPException(status_code=400, detail="数量不合理")
    new_balance = crud.adjust_credits(
        db, target, payload.amount, reason="grant", note=payload.note or f"管理员{'充值' if payload.amount > 0 else '扣减'}"
    )
    return {"email": target.email, "delta": payload.amount, "balance": new_balance}


class GrantMembershipIn(BaseModel):
    email: str
    months: int = 1


@app.post("/api/admin/grant-membership")
def grant_membership(
    payload: GrantMembershipIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """收到会员付款后，管理员在 /admin 开通。按月延长会员期，并补上每月赠送的次数。"""
    from app import config

    _require_admin(user, db)
    target = crud.get_user_by_email(db, payload.email.strip().lower())
    if not target:
        raise HTTPException(status_code=404, detail="没有这个邮箱的用户")
    months = max(1, min(24, payload.months))
    base = target.membership_until if (target.membership_until and target.membership_until > datetime.utcnow()) else datetime.utcnow()
    target.membership_until = base + timedelta(days=config.MEMBERSHIP_DAYS * months)
    db.commit()
    bonus = config.MEMBER_MONTHLY_CREDITS * months
    if bonus:
        crud.adjust_credits(db, target, bonus, reason="grant", note=f"会员赠送 {months} 个月")
    return {
        "email": target.email,
        "membership_until": target.membership_until.isoformat(),
        "credits": target.credits,
    }


@app.get("/api/admin/recharge-requests")
def admin_recharge_requests(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    _require_admin(user, db)
    rows = (
        db.query(models.RechargeRequest)
        .filter(models.RechargeRequest.status == "pending")
        .order_by(models.RechargeRequest.id.desc())
        .limit(50)
        .all()
    )
    return {"list": [
        {"id": r.id, "email": r.email, "kind": r.kind, "amount_yuan": r.amount_yuan,
         "want": r.want, "note": r.note, "at": r.created_at.isoformat()}
        for r in rows
    ]}


class ResolveRechargeIn(BaseModel):
    id: int
    action: str            # confirm_credits / confirm_membership / reject
    credits: int = 0
    months: int = 1
    note: str = ""


@app.post("/api/admin/resolve-recharge")
def admin_resolve_recharge(
    payload: ResolveRechargeIn, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    from app import config

    _require_admin(user, db)
    r = db.query(models.RechargeRequest).filter(models.RechargeRequest.id == payload.id).first()
    if not r or r.status != "pending":
        raise HTTPException(status_code=404, detail="记录不存在或已处理")
    target = crud.get_user(db, r.user_id)
    result: dict = {}
    if payload.action == "reject":
        r.status = "rejected"
    elif payload.action == "confirm_credits":
        if payload.credits <= 0:
            raise HTTPException(status_code=400, detail="次数要大于 0")
        bal = crud.adjust_credits(db, target, payload.credits, reason="grant", note=payload.note or "确认充值")
        r.status = "done"
        result = {"credits": bal}
    elif payload.action == "confirm_membership":
        months = max(1, min(24, payload.months))
        base = target.membership_until if (target.membership_until and target.membership_until > datetime.utcnow()) else datetime.utcnow()
        target.membership_until = base + timedelta(days=config.MEMBERSHIP_DAYS * months)
        bonus = config.MEMBER_MONTHLY_CREDITS * months
        if bonus:
            crud.adjust_credits(db, target, bonus, reason="grant", note=f"会员 {months} 个月")
        r.status = "done"
        result = {"membership_until": target.membership_until.isoformat(), "credits": target.credits}
    else:
        raise HTTPException(status_code=400, detail="未知操作")
    r.handled_at = datetime.utcnow()
    db.commit()
    return {"email": r.email, **result}
# 落在 /api/ 前缀下才会被 nginx 的 /api/ location 代理到这个后端进程，不用额外改 nginx 配置
app.mount("/api/ai/generated", StaticFiles(directory=GENERATED_ASSETS_DIR), name="generated-assets")


@app.get("/api/templates", response_model=TemplateListResponse)
def list_templates(
    category: Optional[str] = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    if mine and not user:
        raise HTTPException(status_code=401, detail="请先登录再查看我的设计")
    rows = crud.list_templates(db, category=category, user_id=user.id if user else None, mine=mine)
    return {"list": rows}


@app.get("/api/templates/{template_id}", response_model=TemplateItem)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    template = crud.get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    if not template.is_official and template.user_id != (user.id if user else None):
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@app.post("/api/templates", response_model=TemplateItem)
def create_template(
    payload: TemplateCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    return crud.create_template(db, payload, user_id=user.id)


@app.put("/api/templates/{template_id}", response_model=TemplateItem)
def update_template(
    template_id: str,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    existing = crud.get_template(db, template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="模板不存在")
    if existing.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能修改自己保存的设计")
    return crud.update_template(db, template_id, payload)


@app.delete("/api/templates/{template_id}", response_model=DeleteResponse)
def delete_template(
    template_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    existing = crud.get_template(db, template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="模板不存在")
    if existing.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能删除自己保存的设计")
    deleted = crud.delete_template(db, template_id)
    return {"deleted": deleted}


@app.post("/api/snippets", response_model=SnippetItem)
def create_snippet(payload: SnippetCreate, db: Session = Depends(get_db)):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="内容太长，最多 2000 字")
    return crud.create_snippet(db, content)


@app.get("/api/snippets/{snippet_id}", response_model=SnippetItem)
def get_snippet(snippet_id: str, db: Session = Depends(get_db)):
    snippet = crud.get_snippet(db, snippet_id)
    if not snippet:
        raise HTTPException(status_code=404, detail="内容不存在或已被删除")
    return snippet


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/diag")
def diag():
    """桌面版排障用：这台机器这个进程实际用的数据目录、.env/settings.env 是否读到、
    key 是否配置。不返回 key 明文,只返回是否非空 + 前后几位。出问题时把这个接口的
    返回内容发过来看。"""
    from app import config
    from app.paths import DATA_DIR, FRONTEND_DIR

    key = config.OPENLUX_API_KEY
    masked = f"{key[:6]}...{key[-4:]}" if len(key) > 12 else ("(empty)" if not key else "(too short)")
    return {
        "frozen": getattr(__import__("sys"), "frozen", False),
        "data_dir": str(DATA_DIR),
        "frontend_dir": str(FRONTEND_DIR),
        # 某些安全软件会拦截未签名 exe 读取叫 .env 的文件（is_file() 静默返回 False），
        # 两个名字都报一下，一眼看出是不是踩到了这个坑
        "dot_env_exists": (DATA_DIR / ".env").is_file(),
        "settings_env_exists": (DATA_DIR / "settings.env").is_file(),
        "settings_txt_exists": (DATA_DIR / "settings.txt").is_file(),
        # 排查用：一个内容完全无害的探针文件 vs 一个内容像密钥的探针文件，
        # 对比这两个能不能读到，用来判断到底是按文件名/后缀拦，还是按内容拦
        "probe_plain_exists": (DATA_DIR / "probe_plain.txt").is_file(),
        "probe_secret_exists": (DATA_DIR / "probe_secret.txt").is_file(),
        "listdir": sorted(p.name for p in DATA_DIR.iterdir()) if DATA_DIR.is_dir() else None,
        "openlux_key_set": bool(key),
        "openlux_key_masked": masked,
        "openlux_base_url": config.OPENLUX_BASE_URL,
        "dev_unrestricted": config.DEV_UNRESTRICTED,
    }


# ── 前端静态托管（桌面版：一个 exe 同时提供 API + 页面） ──────────────
# 只在打包 / 本地 build 过 dist 时生效；线上仍由 nginx 发前端，这段是死代码不影响。
from fastapi.responses import FileResponse  # noqa: E402
from app.paths import FRONTEND_DIR  # noqa: E402

if FRONTEND_DIR.is_dir() and (FRONTEND_DIR / "index.html").is_file():
    _INDEX = FRONTEND_DIR / "index.html"

    @app.get("/{full_path:path}")
    async def _spa(full_path: str):
        # /api/* 已在上面注册，不会走到这里；防御性再挡一次
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (FRONTEND_DIR / full_path).resolve()
        if FRONTEND_DIR.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_INDEX)  # vue-router history 模式的深链回退
