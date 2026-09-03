"""调 openlux 的功能怎么计费：

  1. 免费用户每天白送几次（DAILY_FREE_QUOTA）—— 用这个不扣 credits
  2. 免费额度用完 → 扣 credits（METERED_FEATURES 里的次数）
  3. credits 也没了 → 抛 402，前端提示充值 / 开会员

会员跟免费用户走同一条路，区别只是会员每月有 100 次赠送次数垫底、且没有广告/有批量等其它权益。

接口里用法：

    from app import billing
    ticket = billing.consume(db, user, "AI生图")   # 不够会抛 HTTPException(402)
    try:
        ... 调 openlux 干活 ...
    except Exception:
        billing.refund_ticket(db, user, ticket)     # 失败退回
        raise
"""
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import crud, models
from app.config import AD_REWARD_AMOUNT, DAILY_FREE_QUOTA, MAX_AD_REWARDS_PER_DAY, METERED_FEATURES


def _today() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


@dataclass
class Ticket:
    """一次扣费的凭据，失败时按它退回。"""
    feature: str
    used_free: bool  # True=扣的是免费额度，False=扣的是 credits
    credits_spent: int


def _get_usage(db: Session, user_id: str, feature: str) -> models.DailyUsage:
    row = (
        db.query(models.DailyUsage)
        .filter(
            models.DailyUsage.user_id == user_id,
            models.DailyUsage.day == _today(),
            models.DailyUsage.feature == feature,
        )
        .first()
    )
    if row is None:
        row = models.DailyUsage(user_id=user_id, day=_today(), feature=feature, used=0, ad_bonus=0)
        db.add(row)
        db.flush()
    return row


def status(db: Session, user: models.User | None, feature: str) -> dict:
    """给前端看的：这个功能今天还剩多少免费、扣几次、要不要提示。"""
    cost = METERED_FEATURES.get(feature, 0)
    if cost <= 0:
        return {"metered": False}
    base_quota = DAILY_FREE_QUOTA.get(feature, 0)
    info: dict = {"metered": True, "cost": cost, "credits": user.credits if user else 0}
    if user:
        u = _get_usage(db, user.id, feature)
        info["free_left"] = max(0, base_quota + u.ad_bonus - u.used)
        info["ad_bonus_left"] = max(0, MAX_AD_REWARDS_PER_DAY - _ad_reward_count(db, user.id))
    else:
        info["free_left"] = 0
        info["ad_bonus_left"] = 0
    return info


def _ad_reward_count(db: Session, user_id: str) -> int:
    """今天已经领了几次看广告奖励（跨所有功能合计）。"""
    return (
        db.query(models.CreditLog)
        .filter(
            models.CreditLog.user_id == user_id,
            models.CreditLog.reason == "ad_reward",
            models.CreditLog.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0),
        )
        .count()
    )


def consume(db: Session, user: models.User | None, feature: str) -> Ticket:
    cost = METERED_FEATURES.get(feature, 0)
    if cost <= 0:
        return Ticket(feature, False, 0)
    if user is None:
        raise HTTPException(status_code=401, detail="该功能需要登录后使用")

    base_quota = DAILY_FREE_QUOTA.get(feature, 0)
    u = _get_usage(db, user.id, feature)
    if u.used < base_quota + u.ad_bonus:
        u.used += 1
        db.commit()
        return Ticket(feature, True, 0)

    if user.credits >= cost:
        crud.adjust_credits(db, user, -cost, reason="spend", feature=feature)
        return Ticket(feature, False, cost)

    raise HTTPException(
        status_code=402,
        detail=f"今日免费次数已用完，剩余次数不足（需 {cost} 次）。看广告 +{AD_REWARD_AMOUNT} 次，或充值 / 开会员",
    )


def refund_ticket(db: Session, user: models.User | None, ticket: Ticket) -> None:
    if user is None:
        return
    if ticket.used_free:
        u = _get_usage(db, user.id, ticket.feature)
        u.used = max(0, u.used - 1)
        db.commit()
    elif ticket.credits_spent > 0:
        crud.adjust_credits(db, user, ticket.credits_spent, reason="refund", feature=ticket.feature, note="处理失败退回")


def grant_ad_reward(db: Session, user: models.User, feature: str) -> dict:
    """用户看完激励视频，给对应功能加免费额度（有每日上限）。"""
    if feature not in METERED_FEATURES:
        raise HTTPException(status_code=400, detail="该功能不需要看广告")
    if _ad_reward_count(db, user.id) >= MAX_AD_REWARDS_PER_DAY:
        raise HTTPException(status_code=429, detail="今日看广告次数已达上限")
    u = _get_usage(db, user.id, feature)
    u.ad_bonus += AD_REWARD_AMOUNT
    db.add(models.CreditLog(
        user_id=user.id, delta=0, balance_after=user.credits, reason="ad_reward", feature=feature, note="看广告奖励"
    ))
    db.commit()
    base_quota = DAILY_FREE_QUOTA.get(feature, 0)
    return {"free_left": max(0, base_quota + u.ad_bonus - u.used)}
