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


class RechargeRequest(Base):
    """用户扫码付款后自己提交的"我已付款"记录。管理员在 /admin 核对到账后一键确认加次数。"""
    __tablename__ = "recharge_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    email = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="credits")  # credits / membership
    amount_yuan = Column(String, nullable=False, default="")   # 用户填的付款金额
    want = Column(String, nullable=False, default="")          # 想买什么（套餐/几个月会员）
    note = Column(String, nullable=False, default="")          # 付款方式/昵称/备注
    status = Column(String, nullable=False, default="pending", index=True)  # pending / done / rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    handled_at = Column(DateTime, nullable=True)


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


class AppSetting(Base):
    """桌面版专用的键值配置（目前只存 openlux_api_key/openlux_base_url）。
    背景：桌面版这台机器上实测过，image-studio-backend.exe 自己创建的文件（data.db/
    .jwt_secret）读写正常，但外部进程（哪怕是系统自带的 PowerShell）事后放进同一个
    文件夹的任何文件——不管叫什么名字、内容是什么——这个 exe 都看不到（is_file() 直接
    返回 False），具体是哪层安全软件/沙箱机制干的没查清楚。绕不开就不绕了：AI key 不
    再指望放一个外部文件让 exe 去读，改成走「进程自己读写自己的 data.db」这条已验证
    可靠的路径——管理员在 /admin 页面填 key，写进这张表；下次重启时 run.py 在导入
    app.config 之前先把这张表里的值塞进 os.environ，config.py 照常从环境变量读，
    对 ai_proxy.py 完全透明。"""

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class GeneratedAsset(Base):
    """AI 生成的图片素材（目前只有"参考图生成"的背景图会自动存），私有——只有生成者自己能看到/删除。
    只存 file_name（磁盘上的相对文件名），不存完整 URL，域名/端口变了也不用改数据。"""
    __tablename__ = "generated_assets"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, default="reference-background", index=True)
    file_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
