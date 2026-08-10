#!/usr/bin/env python3
"""Fanqie rank collector with evidence, Crawl4AI rendering, SSR fallback, and font decoding."""
import argparse, asyncio, json, os, re, shutil, sys, time
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, urlopen

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    CRAWL4AI = True
except ImportError:
    CRAWL4AI = False

SOURCE_HAN_URL = "https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/OTF/SimplifiedChinese/SourceHanSansSC-Regular.otf"


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def number(value):
    text = clean(value).replace(",", "")
    match = re.search(r"[\d.]+", text)
    if not match:
        return None
    n = float(match.group())
    return int(n * 10000) if "\u4e07" in text else int(n)


def initial_state(html):
    match = re.search(r"window\.__INITIAL_STATE__\s*=\s*", html)
    if not match:
        return {}
    end = html.find(";\n", match.end())
    if end < 0:
        end = html.find(";</script>", match.end())
    if end < 0:
        return {}
    try:
        return json.loads(html[match.end():end])
    except json.JSONDecodeError:
        return {}


def needs_decode(text):
    return any(0xE000 <= ord(ch) <= 0xF8FF for ch in str(text or ""))


def cached_download(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return path
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=90) as response, open(path, "wb") as out:
        shutil.copyfileobj(response, out)
    return path


def glyph_bitmap(font, char, image, draw, np):
    from PIL import Image
    image.paste(255, (0, 0, 128, 128))
    draw.text((8, 0), char, font=font, fill=0)
    array = np.asarray(image)
    ys, xs = np.where(array < 245)
    if len(xs) == 0:
        return np.full((32, 32), 255, dtype=np.uint8)
    return np.asarray(image.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).resize((32, 32), Image.Resampling.LANCZOS))


