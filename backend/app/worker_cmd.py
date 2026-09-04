"""子进程 worker（抠图 / 上色）该怎么起 —— 开发环境和 PyInstaller 打包后的 exe 不一样。

开发：`python -m app.bg_removal_worker <arg>`
打包：exe 里没有 python 也没有 `-m`，改成 exe 自己带一个 `--worker <name> <arg>` 的入口
      （见 run.py），再重新调用自己。
"""
import sys

FROZEN = getattr(sys, "frozen", False)


def worker_argv(name: str, *args: str) -> list[str]:
    if FROZEN:
        return [sys.executable, "--worker", name, *map(str, args)]
    return [sys.executable, "-m", f"app.{name}_worker", *map(str, args)]
