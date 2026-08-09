#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
番茄小说公开榜单采集器（基于开源 Crawl4AI + Playwright 渲染模式）。

设计目标（对应技能门禁）：
  1. 用真实浏览器渲染官方公开榜单页，保留页面实际渲染后的内容；
  2. 支持两种浏览器连接方式：
       a) Crawl4AI 内置 Chromium（Playwright 模式，headless 或 headed）；
       b) 连接已有 Chrome/CDP（--cdp http://127.0.0.1:9222），复用登录态与持久会话；
       也支持持久化上下文目录（--persistent-dir <path>）。
  3. 每页输出：原始 HTML、Markdown、截图、采集时间、URL、解析后的榜单 JSON；
  4. 解析字段至少：rank, title, author, genre, tags, word_count, status, blurb；
  5. 多榜单页合并去重；去重后独立作品不足 min-sample（默认10）判定扫榜失败；
  6. 写入：analysis/ranking-snapshot.json 与 evidence/snapshots/（原始证据文件）。
  7. 严禁用搜索摘要、猜测数据或虚构榜单替代采集结果；任何字段缺失保持为空，不猜测。

用法示例：
  python scan_fanqie_rank.py \
      --out <项目>/analysis/ranking-snapshot.json \
      --evidence-dir <项目>/evidence/snapshots \
      --pages "https://fanqienovel.com/rank/all" \
      --cdp http://127.0.0.1:9222

安装前置（见 setup.ps1 / setup.sh）：
  pip install -U crawl4ai
  crawl4ai-setup
  python -m playwright install chromium
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
except ImportError:  # pragma: no cover
    sys.exit("缺少 crawl4ai。请先运行: pip install -U crawl4ai && crawl4ai-setup && python -m playwright install chromium")


# ----------------------------------------------------------------------------
# 归一化字段
# ----------------------------------------------------------------------------

FANQIE_CHANNELS = {
    # 真实来源：https://fanqienovel.com/rank/all 页面 __INITIAL_STATE__.rank.rankCategoryTypeList（2026-08-10 抓取）
    "1141": "西方奇幻", "1140": "东方仙侠", "8": "科幻末世", "261": "都市日常",
    "124": "都市修真", "1014": "都市高武", "273": "历史古代", "27": "战神赘婿",
    "263": "都市种田", "258": "传统玄幻", "272": "历史脑洞", "539": "悬疑脑洞",
    "262": "都市脑洞", "257": "玄幻脑洞", "751": "悬疑灵异", "504": "抗战谍战",
    "746": "游戏体育", "718": "动漫衍生", "1016": "男频衍生",
    "1139": "古风世情", "248": "玄幻言情", "23": "种田", "79": "年代",
    "267": "现言脑洞", "246": "宫斗宅斗", "253": "古言脑洞", "24": "快穿",
    "749": "青春甜宠", "745": "星光璀璨", "747": "女频悬疑", "750": "职场婚恋",
    "748": "豪门总裁", "1017": "民国言情",
}


