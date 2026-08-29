import os
import secrets
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _load_or_create_jwt_secret() -> str:
    env_val = os.environ.get("JWT_SECRET")
    if env_val:
        return env_val
    secret_file = BASE_DIR / ".jwt_secret"
    if secret_file.exists():
        return secret_file.read_text().strip()
    secret = secrets.token_hex(32)
    secret_file.write_text(secret)
    return secret


def _origin(url: str) -> str:
    from urllib.parse import urlparse

    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


JWT_SECRET = _load_or_create_jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_SECONDS = 60 * 60 * 24 * 30  # 30 天

# 图片生成 / 图片编辑（AI消除去水印）/ 文字生成（写作+翻译）共用同一个 openlux 账号
OPENLUX_BASE_URL = os.environ.get("OPENLUX_BASE_URL", "https://api.openlux.ai/v1")
OPENLUX_API_KEY = os.environ.get("OPENLUX_API_KEY", "")

# 视频生成走 Vidu，路径结构跟 openlux 的 /v1 不是一个层级，默认取 OPENLUX_BASE_URL 的 origin，
# 如果视频用的是不同账号/域名，用 VIDU_BASE_URL / VIDU_API_KEY 单独覆盖
VIDU_BASE_URL = os.environ.get("VIDU_BASE_URL") or _origin(OPENLUX_BASE_URL)
VIDU_API_KEY = os.environ.get("VIDU_API_KEY") or OPENLUX_API_KEY

# 博查 Web Search API——联网搜索→提炼内容→写 source 字段这条链路用，
# 跟生图/文字生成是完全独立的账号体系，不共用 openlux 的 key
BOCHA_BASE_URL = os.environ.get("BOCHA_BASE_URL", "https://api.bochaai.com/v1")
BOCHA_API_KEY = os.environ.get("BOCHA_API_KEY", "")

# ── 开发/自测总开关 ────────────────────────────────────────────────
# DEV_UNRESTRICTED=1 时，关掉所有"防止用户拿软件做违法事"的内容检查：
#   1. 敏感文件图片识别（_check_not_sensitive_document）——身份证/发票/合同等
#   2. 文字意图审核（_moderate_text）——"帮我伪造证件"这类 prompt
# 用途：只给项目所有者在【本地】跑、调训练数据用。
# 生产服务器的 .env 里【绝对不要】设这个——那两层检查是保护终端用户、也是合规底线。
# 开启时：启动打一次横幅，之后每个被跳过的请求都往 stderr 记一行，方便事后发现忘了关。
DEV_UNRESTRICTED = os.environ.get("DEV_UNRESTRICTED", "").strip().lower() in ("1", "true", "yes", "on")

# 看数据看板的管理员邮箱（逗号分隔）。不设则第一个注册的用户是管理员。
ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]

if DEV_UNRESTRICTED:
    _banner = "!" * 64
    print(_banner, file=sys.stderr)
    print("[DEV_UNRESTRICTED] 内容安全检查已全部关闭 —— 仅限本地自测！", file=sys.stderr)
    print("[DEV_UNRESTRICTED] 生产环境看到这行 = .env 配错了，立即移除并重启", file=sys.stderr)
    print(_banner, file=sys.stderr, flush=True)
