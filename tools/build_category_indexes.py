from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path


CATEGORIES = {
    "weapons": {
        "label": "\u6b66\u5668",
        "patterns": ["/zh-Hant/data/weapons%"],
        "exclude": ["/zh-Hant/data/weapons"],
    },
    "armor": {
        "label": "\u9632\u5177\u88dd\u5099",
        "patterns": ["/zh-Hant/data/armor-series%"],
        "exclude": ["/zh-Hant/data/armor-series"],
    },
    "skills": {
        "label": "\u6280\u80fd",
        "patterns": ["/zh-Hant/data/skills%"],
        "exclude": ["/zh-Hant/data/skills"],
    },
    "items": {
        "label": "\u9053\u5177",
        "patterns": ["/zh-Hant/data/items%"],
        "exclude": ["/zh-Hant/data/items"],
    },
    "quests": {
        "label": "\u4efb\u52d9",
        "patterns": ["/zh-Hant/data/quests%", "/zh-Hant/data/missions%"],
        "exclude": ["/zh-Hant/data/quests", "/zh-Hant/data/missions"],
    },
}

BOILERPLATE = {
    "MHWilds", "Kiranico", "Monster", "Hunter", "Wilds", "Database",
    "self.__next_s", "self.__next_f", "push", "data-cfasync", "false",
    "children", "window.nitroAds", "createAd:function", "return", "new",
    "Promise", "Toggle", "theme", "\u7e41\u9ad4\u4e2d\u6587", "Game", "Ver.",
    "1.040", "\u4f7f\u547d\u6e05\u55ae", "\u4efb\u52d9", "\u9b54\u7269",
    "\u9053\u5177", "\u6b66\u5668", "\u9632\u5177", "\u6280\u80fd",
    "\u88dd\u98fe\u54c1", "Charms", "Food", "Skills", "Palico", "Weapons",
    "Armors", "\u52f3\u7ae0", "\u7375\u87f2",
}

CJK_RE = re.compile(r"[\u4e00-\u9fff]")
NUMBER_RE = re.compile(r"^(?:Lv)?\d+(?:\.\d+)?%?$|^\d+z$|^x\d+$", re.IGNORECASE)


STAT_LABELS = {"攻擊力", "會心率", "屬性值", "防禦力", "所需費用", "費用"}


def useful_token(token: str, previous: str = "") -> bool:
    if not token or token in BOILERPLATE:
        return False
    if token.startswith(("self.__next", "_next/static", "static/chunks", "window.", "document.", "localStorage.")):
        return False
    if CJK_RE.search(token):
        return True
    if token.startswith("Lv") or token.endswith("%") or token.endswith("z") or token.startswith("x"):
        return bool(NUMBER_RE.match(token))
    return previous in STAT_LABELS and bool(NUMBER_RE.match(token))


def pick_name(text: str, path: str) -> str:
    for token in text.split():
        if token in BOILERPLATE:
            continue
        if CJK_RE.search(token) and len(token) <= 40:
            return token
    return path.rstrip("/").rsplit("/", 1)[-1]


def make_summary(text: str, name: str, max_tokens: int = 44) -> str:
    raw_tokens = text.split()
    candidates = []

    for index, token in enumerate(raw_tokens):
        if token != name:
            continue
        cleaned = []
        for next_token in raw_tokens[index + 1:]:
            previous = cleaned[-1] if cleaned else ""
            if not useful_token(next_token, previous):
                continue
            if next_token == name and not cleaned:
                continue
            if next_token == name and cleaned:
                continue
            cleaned.append(next_token)
            if len(cleaned) >= max_tokens:
                break
        if cleaned:
            score = sum(3 for value in cleaned[:16] if CJK_RE.search(value))
            score += sum(8 for value in cleaned[:24] if value in {"攻擊力", "會心率", "屬性值", "防禦力", "技能", "強化素材", "報酬", "目標"})
            score -= sum(4 for value in cleaned[:8] if value in {"使命清單", "任務", "魔物", "道具", "武器", "防具", "技能", "裝飾品"})
            candidates.append((score, index, cleaned))

    if not candidates:
        return ""

    _score, _index, best = max(candidates, key=lambda item: (item[0], item[1]))
    return " ".join(best)


def rows_for_category(connection: sqlite3.Connection, patterns: list[str], exclude: list[str]) -> list[sqlite3.Row]:
    clauses = " OR ".join("path LIKE ?" for _ in patterns)
    params = list(patterns)
    if exclude:
        placeholders = ", ".join("?" for _ in exclude)
        clauses = f"({clauses}) AND path NOT IN ({placeholders})"
        params.extend(exclude)
    return list(connection.execute(f"SELECT url, path, title, text FROM pages WHERE {clauses} ORDER BY path", params))


def build(data_dir: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(data_dir / "kiranico.sqlite")
    connection.row_factory = sqlite3.Row
    manifest = {"categories": []}
    try:
        for key, config in CATEGORIES.items():
            items = []
            for row in rows_for_category(connection, config["patterns"], config.get("exclude", [])):
                name = pick_name(row["text"], row["path"])
                items.append({
                    "name": name,
                    "summary": make_summary(row["text"], name),
                    "path": row["path"],
                    "url": row["url"],
                    "category": key,
                    "categoryLabel": config["label"],
                })

            payload = {
                "key": key,
                "label": config["label"],
                "count": len(items),
                "items": items,
            }
            (output_dir / f"{key}.json").write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            manifest["categories"].append({"key": key, "label": config["label"], "count": len(items), "file": f"{key}.json"})
    finally:
        connection.close()

    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build static category JSON indexes from local Kiranico SQLite.")
    parser.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[1] / "data" / "kiranico"))
    parser.add_argument("--output-dir", default=str(Path(__file__).resolve().parents[1] / "data" / "categories"))
    args = parser.parse_args()
    build(Path(args.data_dir), Path(args.output_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
