"""次数计费：给需要收费的工具接口用。

目前 `METERED_FEATURES` 是空的 —— 所有工具免费，`ensure_and_charge` 是 no-op。
等埋点数据出来、决定哪些工具收费后，在 config 里填 `METERED_FEATURES = {"老照片上色": 1, ...}`，
再在对应的接口里：

    from app import billing
    charged = billing.ensure_and_charge(db, user, "老照片上色")
    try:
        ... 干活 ...
    except Exception:
        billing.refund(db, user, "老照片上色", charged)
        raise
"""
from fastapi import HTTPException

from app import crud, models
from app.config import METERED_FEATURES


def cost_of(feature: str) -> int:
    return METERED_FEATURES.get(feature, 0)


def ensure_and_charge(db, user: models.User | None, feature: str) -> int:
    """检查余额并扣费。返回实际扣掉的次数（0 = 该功能免费）。余额不足抛 402。"""
    cost = cost_of(feature)
    if cost <= 0:
        return 0
    if user is None:
        raise HTTPException(status_code=401, detail="该功能需要登录后使用")
    if user.credits < cost:
        raise HTTPException(status_code=402, detail=f"次数不足（需要 {cost} 次，剩余 {user.credits} 次），请充值")
    crud.adjust_credits(db, user, -cost, reason="spend", feature=feature)
    return cost


def refund(db, user: models.User | None, feature: str, amount: int) -> None:
    if user is None or amount <= 0:
        return
    crud.adjust_credits(db, user, amount, reason="refund", feature=feature, note="处理失败退回")
