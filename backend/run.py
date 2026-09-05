"""入口。用法：

  python run.py                     开发：起服务（带 --reload），浏览器自己开
  运行打包后的 exe                   桌面版：起服务 + 弹一个原生窗口（pywebview）
  exe --worker bg_removal soft      打包后 exe 自己当子进程 worker 用（见 app/worker_cmd.py）

环境变量：
  IMAGE_STUDIO_NO_WINDOW=1          打包版也不弹窗，只起服务（配合浏览器/调试）
"""
import os
import sys

HOST = "127.0.0.1"
PORT = 8001  # 服务器/无窗口模式固定用这个（nginx / systemd 都指着它）
URL = f"http://{HOST}:{PORT}/"


def _pick_free_port() -> int:
    import socket

    s = socket.socket()
    try:
        s.bind((HOST, 0))
        return s.getsockname()[1]
    finally:
        s.close()


def _run_worker() -> None:
    # sys.argv == [exe, "--worker", <name>, *args]
    name = sys.argv[2]
    sys.argv = [sys.argv[0], *sys.argv[3:]]  # worker 的 main() 从 argv[1] 取参数
    if name == "bg_removal":
        from app.bg_removal_worker import main
    elif name == "colorize":
        from app.colorize_worker import main
    else:
        print(f"unknown worker: {name}", file=sys.stderr)
        sys.exit(2)
    main()


def _serve(reload: bool, port: int = PORT) -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0" if reload else HOST, port=port, reload=reload)


def _wait_until_up(base_url: str, timeout_s: float = 60.0) -> bool:
    import time
    import urllib.request

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{base_url}api/health", timeout=1)
            return True
        except Exception:
            time.sleep(0.4)
    return False


def _patch_webview_no_proxy() -> None:
    """WebView2 默认走系统代理。国内用户多半开着 Clash/VPN，127.0.0.1 没进代理的 bypass
    列表时，页面能开但 fetch('/api/...') 直接 "Failed to fetch"。窗口只跟本地后端通信，
    强制不走代理最省心——但 pywebview 6.2 把 AdditionalBrowserArguments 写死在
    EdgeChrome.__init__ 里，且 CreationProperties 只能在 EnsureCoreWebView2Async 之前改，
    等 __init__ 跑完再改就晚了（会报 "cannot be modified after initialization"）。
    只能整个重写这个 __init__（原样照抄 pywebview 源码，只在 AdditionalBrowserArguments
    那行加了 --no-proxy-server），锁定 pywebview==6.2.1，升级这个包要重新核对这段代码。
    任何一步出错就完整回退到原始 __init__，不会导致窗口起不来，只是代理没绕开。"""
    try:
        import webview.platforms.edgechromium as ec
    except Exception:
        return

    orig_init = ec.EdgeChrome.__init__

    def patched_init(self, form, window, cache_dir):  # type: ignore[no-untyped-def]
        try:
            self.pywebview_window = window
            self.webview = ec.WebView2()
            props = ec.CoreWebView2CreationProperties()

            runtime_path = ec.webview_settings["WEBVIEW2_RUNTIME_PATH"]
            if runtime_path:
                if not ec.os.path.isabs(runtime_path):
                    runtime_path = ec.os.path.join(ec.get_app_root(), runtime_path)
                if ec.os.path.exists(runtime_path):
                    props.BrowserExecutableFolder = runtime_path

            props.UserDataFolder = cache_dir
            self.user_data_folder = props.UserDataFolder
            props.set_IsInPrivateModeEnabled(ec._state["private_mode"])
            props.AdditionalBrowserArguments = "--disable-features=ElasticOverscroll --no-proxy-server"

            if ec.webview_settings["ALLOW_FILE_URLS"]:
                props.AdditionalBrowserArguments += " --allow-file-access-from-files"
            if ec.webview_settings["REMOTE_DEBUGGING_PORT"] is not None:
                props.AdditionalBrowserArguments += (
                    f' --remote-debugging-port={ec.webview_settings["REMOTE_DEBUGGING_PORT"]}'
                )

            self.webview.CreationProperties = props
            self.form = form
            form.Controls.Add(self.webview)

            self.js_results = {}
            self.js_result_semaphore = ec.Semaphore(0)
            self.webview.Dock = ec.WinForms.DockStyle.Fill
            self.webview.BringToFront()
            self.webview.CoreWebView2InitializationCompleted += self.on_webview_ready
            self.webview.NavigationStarting += self.on_navigation_start
            self.webview.NavigationCompleted += self.on_navigation_completed
            self.webview.WebMessageReceived += self.on_script_notify
            self.syncContextTaskScheduler = ec.TaskScheduler.FromCurrentSynchronizationContext()
            self.webview.DefaultBackgroundColor = ec.Color.FromArgb(
                255,
                int(window.background_color.lstrip("#")[0:2], 16),
                int(window.background_color.lstrip("#")[2:4], 16),
                int(window.background_color.lstrip("#")[4:6], 16),
            )
            if window.transparent:
                self.webview.DefaultBackgroundColor = ec.Color.Transparent

            self.url = None
            self.ishtml = False
            self.html = ec.DEFAULT_HTML
            self.webview.EnsureCoreWebView2Async(None)
        except Exception as e:  # noqa: BLE001 — 照抄的逻辑哪步炸了都别卡窗口，退回原版
            print(f"[proxy-patch] 重写失败，退回默认（可能仍走代理）：{e}", file=sys.stderr, flush=True)
            orig_init(self, form, window, cache_dir)

    ec.EdgeChrome.__init__ = patched_init