def build_font_map(html, cache_dir):
    """Decode Fanqie's PUA glyphs using its embedded Source Han subset; cached by font asset."""
    if not needs_decode(html):
        return {}, []
    urls = re.findall(r"https?[^\"')\\]+?/awesome-font/c/([^/\"')\\]+?\.otf)", html)
    if not urls:
        return {}, ["FONT_DECODE_FONT_URL_MISSING"]
    font_url = "https://lf6-awef.bytetos.com/obj/awesome-font/c/" + urls[0]
    key = re.sub(r"[^A-Za-z0-9._-]+", "_", urls[0])
    os.makedirs(cache_dir, exist_ok=True)
    map_path = os.path.join(cache_dir, key + ".map.json")
    if os.path.exists(map_path):
        with open(map_path, encoding="utf-8") as f:
            saved = json.load(f)
        return saved.get("mapping", {}), saved.get("warnings", [])
    try:
        import numpy as np
        from PIL import Image, ImageDraw, ImageFont
        from fontTools.ttLib import TTFont
    except ImportError:
        return {}, ["FONT_DECODE_DEPENDENCY_MISSING: install fonttools pillow numpy"]
    try:
        subset_path = cached_download(font_url, os.path.join(cache_dir, key))
        reference_path = cached_download(SOURCE_HAN_URL, os.path.join(cache_dir, "SourceHanSansSC-Regular.otf"))
        subset_tt = TTFont(subset_path)
        full_tt = TTFont(reference_path)
        subset_cmap = subset_tt["cmap"].getBestCmap()
        encrypted = sorted(cp for cp in subset_cmap if 0xE000 <= cp <= 0xF8FF)
        full_cmap = full_tt["cmap"].getBestCmap()
        candidates = [cp for cp in full_cmap if 0x3400 <= cp <= 0x9FFF]
        full_font = ImageFont.truetype(reference_path, 96)
        subset_font = ImageFont.truetype(subset_path, 96)
        canvas = Image.new("L", (128, 128), 255)
        draw = ImageDraw.Draw(canvas)
        vectors = np.stack([glyph_bitmap(full_font, chr(cp), canvas, draw, np) for cp in candidates]).astype(np.int32)
        # Coarse 8x8 pass narrows 27k Han glyphs to 64; full 32x32 scoring then verifies the match.
        coarse_vectors = vectors[:, ::4, ::4]
        mapping, warnings = {}, []
        for cp in encrypted:
            target = glyph_bitmap(subset_font, chr(cp), canvas, draw, np).astype(np.int32)
            coarse_target = target[::4, ::4]
            coarse_scores = ((coarse_vectors - coarse_target) ** 2).mean(axis=(1, 2))
            shortlist = np.argpartition(coarse_scores, 64)[:64]
            scores = ((vectors[shortlist] - target) ** 2).mean(axis=(1, 2))
            order = shortlist[np.argsort(scores)[:2]]
            best, second = int(order[0]), int(order[1])
            best_score, second_score = scores[np.argsort(scores)[:2]]
            # A large distance margin is the evidence that this PUA glyph has one stable Chinese match.
            if best_score > 6000 or second_score / max(best_score, 1) < 1.35:
                warnings.append(f"FONT_DECODE_LOW_CONFIDENCE:U+{cp:04X}")
            # Keep the best visual match even when the margin is narrow; the warning stays in evidence.
            mapping[chr(cp)] = chr(candidates[best])
        saved = {"font_url": font_url, "mapping": mapping, "warnings": warnings, "mapped_count": len(mapping)}
        with open(map_path, "w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False, indent=2)
        return mapping, warnings
    except Exception as exc:
        return {}, [f"FONT_DECODE_FAILED:{type(exc).__name__}:{exc}"]


def decode_text(value, mapping):
    return str(value or "").translate(str.maketrans(mapping)) if mapping else str(value or "")


def normalize(raw, rank, url, captured, mapping):
    title = clean(decode_text(raw.get("bookName") or raw.get("title"), mapping))
    if not title:
        return None
    tags = raw.get("tags") or raw.get("tag") or []
    if isinstance(tags, str):
        tags = [x for x in re.split(r"[,\u3001 ]+", decode_text(tags, mapping)) if x]
    return {
        "rank": int(raw.get("currentPos") or rank), "title": title,
        "author": clean(decode_text(raw.get("author"), mapping)),
        "genre": clean(decode_text(raw.get("categoryV2") or raw.get("category"), mapping)),
        "tags": tags if isinstance(tags, list) else [], "words": number(raw.get("wordNumber")),
        "status": clean(raw.get("creationStatus")), "blurb": clean(decode_text(raw.get("abstract"), mapping)),
        "source_url": url, "captured_at": captured,
    }


def evidence_base(directory, url):
    os.makedirs(directory, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", urlparse(url).netloc + urlparse(url).path)
    return os.path.join(directory, f"fanqie_{time.strftime('%Y%m%d-%H%M%S')}_{safe}")


def parse_page(url, html, directory, mode, mapping, decoder_warnings):
    captured = datetime.now(timezone.utc).isoformat()
    base = evidence_base(directory, url)
    with open(base + ".html", "w", encoding="utf-8") as f:
        f.write(html)
    rank = initial_state(html).get("rank") or {}
    books = rank.get("book_list") or rank.get("readRankList") or rank.get("newRankList") or []
    rows = [normalize(book, i + 1, url, captured, mapping) for i, book in enumerate(books)]
    warnings = list(decoder_warnings)
    if mode != "crawl4ai":
        warnings.append("Crawl4AI unavailable; official server-rendered initial state was preserved.")
    return {"url": url, "captured_at": captured, "http_status": 200, "raw_html": base + ".html", "parser_source": "official_initial_state", "row_count": len(books), "rows": [x for x in rows if x], "warnings": warnings}


def ssr(url):
    request = Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"})
    with urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="replace")


async def crawl4ai(url):
    cfg = BrowserConfig(browser_type="chromium", headless=True)
    run = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, wait_until="networkidle", page_timeout=45000)
    async with AsyncWebCrawler(config=cfg) as crawler:
        result = await crawler.arun(url=url, config=run)
        return result.html or ""


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--evidence-dir", required=True)
    ap.add_argument("--pages", nargs="+", required=True)
    ap.add_argument("--min-sample", type=int, default=10)
    ap.add_argument("--cdp")
    ap.add_argument("--persistent-dir")
    ap.add_argument("--require-crawl4ai", action="store_true")
    args = ap.parse_args()
    if args.require_crawl4ai and not CRAWL4AI:
        print("Crawl4AI is required but not installed.", file=sys.stderr)
        return 2
    pages, mapping, decoder_warnings = [], None, []
    used_crawl4ai = False
    for url in args.pages:
        fallback_reason = None
        try:
            if CRAWL4AI:
                html = await crawl4ai(url)
                mode = "crawl4ai"
                used_crawl4ai = True
            else:
                html = await asyncio.to_thread(ssr, url)
                mode = "ssr"
        except Exception as crawl_error:
            if args.require_crawl4ai:
                raise
            # A partial package install commonly has no Playwright browser yet. Preserve acquisition by SSR.
            html = await asyncio.to_thread(ssr, url)
            mode = "ssr"
            fallback_reason = f"CRAWL4AI_RENDER_FALLBACK:{type(crawl_error).__name__}"
        try:
            if mapping is None or (not mapping and needs_decode(html)):
                mapping, decoder_warnings = await asyncio.to_thread(build_font_map, html, os.path.join(args.evidence_dir, "_font_decoder"))
            page = parse_page(url, html, args.evidence_dir, mode, mapping, decoder_warnings)
            if fallback_reason:
                page["warnings"].append(fallback_reason)
            pages.append(page)
        except Exception as exc:
            pages.append({"url": url, "captured_at": datetime.now(timezone.utc).isoformat(), "error": f"{type(exc).__name__}: {exc}", "rows": []})
    seen, items, diagnostics = set(), [], []
    for page in pages:
        for item in page.get("rows", []):
            key = (item["title"] + "\0" + item["author"]).lower()
            if key not in seen:
                seen.add(key)
                items.append(item)
    if len(items) < args.min_sample:
        diagnostics.append({"severity": "error", "code": "LOW_SAMPLE_SIZE", "sample_size": len(items), "minimum_sample": args.min_sample})
    data = {"schema_version": "1.3", "ok": len(items) >= args.min_sample, "platform": "fanqie", "platform_name": "Fanqie", "adapter": "crawl4ai" if used_crawl4ai else "official_ssr_fallback", "captured_at": datetime.now(timezone.utc).isoformat(), "sample_size": len(items), "items": items, "diagnostics": diagnostics, "acquisition": {"mode": "crawl4ai_playwright_render" if used_crawl4ai else "official_ssr_fallback", "font_decoder": {"mapped_count": len(mapping or {}), "low_confidence_count": sum(1 for item in decoder_warnings if str(item).startswith("FONT_DECODE_LOW_CONFIDENCE:")), "warnings": decoder_warnings}, "pages": [{k: v for k, v in page.items() if k != "rows"} for page in pages]}}
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    shutil.copyfile(args.out, os.path.join(args.evidence_dir, f"ranking-snapshot-{time.strftime('%Y%m%d-%H%M%S')}.json"))
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0 if data["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
