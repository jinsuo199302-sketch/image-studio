# 打包本地后端（自用桌面版）

把 FastAPI 后端打成一个不依赖 Python 环境的 exe，本地跑，工具全在自己电脑上处理。

## 打包（💻 本机 PowerShell）

```powershell
cd D:\code\image-studio
npm run build                                        # 先生成前端 dist/（spec 会把它收进 exe）
cd backend
venv\Scripts\python.exe -m pip install pyinstaller   # 只装一次
venv\Scripts\pyinstaller.exe --noconfirm --clean image-studio-backend.spec
```

产物：`backend\dist\image-studio-backend\`（约 560MB）。双击 `image-studio-backend.exe`：
后端在后台起，弹一个**原生窗口**（pywebview + 系统自带的 WebView2）显示界面，关窗即退出。
API 和页面都由这一个 exe 提供，不用另开前端、不用浏览器。

- 想只起服务不弹窗（调试 / 想用浏览器开）：设环境变量 `IMAGE_STUDIO_NO_WINDOW=1`，
  这时行为回到「起服务 + 1.8 秒后拿默认浏览器打开」。
- WebView2 运行时：Win10/11 一般自带；缺了会自动退回默认浏览器（窗口那步 try/except）。
- 想去掉那个黑控制台窗口：`image-studio-backend.spec` 里 `EXE(..., console=True)` 改 `False` 重打
  （改完看不到报错，先留着 True 自测）。

> 没跑 `npm run build` 就打包会直接报错「找不到 ../dist」。前端改了要重新 build 再重新打包。

## 前端

前端静态文件（`dist/`）直接打进 exe（`app/paths.py` 的 `FRONTEND_DIR` → `_MEIPASS/frontend`），
`app/main.py` 末尾挂了个 SPA 兜底路由：非 `/api/*` 的请求，有对应文件就发文件，没有就发 `index.html`
（配合 vue-router 的 history 模式）。线上有 nginx 发前端，这段路由收不到非 API 请求，是死代码、不影响。

## 下载 / 导出

WebView2 会静默吞掉网页里 `<a download>` / `blob:` / `data:` 触发的下载。所以前端所有"下载/导出"
统一走 `src/utils/saveFile.ts`：
- 桌面版（`window.pywebview` 存在）→ 调 `window.pywebview.api.save_file(name, dataURL)`，
  `run.py` 的 `_DesktopApi.save_file` 弹原生"另存为"对话框 + 落盘。
- 网页版 → 还是老的 `<a download>`，不变。
新增工具的下载记得也用 `saveFile()`，别再自己 `createElement('a')`。

## 数据放哪

**`%LOCALAPPDATA%\image-studio-data\`**（即 `C:\Users\你\AppData\Local\image-studio-data\`）：
`data.db` / `.jwt_secret` / `.env` / `generated_assets\`。

> 为什么不放 exe 旁边：exe 旁边那个目录每次 `pyinstaller --clean` 重新打包都会被整个删掉，
> 账号和历史数据会丢。放 LOCALAPPDATA 后，换新版 exe 数据照样在。
> 首次启动时如果发现老位置（exe 旁 `image-studio-data\`）有数据，会自动迁一次过来。

要用 AI 功能（生图/OCR/翻译）就在 `%LOCALAPPDATA%\image-studio-data\.env` 里填：

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