class _DesktopApi:
    """暴露给前端 window.pywebview.api 的方法。前端所有"下载/导出"都走 save_file——
    WebView2 会静默吞掉 <a download> / blob: / data: 触发的下载，只能用原生另存为对话框。"""

    def save_file(self, filename: str, data_url: str) -> dict:
        import base64

        try:
            import webview

            payload = data_url.split(",", 1)[1] if data_url.startswith("data:") and "," in data_url else data_url
            raw = base64.b64decode(payload)
            win = webview.windows[0]
            result = win.create_file_dialog(webview.SAVE_DIALOG, save_filename=filename)
            if not result:
                return {"ok": False, "canceled": True}
            path = result if isinstance(result, str) else result[0]
            with open(path, "wb") as f:
                f.write(raw)
            return {"ok": True, "path": path}
        except Exception as e:  # noqa: BLE001
            print(f"[save_file] {e}", file=sys.stderr, flush=True)
            return {"ok": False, "error": str(e)}


def _run_desktop() -> None:
    """起服务（后台线程）+ 原生窗口。窗口关掉即退出整个程序。"""
    import threading

    # 随机空闲端口：避免上一次没退干净的实例占着 8001 导致新实例起不来
    port = _pick_free_port()
    base_url = f"http://{HOST}:{port}/"

    threading.Thread(target=_serve, args=(False, port), daemon=True).start()
    if not _wait_until_up(base_url):
        print("后端启动超时，请把这个窗口截图发给客服", file=sys.stderr, flush=True)

    try:
        import webview

        _patch_webview_no_proxy()
        webview.create_window(
            "万能画图", base_url, width=1440, height=900, min_size=(1024, 680), js_api=_DesktopApi()
        )
        webview.start()
    except Exception as e:  # 没装 WebView2 运行时等 → 退回系统浏览器
        print(f"[window] 原生窗口不可用（{e}），改用默认浏览器打开", file=sys.stderr, flush=True)
        import webbrowser

        webbrowser.open(base_url)
        threading.Event().wait()  # 服务在后台线程，这里挂住别退出
    os._exit(0)


def _run_server_headless() -> None:
    frozen = getattr(sys, "frozen", False)
    if frozen:
        import threading
        import webbrowser

        threading.Timer(1.8, lambda: webbrowser.open(URL)).start()
        print(f"万能画图 本地版已启动：{URL}  （关掉这个黑窗口即退出）", flush=True)
    _serve(reload=not frozen)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--worker":
        _run_worker()
    elif getattr(sys, "frozen", False) and os.environ.get("IMAGE_STUDIO_NO_WINDOW", "").strip() not in ("1", "true", "yes"):
        _run_desktop()
    else:
        _run_server_headless()
