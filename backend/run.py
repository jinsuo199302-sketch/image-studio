"""入口。三种用法：

  python run.py                     开发：起服务（带 --reload）
  运行打包后的 exe                   起服务（不带 --reload）
  exe --worker bg_removal soft      打包后 exe 自己当子进程 worker 用（见 app/worker_cmd.py）
"""
import sys


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


def _run_server() -> None:
    import uvicorn

    frozen = getattr(sys, "frozen", False)
    if frozen:
        # 桌面版：起服务后自动打开浏览器到本地页面
        import threading
        import webbrowser

        threading.Timer(1.8, lambda: webbrowser.open("http://127.0.0.1:8001/")).start()
        print("万能画图 本地版已启动：http://127.0.0.1:8001/  （关掉这个黑窗口即退出）", flush=True)

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1" if frozen else "0.0.0.0",
        port=8001,
        reload=not frozen,
    )


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--worker":
        _run_worker()
    else:
        _run_server()
