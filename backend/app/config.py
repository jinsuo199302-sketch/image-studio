import os
import secrets
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
