# 打包本地后端（自用桌面版）

把 FastAPI 后端打成一个不依赖 Python 环境的 exe，本地跑，工具全在自己电脑上处理。

## 打包（💻 本机 PowerShell）

```powershell
cd D:\code\image-studio\backend
venv\Scripts\python.exe -m pip install pyinstaller   # 只装一次
venv\Scripts\pyinstaller.exe --noconfirm --clean image-studio-backend.spec
```

产物：`backend\dist\image-studio-backend\`（约 535MB），双击 `image-studio-backend.exe` 起服务在 `http://127.0.0.1:8001`。

## 数据放哪

exe 旁边自动建 `image-studio-data\`：`data.db` / `.jwt_secret` / `.env` / `generated_assets\`。
要用 AI 功能（生图/OCR/翻译）就在 `image-studio-data\.env` 里填：

```
OPENLUX_BASE_URL=...
OPENLUX_API_KEY=...
DEV_UNRESTRICTED=1
```

## 模型

抠图（isnet ~178MB）、老照片上色（ddcolor ~235MB）首次用时下载到 `%USERPROFILE%\.u2net\` 和
`%USERPROFILE%\.cache\image-studio-colorize\`，不打进 exe。

## 子进程 worker

抠图/上色跑在独立子进程里（内存隔离）。打包后 exe 通过 `image-studio-backend.exe --worker <name> <arg>`
再调用自己（见 `app/worker_cmd.py` + `run.py` 的 `_run_worker`）。已验证两个 worker 在 exe 里都能跑。

## 已知点

- `data.db` 每次换新 exe 目录会重新建（迁移自动跑，不丢结构）
- 前端要单独部署或也打包；当前只打了后端
- 没做代码签名，Windows 会弹"未知发布者"
