# -*- mode: python ; coding: utf-8 -*-
# 打包本地后端：pyinstaller image-studio-backend.spec
# 产物在 dist/image-studio-backend/ ，双击 image-studio-backend.exe 即起服务在 127.0.0.1:8001
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []

# 前端 vite 产物：打包前先在仓库根跑 `npm run build`，这里把整个 dist/ 收进 frontend/
_dist = os.path.join("..", "dist")  # 从 backend/ 往上一级到仓库根
if os.path.isdir(_dist):
    datas += [(_dist, "frontend")]
else:
    raise SystemExit("找不到 ../dist ——先在仓库根执行 npm run build 再打包")
for pkg in ("cv2", "onnxruntime", "rembg", "fitz", "docx", "pptx", "pypinyin",
            "reportlab", "pillow_heif", "numba", "llvmlite", "pymatting",
            "webview", "clr_loader", "pythonnet"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += collect_submodules("uvicorn")
hiddenimports += [
    "app.main", "app.bg_removal_worker", "app.colorize_worker",
    "anyio._backends._asyncio", "sqlalchemy.dialects.sqlite",
    "clr", "webview.platforms.winforms", "webview.platforms.edgechromium",
]

a = Analysis(
    ["run.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    excludes=["tkinter", "matplotlib", "IPython", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True,
          name="image-studio-backend", console=True)
coll = COLLECT(exe, a.binaries, a.datas, name="image-studio-backend")
