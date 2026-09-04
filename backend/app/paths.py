"""数据目录：开发时是仓库的 backend/，打包成 exe 后是 exe 所在目录旁的 image-studio-data/。
data.db / .env / .jwt_secret / generated_assets/ 都放这里，跟着 exe 走、不进临时目录。"""
import os
import sys
from pathlib import Path

if getattr(sys, "frozen", False):
    DATA_DIR = Path(sys.executable).resolve().parent / "image-studio-data"
else:
    DATA_DIR = Path(__file__).resolve().parent.parent

DATA_DIR.mkdir(parents=True, exist_ok=True)
