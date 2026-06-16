from __future__ import annotations

import argparse
import html
import json
import re
import sqlite3
from pathlib import Path
from urllib.parse import urlparse


SCRIPT_RE = re.compile(r"<script\b[^>]*>(.*?)</script>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")
JSON_ESCAPE_RE = re.compile(r"\\u[0-9a-fA-F]{4}|\\n|\\t|\\r|\\\"|\\\\|\\/")
WORD_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9][\u4e00-\u9fffA-Za-z0-9_+./:%-]*")


def decode_backslash_escapes(value: str) -> str:
    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if token.startswith("\\u"):
            try:
                return chr(int(token[2:], 16))
            except ValueError:
                return " "
        return {
            "\\n": " ",
            "\\t": " ",
            "\\r": " ",
            '\\"': '"',
            "\\\\": "\\",
            "\\/": "/",
        }.get(token, " ")

    return JSON_ESCAPE_RE.sub(replace, value)


def readable_text(raw_html: str) -> str:
    script_text = " ".join(match.group(1) for match in SCRIPT_RE.finditer(raw_html))
    no_tags = TAG_RE.sub(" ", raw_html)
    combined = html.unescape(no_tags + " " + script_text)
    combined = decode_backslash_escapes(combined)
    combined = TAG_RE.sub(" ", combined)
    tokens = WORD_RE.findall(combined)

    cleaned: list[str] = []
    seen_recent: set[str] = set()
    for token in tokens:
        if len(token) > 120:
            continue
        if token.startswith(("_next/static", "static/chunks")):
            continue
        if token in seen_recent and len(token) < 4:
            continue
        cleaned.append(token)
        seen_recent.add(token)
        if len(seen_recent) > 500:
            seen_recent.clear()
    return " ".join(cleaned)


def title_from_text(text: str, fallback: str) -> str:
    parts = text.split()
    for part in parts:
        if part not in {"MHWilds", "Kiranico", "Monster", "Hunter", "Wilds", "Database"}:
            return part[:80]
    return fallback


def url_from_raw_filename(raw_name: str) -> str:
    # The crawler manifest/page JSONL is preferred. This is only a fallback.
    stem = raw_name.rsplit("__", 1)[0]
    path = "/" + stem.replace("__", "/")
    return "https://mhwilds.kiranico.com/" + path.lstrip("/")


def load_page_records(data_dir: Path) -> list[dict[str, str]]:
    pages_path = data_dir / "pages.jsonl"
    if pages_path.exists():
        records = []
        for line in pages_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            record = json.loads(line)
            records.append({
                "url": record["url"],
                "raw_html": record["raw_html"],
                "title": record.get("title") or "",
            })
        return records

    records = []
    for raw_path in sorted((data_dir / "raw-html").glob("*.html")):
        records.append({
            "url": url_from_raw_filename(raw_path.name),
            "raw_html": f"raw-html/{raw_path.name}",
            "title": "",
        })
    return records


def reindex(data_dir: Path) -> None:
    records = load_page_records(data_dir)
    sqlite_path = data_dir / "kiranico.sqlite"
    if sqlite_path.exists():
        sqlite_path.unlink()

    connection = sqlite3.connect(sqlite_path)
    try:
        connection.execute("""
            CREATE TABLE pages (
                id INTEGER PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                title TEXT,
                path TEXT,
                raw_html TEXT,
                text TEXT
            )
        """)
        connection.execute("CREATE VIRTUAL TABLE page_search USING fts5(url, title, path, text)")

        for record in records:
            raw_path = data_dir / record["raw_html"]
            raw = raw_path.read_text(encoding="utf-8", errors="replace")
            text = readable_text(raw)
            parsed = urlparse(record["url"])
            title = record["title"] or title_from_text(text, parsed.path)
            connection.execute(
                "INSERT INTO pages(url, title, path, raw_html, text) VALUES (?, ?, ?, ?, ?)",
                (record["url"], title, parsed.path, record["raw_html"], text),
            )
            connection.execute(
                "INSERT INTO page_search(url, title, path, text) VALUES (?, ?, ?, ?)",
                (record["url"], title, parsed.path, text),
            )

        connection.commit()
    finally:
        connection.close()

    summary = {
        "page_count": len(records),
        "sqlite": "kiranico.sqlite",
        "source_files": "raw-html",
        "rebuilt_from": "raw HTML plus script payload text",
    }
    (data_dir / "reindex-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild local Kiranico SQLite search DB from archived raw HTML.")
    parser.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[1] / "data" / "kiranico"))
    args = parser.parse_args()
    reindex(Path(args.data_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