def _clean(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def _num(value) -> int | None:
    if value is None:
        return None
    text = _clean(value).replace(",", "").replace("万字", "0000").replace("万", "0000").replace("字", "")
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _genre_from_state(state: dict, item: dict) -> str:
    # category 可能是 ID，映射到官方频道名
    cat = item.get("category") or item.get("categoryV2") or item.get("genre") or ""
    return FANQIE_CHANNELS.get(str(cat).strip(), _clean(cat) or "")


def normalize_item(item: dict, rank: int, source_url: str, captured_at: str) -> dict | None:
    """把榜单条目归一为 rank-schema 字段；缺书名则丢弃。"""
    title = _clean(item.get("bookName") or item.get("title") or item.get("book_title"))
    if not title:
        return None
    words = item.get("wordNumber")
    if words is None:
        words = item.get("wordCount") or item.get("word_num")
    return {
        "rank": int(rank),
        "title": title,
        "author": _clean(item.get("author") or item.get("authorName")),
        "genre": _genre_from_state({}, item),
        "subgenre": _clean(item.get("subCategory") or item.get("sub_genre") or item.get("subcategory")),
        "words": _num(words),
        "status": _clean(item.get("creationStatus") or item.get("status") or item.get("serialStatus")),
        "blurb": _clean(item.get("abstract") or item.get("description") or item.get("blurb")),
        "tags": [t for t in (item.get("tags") or item.get("tagList") or []) if t],
        "source": f"fanqie / Crawl4AI rendered {source_url}",
        "captured_at": captured_at,
    }


# ----------------------------------------------------------------------------
# 从渲染后的页面抽取 book_list
# ----------------------------------------------------------------------------

def parse_initial_state(html: str) -> dict:
    """提取 window.__INITIAL_STATE__ 中的 rank.book_list（若渲染后仍内联）。"""
    m = re.search(r"window\.__INITIAL_STATE__\s*=\s*({.*?})\s*;\s*</script>", html, re.S)
    if not m:
        return {"book_list": []}
    try:
        state = json.loads(m.group(1))
    except json.JSONDecodeError:
        return {"book_list": []}
    rank_state = state.get("rank") or {}
    return {
        "book_list": rank_state.get("book_list") or [],
        "read_rank": rank_state.get("readRankList") or [],
        "new_rank": rank_state.get("newRankList") or [],
    }


def parse_dom_fallback(html: str) -> list[dict]:
    """
    DOM 兜底：从渲染后 HTML 中按常见结构提取书条目。
    选择器为启发式；若番茄改版则记录 warning，不猜测数据。
    """
    rows: list[dict] = []
    # 常见条目容器 class 关键词
    for tag_re in [
        r'<a[^>]+class="[^"]*book[^"]*"[^>]*>(.*?)</a>',
        r'<li[^>]*class="[^"]*rank[^"]*"[^>]*>(.*?)</li>',
        r'<div[^>]*class="[^"]*book-item[^"]*"[^>]*>(.*?)</div>',
    ]:
        for m in re.finditer(tag_re, html, re.S):
            block = m.group(1)
            title_m = re.search(r'title="([^"]+)"', block) or re.search(r'>(.{1,40})<', block)
            if title_m:
                rows.append({"title": title_m.group(1).strip(), "raw": block[:500]})
        if rows:
            break
    return rows


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------

async def crawl_page(crawler: AsyncWebCrawler, url: str, cfg: CrawlerRunConfig, evidence_dir: str):
    result = await crawler.arun(url=url, config=cfg)
    captured_at = datetime.now(timezone.utc).isoformat()
    html = result.html or ""
    markdown = result.markdown or ""
    shot_b64 = result.screenshot  # base64 png 或 None
    parsed: dict | None = None
    warnings: list[str] = []

    state = parse_initial_state(html)
    rows = state["book_list"]
    parser_source = "initial_state"
    if not rows:
        rows = state["read_rank"] + state["new_rank"]
        parser_source = "initial_state_read_new"
    if not rows:
        dom_rows = parse_dom_fallback(html)
        if dom_rows:
            rows = dom_rows
            parser_source = "dom_fallback"
            warnings.append("使用 DOM 兜底解析，字段可能不完整")

    if rows:
        parsed = [normalize_item(r, i + 1, url, captured_at) for i, r in enumerate(rows)]
        parsed = [p for p in parsed if p]

    # 落盘原始证据
    os.makedirs(evidence_dir, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", urlparse(url).netloc + urlparse(url).path)
    ts = time.strftime("%Y%m%d-%H%M%S")
    base = os.path.join(evidence_dir, f"fanqie_{ts}_{safe}")
    with open(f"{base}.html", "w", encoding="utf-8") as f:
        f.write(html)
    if markdown:
        with open(f"{base}.md", "w", encoding="utf-8") as f:
            f.write(markdown)
    if shot_b64:
        try:
            with open(f"{base}.png", "wb") as f:
                f.write(base64.b64decode(shot_b64))
        except Exception as exc:  # pragma: no cover
            warnings.append(f"screenshot 解码失败: {exc}")

    return {
        "url": url,
        "captured_at": captured_at,
        "http_status": getattr(result, "status_code", None),
        "raw_html": f"{base}.html",
        "markdown": f"{base}.md" if markdown else None,
        "screenshot": f"{base}.png" if shot_b64 else None,
        "parser_source": parser_source,
        "row_count": len(rows),
        "rows": parsed or [],
        "warnings": warnings,
    }


async def main() -> int:
    ap = argparse.ArgumentParser(description="番茄榜单 Crawl4AI 采集器")
    ap.add_argument("--out", required=True, help="analysis/ranking-snapshot.json 输出路径")
    ap.add_argument("--evidence-dir", required=True, help="evidence/snapshots 原始证据目录")
    ap.add_argument("--pages", nargs="*", default=[
        "https://fanqienovel.com/rank/all",
        "https://fanqienovel.com/rank/1_2_262",  # 男频阅读榜-都市脑洞
        "https://fanqienovel.com/rank/1_1_262",  # 男频新书榜-都市脑洞
    ], help="要渲染的榜单页 URL（可多个）")
    ap.add_argument("--cdp", default=None, help="连接已有 Chrome/CDP，如 http://127.0.0.1:9222")
    ap.add_argument("--persistent-dir", default=None, help="持久浏览器用户目录")
    ap.add_argument("--min-sample", type=int, default=10, help="去重后最小样本数，不足判定扫榜失败")
    ap.add_argument("--headful", action="store_true", help="有头模式（默认 headless）")
    ap.add_argument("--wait-ms", type=int, default=6000, help="渲染后额外等待毫秒")
    args = ap.parse_args()

    browser_cfg = BrowserConfig(
        browser_type="chromium",
        headless=not args.headful,
        cdp_url=args.cdp,                 # 连接已有 Chrome（受版本支持）
        use_persistent_context=bool(args.persistent_dir),
        user_data_dir=args.persistent_dir,
    )
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_until="networkidle",
        page_timeout=45000,
        screenshot=True,
        verbose=True,
    )

    page_results: list[dict] = []
    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        for url in args.pages:
            try:
                res = await crawl_page(crawler, url, run_cfg, args.evidence_dir)
                page_results.append(res)
                await asyncio.sleep(args.wait_ms / 1000.0)
            except Exception as exc:  # pragma: no cover
                page_results.append({
                    "url": url, "captured_at": datetime.now(timezone.utc).isoformat(),
                    "error": f"{type(exc).__name__}: {exc}", "rows": [],
                })

    # 合并去重
    seen = set()
    merged: list[dict] = []
    diagnostics: list[dict] = []
    seen_ranks: dict[str, set[int]] = {}
    for pr in page_results:
        for row in pr.get("rows", []):
            key = f"{row.get('title','')}\0{row.get('author','')}".lower()
            if key.strip() and key in seen:
                diagnostics.append({"severity": "warning", "code": "DUPLICATE_TITLE", "value": row.get("title")})
                continue
            if key.strip():
                seen.add(key)
            merged.append(row)
            src = pr.get("url", "")
            seen_ranks.setdefault(src, set()).add(row.get("rank"))

    captured_at = datetime.now(timezone.utc).isoformat()
    sample_size = len(merged)
    ok = sample_size >= args.min_sample
    if not ok:
        diagnostics.append({
            "severity": "error", "code": "LOW_SAMPLE_SIZE",
            "sample_size": sample_size, "minimum_sample": args.min_sample,
        })

    snapshot = {
        "schema_version": "1.1",
        "ok": ok,
        "platform": "fanqie",
        "platform_name": "番茄小说",
        "adapter": "crawl4ai",
        "source_urls": args.pages,
        "captured_at": captured_at,
        "sample_size": sample_size,
        "items": merged,
        "diagnostics": diagnostics,
        "acquisition": {
            "mode": "crawl4ai_playwright_render",
            "cdp": args.cdp,
            "persistent_dir": args.persistent_dir,
            "pages": [{"url": pr.get("url"), "captured_at": pr.get("captured_at"),
                       "status": pr.get("http_status"), "row_count": pr.get("row_count", 0),
                       "parser": pr.get("parser_source"), "warnings": pr.get("warnings", []),
                       "error": pr.get("error")} for pr in page_results],
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    # 同时把快照复制一份到 evidence/snapshots（不可变证据）
    import shutil
    ts = time.strftime("%Y%m%d-%H%M%S")
    shutil.copyfile(args.out, os.path.join(args.evidence_dir, f"ranking-snapshot-{ts}.json"))

    print(json.dumps(snapshot, ensure_ascii=False, indent=2))
    if not ok:
        print(f"\n[扫榜失败] 去重样本 {sample_size} < {args.min_sample}；禁止进入 benchmark-pool。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
