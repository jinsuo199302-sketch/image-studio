from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from app.database import Base


class Template(Base):
    __tablename__ = "templates"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    scene = Column(String, nullable=False, default="全部场景", index=True)
    industry = Column(String, nullable=False, default="通用场景", index=True)
    canvas_width = Column(Integer, nullable=False)
    canvas_height = Column(Integer, nullable=False)
    background = Column(String, nullable=False, default="#ffffff")
    thumbnail = Column(Text, nullable=False)
    elements = Column(JSON, nullable=False)
    is_official = Column(Integer, nullable=False, default=0)
    user_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TextSnippet(Base):
    __tablename__ = "text_snippets"

    id = Column(String, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    credits = Column(Integer, nullable=False, default=0)
    membership_until = Column(DateTime, nullable=True)  # None / 过期 = 非会员
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def is_member(self) -> bool:
        return self.membership_until is not None and self.membership_until > datetime.utcnow()


class DailyUsage(Base):
    """每个用户每天每个功能用了多少次免费额度。零点后自然失效（按 day 字段判断）。"""
    __tablename__ = "daily_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    day = Column(String, nullable=False, index=True)  # 'YYYY-MM-DD'
    feature = Column(String, nullable=False)
    used = Column(Integer, nullable=False, default=0)      # 已用免费额度
    ad_bonus = Column(Integer, nullable=False, default=0)  # 看广告加的额度


class CreditLog(Base):
    """次数流水：每次充值/扣费/赠送记一行，可审计。delta 正=加、负=扣。"""
    __tablename__ = "credit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    delta = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)  # signup / grant / spend / refund
    feature = Column(String, nullable=False, default="")
    note = Column(String, nullable=False, default="")
    created_at = Column(DateTime, default=datetime.utcnow)


class ToolEvent(Base):
    """轻量埋点：每次工具被调用/打开记一行。只为了知道哪些工具有人用、用得多不多，
    不存任何用户输入内容。`feature` 形如 'colorize' / 'tab:calc'，`kind` = action(真跑了) / view(打开了)。"""
    __tablename__ = "tool_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feature = Column(String, nullable=False, index=True)
    kind = Column(String, nullable=False, default="action")
    user_id = Column(String, nullable=True, index=True)
    ok = Column(Integer, nullable=False, default=1)
    day = Column(String, nullable=False, index=True)  # 'YYYY-MM-DD'，按天聚合用
    created_at = Column(DateTime, default=datetime.utcnow)


class GeneratedAsset(Base):
    """AI 生成的图片素材（目前只有"参考图生成"的背景图会自动存），私有——只有生成者自己能看到/删除。
    只存 file_name（磁盘上的相对文件名），不存完整 URL，域名/端口变了也不用改数据。"""
    __tablename__ = "generated_assets"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, default="reference-background", index=True)
    file_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
