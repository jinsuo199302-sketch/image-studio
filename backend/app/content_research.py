"""联网搜索 -> 抓取原文 -> AI 提炼 -> 引用校验，这条链路的核心逻辑。
拆成独立模块（而不是塞进 ai_proxy.py），是因为这条链路本身步骤多、每一步都值得单独测试，
路由层（ai_proxy.py 的 /api/ai/content/research）只负责编排调用顺序 + 认证。

设计上的关键约束（都是跟用户确认过的）：
- 提炼模型只能读"抓取到的原文"作答，不能用自己的知识补充——所以每次调用都要把原文喂进 prompt，
  而不是只给一个话题名字让模型自由发挥。
- 置信度不做成模型自报的数字分数（不可信），而是靠字符串层面校验"模型声称的原文引用"
  是不是真的能在抓取到的原文里找到，校验通过才是 verified，校验不过是 extracted_unverified。
- 一次请求如果压根没搜到/抓到任何相关内容，返回 status="not_found"，而不是编一条内容出来凑数。
"""
import json
import re
import unicodedata

import httpx
from bs4 import BeautifulSoup

from app.config import BOCHA_API_KEY, BOCHA_BASE_URL, OPENLUX_API_KEY, OPENLUX_BASE_URL

SEARCH_RESULT_COUNT = 5
MAX_SOURCE_CHARS = 4000
MAX_CLAIMS = 8

_FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
}


class ResearchUnavailable(Exception):
    """BOCHA_API_KEY / OPENLUX_API_KEY 没配置时抛出，路由层转成 503。"""


def _require_config():
    if not BOCHA_API_KEY:
        raise ResearchUnavailable("BOCHA_API_KEY 未配置")
    if not OPENLUX_API_KEY:
        raise ResearchUnavailable("OPENLUX_API_KEY 未配置")


async def bocha_search(query: str, count: int = SEARCH_RESULT_COUNT) -> list[dict]:
    """返回 [{name, url, siteName, snippet}, ...]，只是候选链接列表，不是最终答案。"""
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"{BOCHA_BASE_URL}/web-search",
            headers={"Authorization": f"Bearer {BOCHA_API_KEY}", "Content-Type": "application/json"},
            json={"query": query, "count": count, "summary": True, "freshness": "noLimit"},
        )
    if res.status_code >= 400:
        raise RuntimeError(f"博查搜索请求失败：{res.status_code} {res.text[:300]}")
    data = res.json()
    values = ((data.get("webPages") or {}).get("value")) or []
    return [
        {
            "name": v.get("name", ""),
            "url": v.get("url", ""),
            "siteName": v.get("siteName") or v.get("name", ""),
            "snippet": v.get("summary") or v.get("snippet") or "",
        }
        for v in values
        if v.get("url")
    ]


async def fetch_page_text(url: str, max_chars: int = MAX_SOURCE_CHARS) -> str | None:
    """抓取一个网页的可见正文文本（不是搜索摘要）。抓取/解析失败返回 None，调用方要能容忍单条失败。"""
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers=_FETCH_HEADERS) as client:
            res = await client.get(url)
        if res.status_code >= 400 or "text/html" not in res.headers.get("content-type", ""):
            return None
        soup = BeautifulSoup(res.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r"\n{2,}", "\n", text)
        return text[:max_chars] if text else None
    except (httpx.HTTPError, Exception):
        return None


def _normalize(text: str) -> str:
    """校验引用时统一口径：全角转半角、折叠空白，不然一个全角逗号就会让明明对得上的引用判定失败。"""
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", "", text)


def verify_quote(quote: str, source_text: str) -> bool:
    if not quote or not source_text:
        return False
    return _normalize(quote) in _normalize(source_text)


