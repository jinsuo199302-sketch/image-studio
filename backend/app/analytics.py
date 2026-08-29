"""轻量埋点：记录工具被调用/打开，供数据看板统计哪些工具有人用。
不存任何用户输入内容，只记 feature 名 + 用户 id + 成功与否 + 日期。"""
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models
from app.auth import decode_token
from app.config import ADMIN_EMAILS

# 请求路径 -> 工具名。中文名好认，看板直接显示。
_PATH_FEATURE: dict[str, str] = {
    "/api/ai/colorize": "老照片上色",
    "/api/ai/background-removal": "抠图",
    "/api/ai/images/edits": "消除/改字",
    "/api/ai/images/generations": "AI生图",
    "/api/ai/detect-face": "人脸检测",
    "/api/ai/fix-red-eye": "去红眼",
    "/api/ai/table-to-xlsx": "表格转Excel",
    "/api/ai/remove-repeated-watermark": "批量去水印",
    "/api/ai/chat/completions": "AI文本(文案/翻译/提字)",
    "/api/ai/design/generate": "AI设计-创意简报",
    "/api/ai/design/layout": "AI设计-排版",
    "/api/ai/design/layout-preset": "AI设计-参数排版",
    "/api/ai/design/reference-to-background": "参考图生成",
    "/api/ai/design/reference-to-asset": "素材生成",
    "/api/pdf/merge": "PDF合并",
    "/api/pdf/split": "PDF拆分",
    "/api/pdf/watermark": "PDF水印",
    "/api/pdf/signature": "PDF签名",
    "/api/pdf/scan": "照片转扫描件",
    "/api/pdf/heic-to-jpg": "HEIC转JPG",
    "/api/pdf/images-to-pdf": "图片转PDF",
    "/api/pdf/to-images": "PDF转图片",
    "/api/pdf/encrypt": "PDF加密",
    "/api/pdf/decrypt": "PDF解密",
    "/api/pdf/pages": "PDF页面管理",
    "/api/pdf/format-doc": "排版成Word",
    "/api/pdf/text-to-pptx": "文字转PPT",
    "/api/pdf/images-to-pptx": "图片转PPT",
    "/api/pdf/payslips": "工资条拆分",
    "/api/pdf/merge-sheets": "多表合并去重",
    "/api/pdf/pinyin": "汉字转拼音",
}


def feature_for_path(path: str) -> str | None:
    return _PATH_FEATURE.get(path)


def _user_id_from_auth(auth_header: str | None) -> str | None:
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    return decode_token(auth_header[7:])


def record(db: Session, feature: str, kind: str, user_id: str | None, ok: bool) -> None:
    try:
        db.add(
            models.ToolEvent(
                feature=feature,
                kind=kind,
                user_id=user_id,
                ok=1 if ok else 0,
                day=datetime.utcnow().strftime("%Y-%m-%d"),
            )
        )
        db.commit()
    except Exception:
        db.rollback()  # 埋点失败绝不影响正常请求


def record_from_request(db: Session, path: str, auth_header: str | None, status_code: int) -> None:
    feature = feature_for_path(path)
    if not feature:
        return
    record(db, feature, "action", _user_id_from_auth(auth_header), status_code < 400)


def is_admin(user: models.User | None) -> bool:
    if user is None:
        return False
    if ADMIN_EMAILS:
        return user.email.lower() in ADMIN_EMAILS
    # 没配 ADMIN_EMAILS 时，第一个注册的用户是管理员
    return False  # 交给调用方结合 crud 判断


def stats(db: Session, days: int = 7) -> dict:
    since = datetime.utcnow() - timedelta(days=days)
    since_day = since.strftime("%Y-%m-%d")

    ev = models.ToolEvent
    rows = (
        db.query(ev.feature, ev.kind, func.count(ev.id), func.sum(ev.ok))
        .filter(ev.day >= since_day)
        .group_by(ev.feature, ev.kind)
        .all()
    )
    features: dict[str, dict] = {}
    for feature, kind, cnt, ok_sum in rows:
        f = features.setdefault(feature, {"feature": feature, "views": 0, "actions": 0, "action_ok": 0})
        if kind == "view":
            f["views"] += cnt
        else:
            f["actions"] += cnt
            f["action_ok"] += int(ok_sum or 0)
    feature_list = sorted(features.values(), key=lambda x: x["actions"] + x["views"], reverse=True)

    daily = (
        db.query(ev.day, func.count(func.distinct(ev.user_id)), func.count(ev.id))
        .filter(ev.day >= since_day, ev.kind == "action")
        .group_by(ev.day)
        .order_by(ev.day)
        .all()
    )
    daily_list = [{"day": d, "users": u, "events": c} for d, u, c in daily]

    total_users = db.query(func.count(models.User.id)).scalar() or 0
    new_users = db.query(func.count(models.User.id)).filter(models.User.created_at >= since).scalar() or 0

    return {
        "days": days,
        "features": feature_list,
        "daily": daily_list,
        "total_users": total_users,
        "new_users": new_users,
    }
