from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sqlite3
import time
from collections import deque
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urljoin, urlparse
from urllib.request import Request, urlopen


BASE_URL = "https://mhwilds.kiranico.com/zh-Hant"
USER_AGENT = "WildsHubPersonalCrawler/0.2 (+local personal archive)"


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.text_parts: list[str] = []
        self.title_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "svg", "noscript"}:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "svg", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title_parts.append(text)
        if self._skip_depth:
            return
        self.text_parts.append(text)


def clean_text(parts: Iterable[str]) -> str:
    text = " ".join(parts)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_url(url: str, base: str) -> str | None:
    absolute = urljoin(base, url)
    absolute, _fragment = urldefrag(absolute)
    parsed = urlparse(absolute)

    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc != "mhwilds.kiranico.com":
        return None
    if not parsed.path.startswith("/zh-Hant"):
        return None
    if "/_next/" in parsed.path:
        return None
    if parsed.path.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".css", ".js")):
        return None

    path = parsed.path.rstrip("/") or "/zh-Hant"
    return parsed._replace(path=path, query="").geturl()


def raw_filename(url: str) -> str:
    parsed = urlparse(url)
    slug = parsed.path.strip("/").replace("/", "__") or "index"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    return f"{slug}__{digest}.html"


def safe_label(url: str) -> str:
    parsed = urlparse(url)
    label = parsed.path.strip("/") or "home"
    return label.encode("ascii", "backslashreplace").decode("ascii")


def fetch(url: str, timeout: int) -> tuple[int, str, str]:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-Hant,zh;q=0.9"})
    with urlopen(request, timeout=timeout) as response:
        status = getattr(response, "status", 200)
        content_type = response.headers.get("content-type", "")
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, "replace")
        return status, content_type, body


def parse_page(url: str, body: str) -> dict[str, object]:
    parser = PageParser()
    parser.feed(body)
    links = sorted({
        normalized
        for href in parser.links
        if (normalized := normalize_url(href, url))
    })
    return {
        "url": url,
        "title": clean_text(parser.title_parts),
        "text": clean_text(parser.text_parts),
        "links": links,
    }


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_sqlite(path: Path, records: list[dict[str, object]]) -> None:
    if path.exists():
        path.unlink()
    connection = sqlite3.connect(path)
    try:
        connection.execute("""
            CREATE TABLE pages (
                id INTEGER PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                title TEXT,
                raw_html TEXT,
                text TEXT
            )
        """)
        connection.execute("""
            CREATE TABLE links (
                from_url TEXT NOT NULL,
                to_url TEXT NOT NULL,
                PRIMARY KEY (from_url, to_url)
            )
        """)
        connection.execute("CREATE INDEX idx_pages_title ON pages(title)")
        connection.execute("CREATE VIRTUAL TABLE page_search USING fts5(url, title, text)")

        for record in records:
            connection.execute(
                "INSERT INTO pages(url, title, raw_html, text) VALUES (?, ?, ?, ?)",
                (record["url"], record.get("title", ""), record.get("raw_html", ""), record.get("text", "")),
            )
            connection.execute(
                "INSERT INTO page_search(url, title, text) VALUES (?, ?, ?)",
                (record["url"], record.get("title", ""), record.get("text", "")),
            )
            for link in record.get("links", []):
                connection.execute(
                    "INSERT OR IGNORE INTO links(from_url, to_url) VALUES (?, ?)",
                    (record["url"], link),
                )
        connection.commit()
    finally:
        connection.close()


def load_raw_if_present(raw_dir: Path, url: str) -> str | None:
    path = raw_dir / raw_filename(url)
    if path.exists():
        return path.read_text(encoding="utf-8", errors="replace")
    return None


def crawl(output_dir: Path, delay: float, timeout: int, max_pages: int, checkpoint_every: int, quiet: bool) -> int:
    raw_dir = output_dir / "raw-html"
    raw_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    queue: deque[str] = deque([BASE_URL])
    queued = {BASE_URL}
    seen: set[str] = set()
    records: list[dict[str, object]] = []
    failures: list[dict[str, str]] = []

    while queue and len(seen) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue

        raw_path = raw_dir / raw_filename(url)
        body = load_raw_if_present(raw_dir, url)
        source = "cache" if body is not None else "fetch"
        if not quiet:
            print(f"[{len(seen) + 1}] {source} {safe_label(url)}", flush=True)

        if body is None:
            try:
                _status, _content_type, body = fetch(url, timeout)
                raw_path.write_text(body, encoding="utf-8")
                time.sleep(delay)
            except (HTTPError, URLError, TimeoutError, OSError) as error:
                failures.append({"url": url, "error": str(error)})
                seen.add(url)
                continue

        parsed = parse_page(url, body)
        for link in parsed["links"]:
            if link not in queued and link not in seen:
                queue.append(link)
                queued.add(link)

        records.append({
            "url": url,
            "title": parsed["title"],
            "raw_html": f"raw-html/{raw_path.name}",
            "text": parsed["text"],
            "links": parsed["links"],
        })
        seen.add(url)

        if checkpoint_every and len(records) % checkpoint_every == 0:
            write_jsonl(output_dir / "pages.partial.jsonl", records)
            (output_dir / "manifest.partial.json").write_text(
                json.dumps({
                    "source": BASE_URL,
                    "page_count": len(records),
                    "failure_count": len(failures),
                    "queued": len(queue),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    write_jsonl(output_dir / "pages.jsonl", records)
    write_sqlite(output_dir / "kiranico.sqlite", records)
    manifest = {
        "source": BASE_URL,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "page_count": len(records),
        "failure_count": len(failures),
        "queued_not_crawled": len(queue),
        "delay_seconds": delay,
        "max_pages": max_pages,
        "outputs": {
            "pages_jsonl": "pages.jsonl",
            "sqlite": "kiranico.sqlite",
            "raw_html_dir": "raw-html",
        },
        "failures": failures,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0 if not failures and not queue else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Archive Kiranico MHWilds zh-Hant pages for local personal search.")
    parser.add_argument("--output", default=str(Path(__file__).resolve().parents[1] / "data" / "kiranico"))
    parser.add_argument("--delay", type=float, default=0.15)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--max-pages", type=int, default=5000)
    parser.add_argument("--checkpoint-every", type=int, default=50)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    return crawl(Path(args.output), args.delay, args.timeout, args.max_pages, args.checkpoint_every, args.quiet)


if __name__ == "__main__":
    raise SystemExit(main())