def _build_extraction_prompt(topic: str, sources: list[dict]) -> tuple[str, str]:
    source_blocks = []
    for i, s in enumerate(sources):
        source_blocks.append(f"[{i}] 来源：{s['siteName']}（{s['url']}）\n{s['text']}")
    sources_text = "\n\n".join(source_blocks)

    system_prompt = (
        "你是一名严谨的事实核查助手。任务是从下面提供的“检索到的原文”里，"
        "找出跟用户给的主题明确相关的关键信息点。\n"
        "严格规则：\n"
        "1. 只能使用“检索到的原文”里明确写出的内容作答，不能用你自己的知识或记忆补充，不能推测，不能编造。\n"
        "2. 原文里没有跟主题明确相关的内容就跳过，不要为了凑数硬编。找不到任何相关内容时返回空数组 []。\n"
        "3. 每一条的 quote 字段必须是从某一段原文里逻辑上逐字摘录的原话（标点、空格可以有细微出入，"
        "但不能是你自己改写/概括后的句子，不能跨段拼接）。\n"
        "4. 只返回一个 JSON 数组，不要 markdown 代码块，不要任何多余说明文字。每一项格式：\n"
        '   {"claim": "这条信息点的简短说明，给人看标题用，可以是你自己的话", '
        '"quote": "从原文逐字摘录的那句话", "source_index": 数字（对应下面第几段原文，从0开始）}\n'
        f"5. 最多返回 {MAX_CLAIMS} 条，宁缺毋滥。"
    )
    user_prompt = f"检索到的原文：\n\n{sources_text}\n\n用户主题：{topic}"
    return system_prompt, user_prompt


async def call_extraction_model(topic: str, sources: list[dict]) -> list[dict]:
    system_prompt, user_prompt = _build_extraction_prompt(topic, sources)
    async with httpx.AsyncClient(timeout=90) as client:
        res = await client.post(
            f"{OPENLUX_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENLUX_API_KEY}"},
            json={
                "model": "gemini-3-flash-preview",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )
    if res.status_code >= 400:
        raise RuntimeError(f"提炼模型请求失败：{res.status_code} {res.text[:300]}")
    content = res.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    match = re.search(r"\[[\s\S]*\]", content)
    try:
        parsed = json.loads(match.group(0) if match else content)
    except (json.JSONDecodeError, AttributeError):
        return []
    return parsed if isinstance(parsed, list) else []


async def research_topic(topic: str) -> dict:
    """整条链路的编排入口：搜索 -> 抓原文 -> 提炼 -> 校验 -> 返回结构化结果。"""
    _require_config()

    search_results = await bocha_search(topic)
    if not search_results:
        return {"topic": topic, "status": "not_found", "sources_searched": [], "results": []}

    sources: list[dict] = []
    for r in search_results:
        text = await fetch_page_text(r["url"])
        if text:
            sources.append({"url": r["url"], "siteName": r["siteName"], "text": text})

    if not sources:
        return {
            "topic": topic,
            "status": "not_found",
            "sources_searched": [{"url": r["url"], "siteName": r["siteName"]} for r in search_results],
            "results": [],
        }

    raw_claims = await call_extraction_model(topic, sources)

    results = []
    for c in raw_claims[:MAX_CLAIMS]:
        if not isinstance(c, dict):
            continue
        claim = str(c.get("claim") or "").strip()
        quote = str(c.get("quote") or "").strip()
        idx = c.get("source_index")
        if not claim or not quote or not isinstance(idx, int) or not (0 <= idx < len(sources)):
            continue
        src = sources[idx]
        confidence = "verified" if verify_quote(quote, src["text"]) else "extracted_unverified"
        results.append(
            {
                "claim": claim,
                "quote": quote,
                "source_url": src["url"],
                "site_name": src["siteName"],
                "confidence": confidence,
            }
        )

    return {
        "topic": topic,
        "status": "ok" if results else "not_found",
        "sources_searched": [{"url": s["url"], "siteName": s["siteName"]} for s in sources],
        "results": results,
    }
