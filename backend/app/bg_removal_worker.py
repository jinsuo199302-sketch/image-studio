"""独立子进程跑 rembg 抠图，跟主 FastAPI 进程隔离——u2net 模型稳定态占用约 1GB RSS，
如果常驻在长期运行的 web worker 进程里，2 核 2GB 的小机器扛不住。每次调用都是新进程，
处理完立刻退出，内存马上还给系统。stdin 读原图字节，stdout 写抠图后的透明 PNG 字节。"""
import sys


def main() -> None:
    from rembg import new_session, remove

    image_bytes = sys.stdin.buffer.read()
    session = new_session("u2net")
    output_bytes = remove(image_bytes, session=session)
    sys.stdout.buffer.write(output_bytes)


if __name__ == "__main__":
    main()
