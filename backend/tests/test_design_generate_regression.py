"""/api/ai/design/generate 的组件感知回归检查——轻量脚本，不依赖 pytest。

用法：
    python tests/test_design_generate_regression.py
        只读本地存的 golden fixture（tests/fixtures/design_generate/*.json），
        报告每个用例当时的 componentKind 使用情况，不花钱、不发请求。

    python tests/test_design_generate_regression.py --live [--base-url https://picflowlab.cn]
        额外对每个 fixture 存的 prompt/画布尺寸/字体，重新注册一个临时账号、
        真实调用一次生产接口，把新结果跟 golden 对比，报告是否退化
        （群组件用量掉到 0、生成失败、耗时暴涨等）。这一步会真的花生产 AI 额度，
        改了 system prompt 或升级模型之后再手动加 --live 跑一次，不要接入 CI 自动跑。

已知问题（记在这里，不是这个脚本要解决的）：
    单次生成耗时目前在 44~137 秒区间（同步 HTTP 请求，模型本身耗时波动大）。
    如果以后要做成用户点击后实时等待的功能，这个延迟对体验影响很大，
    需要做成异步任务 + 进度提示，或者拆分多次小调用来降延迟。
"""
import argparse
import json
import sys
import time
from pathlib import Path

import httpx

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "design_generate"
DEFAULT_BASE_URL = "https://picflowlab.cn"


def load_fixtures() -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(FIXTURES_DIR.glob("*.json"))]


def component_stats(elements: list[dict]) -> dict:
    """统计一次生成结果里各元素类型/componentKind 的用量，用来判断"是不是退化成纯文字了"。"""
    type_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    for el in elements:
        type_counts[el["type"]] = type_counts.get(el["type"], 0) + 1
        if el["type"] == "group":
            kind = el.get("componentKind", "?")
            kind_counts[kind] = kind_counts.get(kind, 0) + 1
    return {"types": type_counts, "componentKinds": kind_counts, "total": len(elements)}


def report_offline(fixtures: list[dict]) -> None:
    print(f"=== 离线报告：{len(fixtures)} 个 golden fixture ===\n")
    for fx in fixtures:
        stats = component_stats(fx["response"]["elements"])
        print(f"[{fx['case_name']}]")
        print(f"  prompt: {fx['prompt'][:50]}{'...' if len(fx['prompt']) > 50 else ''}")
        print(f"  model={fx['model']}  requested_at={fx['requested_at']}  duration={fx['duration_seconds']:.1f}s")
        print(f"  element types: {stats['types']}")
        print(f"  componentKind usage: {stats['componentKinds'] or '(none — 完全退化成纯文字/图片/色块)'}")
        print()


def register_probe_account(client: httpx.Client, base_url: str) -> str:
    email = f"regression-probe-{int(time.time())}@example.com"
    res = client.post(f"{base_url}/api/auth/register", json={"email": email, "password": "Test123456"})
    res.raise_for_status()
    return res.json()["token"]


def run_live_case(fx: dict, base_url: str) -> dict:
    with httpx.Client(timeout=180) as client:
        token = register_probe_account(client, base_url)
        payload = {
            "prompt": fx["prompt"],
            "canvas_width": fx["canvas_width"],
            "canvas_height": fx["canvas_height"],
            "fonts": fx["fonts"],
        }
        t0 = time.time()
        res = client.post(
            f"{base_url}/api/ai/design/generate",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        elapsed = time.time() - t0
    return {"http_status": res.status_code, "elapsed": elapsed, "body": res.json() if res.status_code == 200 else res.text}


def report_live(fixtures: list[dict], base_url: str) -> bool:
    """返回 True 表示没发现明显退化，False 表示至少一个用例可疑，需要人工看一眼。"""
    print(f"=== 真实调用对比：{len(fixtures)} 个用例，打到 {base_url} ===\n")
    all_ok = True
    for fx in fixtures:
        golden_stats = component_stats(fx["response"]["elements"])
        print(f"[{fx['case_name']}] 调用中……（prompt: {fx['prompt'][:40]}...）")
        result = run_live_case(fx, base_url)
        if result["http_status"] != 200:
            print(f"  ✗ 请求失败 HTTP {result['http_status']}：{str(result['body'])[:200]}")
            all_ok = False
            print()
            continue
        new_stats = component_stats(result["body"]["elements"])
        golden_groups = sum(golden_stats["componentKinds"].values())
        new_groups = sum(new_stats["componentKinds"].values())
        print(f"  耗时: {result['elapsed']:.1f}s（golden 是 {fx['duration_seconds']:.1f}s）")
        print(f"  golden componentKind 用量: {golden_stats['componentKinds']}")
        print(f"  本次   componentKind 用量: {new_stats['componentKinds']}")
        if golden_groups > 0 and new_groups == 0:
            print("  ✗ 疑似退化：golden 用过组件，这次完全没用组件（可能是 prompt/模型改动破坏了组件感知）")
            all_ok = False
        elif new_groups == 0:
            print("  ⚠ 这次没用任何组件（golden 本来也没用，不算退化，但也没验证到组件感知）")
        else:
            print("  ✓ 组件感知仍然生效")
        if result["elapsed"] > fx["duration_seconds"] * 2:
            print(f"  ⚠ 耗时明显变长（{result['elapsed']:.1f}s vs {fx['duration_seconds']:.1f}s），留意是不是模型/网络变慢了")
        print()
    return all_ok


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--live", action="store_true", help="真的打一次生产接口对比（会花 AI 额度）")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"默认 {DEFAULT_BASE_URL}")
    args = parser.parse_args()

    fixtures = load_fixtures()
    if not fixtures:
        print(f"没找到 fixture，检查 {FIXTURES_DIR} 是否存在", file=sys.stderr)
        sys.exit(1)

    if args.live:
        ok = report_live(fixtures, args.base_url)
        sys.exit(0 if ok else 1)
    else:
        report_offline(fixtures)
