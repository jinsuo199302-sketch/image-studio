"""数据目录 DATA_DIR：data.db / .env / .jwt_secret / generated_assets/ 都放这里。

- 开发：仓库的 backend/
- 打包成 exe：放 %LOCALAPPDATA%\\image-studio-data\\（不是 exe 旁边！）
  —— exe 旁边那个目录每次重新打包 / 覆盖安装都会被清掉，账号数据会丢。
  换到 LOCALAPPDATA 后，升级新版 exe 数据照样在。
  首次启动会把老位置（exe 旁 image-studio-data/）的数据迁过来一次。
"""
import os
import shutil
import sys
from pathlib import Path


def _frozen_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    target = Path(base) / "image-studio-data"
    # 一次性迁移：老版本把数据放在 exe 旁边
    legacy = Path(sys.executable).resolve().parent / "image-studio-data"
    if legacy.is_dir() and not target.exists():
        try:
            shutil.copytree(legacy, target)
        except Exception:
            target.mkdir(parents=True, exist_ok=True)
    return target


if getattr(sys, "frozen", False):
    DATA_DIR = _frozen_data_dir()
    # 前端静态文件打进 exe（spec 里 datas 把仓库根 dist/ 收到 frontend/）
    _meipass = getattr(sys, "_MEIPASS", None)
    FRONTEND_DIR = Path(_meipass) / "frontend" if _meipass else Path(sys.executable).resolve().parent / "frontend"
else:
    DATA_DIR = Path(__file__).resolve().parent.parent
    FRONTEND_DIR = DATA_DIR.parent / "dist"  # 仓库根的 vite 产物

DATA_DIR.mkdir(parents=True, exist_ok=True)
