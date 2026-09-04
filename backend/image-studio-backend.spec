# -*- mode: python ; coding: utf-8 -*-
# 打包本地后端：pyinstaller image-studio-backend.spec
# 产物在 dist/image-studio-backend/ ，双击 image-studio-backend.exe 即起服务在 127.0.0.1:8001
from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []
for pkg in ("cv2", "onnxruntime", "rembg", "fitz", "docx", "pptx", "pypinyin",
            "reportlab", "pillow_heif", "numba", "llvmlite", "pymatting"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

hiddenimports += collect_submodules("uvicorn")
hiddenimports += [
    "app.main", "app.bg_removal_worker", "app.colorize_worker",
    "anyio._backends._asyncio", "sqlalchemy.dialects.sqlite",
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
