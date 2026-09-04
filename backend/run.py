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
PORT = 8001
URL = f"http://{HOST}:{PORT}/"


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


def _serve(reload: bool) -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0" if reload else HOST, port=PORT, reload=reload)


def _wait_until_up(timeout_s: float = 60.0) -> bool:
    import time
    import urllib.request

    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{URL}api/health", timeout=1)
            return True
        except Exception:
            time.sleep(0.4)
    return False


def _run_desktop() -> None:
    """起服务（后台线程）+ 原生窗口。窗口关掉即退出整个程序。"""
    import threading

    threading.Thread(target=_serve, args=(False,), daemon=True).start()
    if not _wait_until_up():
        print("后端启动超时，请把这个窗口截图发给客服", file=sys.stderr, flush=True)

    try:
        import webview

        webview.create_window("万能画图", URL, width=1440, height=900, min_size=(1024, 680))
        webview.start()
    except Exception as e:  # 没装 WebView2 运行时等 → 退回系统浏览器
        print(f"[window] 原生窗口不可用（{e}），改用默认浏览器打开", file=sys.stderr, flush=True)
        import webbrowser

        webbrowser.open(URL)
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
