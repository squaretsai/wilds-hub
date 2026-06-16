from __future__ import annotations

import argparse
import html as html_std
import json
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from lxml import etree
from lxml import html as lxml_html


BASE = "https://mhwilds.kiranico.com/zh-Hant"


@dataclass(frozen=True)
class ModelConfig:
    model: str
    label: str
    file: str
    detail_dir: str


MODELS = [
    ModelConfig("missions", "\u4f7f\u547d\u6e05\u55ae", "database-missions.html", "missions"),
    ModelConfig("quests", "\u4efb\u52d9", "database-quests.html", "quests"),
    ModelConfig("monsters", "\u9b54\u7269", "database-monsters.html", "monsters"),
    ModelConfig("items", "\u9053\u5177", "database-items.html", "items"),
    ModelConfig("weapons", "\u6b66\u5668", "database-weapons.html", "weapons"),
    ModelConfig("armor-series", "\u9632\u5177", "database-armor.html", "armor-series"),
    ModelConfig("skills", "\u6280\u80fd", "database-skills.html", "skills"),
    ModelConfig("decorations", "\u88dd\u98fe\u54c1", "database-decorations.html", "decorations"),
    ModelConfig("charms", "\u8b77\u77f3", "database-charms.html", "charms"),
    ModelConfig("food-skills", "\u98df\u4e8b\u6280\u80fd", "database-food-skills.html", "food-skills"),
    ModelConfig("palico-weapons", "\u96a8\u5f9e\u6b66\u5668", "database-palico-weapons.html", "palico-weapons"),
    ModelConfig("palico-armor", "\u96a8\u5f9e\u9632\u5177", "database-palico-armor.html", "palico-armor"),
    ModelConfig("awards", "\u52f3\u7ae0", "database-awards.html", "awards"),
    ModelConfig("kinsects", "\u7375\u87f2", "database-kinsects.html", "kinsects"),
]

MODEL_BY_NAME = {config.model: config for config in MODELS}

TERM_MAP = {
    "Species": "\u7a2e\u65cf",
    "BaseHealth": "\u57fa\u790e\u9ad4\u529b",
    "HunterRankPoint": "\u7375\u4eba\u9ede\u6578",
    "BuildUp": "\u7d2f\u7a4d\u503c",
    "Damage": "\u50b7\u5bb3",
    "Decay": "\u8870\u6e1b",
    "Ride": "\u9a0e\u4e58",
    "Parry": "\u9632\u79a6\u53cd\u64ca",
    "Capture": "\u6355\u7372",
    "Scar": "\u50b7\u53e3",
    "SkillStabbing": "\u96c6\u4e2d\u5f31\u9ede\u653b\u64ca",
    "SkillRyuki": "\u9f8d\u6c23\u6280\u80fd",
    "Players": "\u73a9\u5bb6\u6578",
    "Player": "\u73a9\u5bb6",
    "HP": "\u9ad4\u529b",
    "Attack": "\u653b\u64ca\u529b",
    "Body Parts HP": "\u90e8\u4f4d\u9ad4\u529b",
    "Slash/Blow": "\u65ac\u64ca/\u6253\u64ca",
    "Shot": "\u5f48",
    "Wounds": "\u50b7\u53e3",
    "Rarity": "\u7a00\u6709\u5ea6",
    "Affinity": "\u6703\u5fc3\u7387",
    "Element": "\u5c6c\u6027",
    "Defense": "\u9632\u79a6\u529b",
    "Slot": "\u9452\u5d4c\u69fd",
    "Slots": "\u9452\u5d4c\u69fd",
    "Skill": "\u6280\u80fd",
    "Skills": "\u6280\u80fd",
    "Materials": "\u7d20\u6750",
    "Description": "\u8aaa\u660e",
    "Value": "\u6578\u503c",
    "Type": "\u985e\u578b",
    "Reward": "\u5831\u916c",
    "Rewards": "\u5831\u916c",
    "Quantity": "\u6578\u91cf",
    "Rank": "\u7b49\u7d1a",
    "Monster": "\u9b54\u7269",
    "Monsters": "\u9b54\u7269",
    "Target": "\u76ee\u6a19",
    "Locale": "\u5730\u5340",
    "Time": "\u6642\u9593",
    "Part": "\u90e8\u4f4d",
    "Extract": "\u7cbe\u83ef",
    "RED": "\u7d05",
    "ORANGE": "\u6a59",
    "GREEN": "\u7da0",
    "WHITE": "\u767d",
}


def esc(value: object) -> str:
    return html_std.escape(str(value or ""), quote=True)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def translate_text(value: str) -> str:
    clean = normalize(value)
    return TERM_MAP.get(clean, clean)


def load_records(data_dir: Path) -> dict[str, dict[str, str]]:
    records = {}
    for line in (data_dir / "pages.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            record = json.loads(line)
            records[record["url"]] = record
    return records


def read_doc(data_dir: Path, record: dict[str, str]):
    source = (data_dir / record["raw_html"]).read_text(encoding="utf-8", errors="replace")
    return lxml_html.fromstring(source)


def slug_from_url(url: str) -> str:
    return urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]


def text(el) -> str:
    return normalize(el.text_content())


def local_href(href: str | None, depth: int) -> str:
    if not href:
        return "#"
    parsed = urlparse(href)
    path = parsed.path
    prefix = "../" * depth
    if path in ("/", "/zh-Hant"):
        return f"{prefix}index.html"
    if path == "/zh-Hant/data":
        return f"{prefix}database.html"
    if path.startswith("/zh-Hant/data/"):
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3:
            model = parts[2]
            config = MODEL_BY_NAME.get(model)
            if config and len(parts) == 3:
                return f"{prefix}{config.file}"
            if config and len(parts) >= 4:
                slug = parts[3]
                return f"{prefix}database/{config.detail_dir}/{slug}.html"
    return "#"


def render_element(el, depth: int) -> str:
    if not isinstance(el.tag, str):
        return ""
    tag = (el.tag or "").lower()
    if tag in {"script", "style", "noscript"}:
        return ""
    if tag == "img":
        src = el.get("src") or ""
        alt = el.get("alt") or ""
        if not src:
            return ""
        return f'<img class="k-icon-img" src="{esc(src)}" alt="{esc(alt)}">'
    if tag == "svg":
        return etree.tostring(el, encoding="unicode", method="html")
    if tag == "br":
        return "<br>"
    inner = render_children(el, depth)
    if tag == "a":
        content = inner or esc(translate_text(text(el)))
        return f'<a href="{esc(local_href(el.get("href"), depth))}">{content}</a>'
    if tag in {"div", "p"}:
        return f'<span class="k-cell-line">{inner}</span>' if inner else ""
    if tag in {"span", "strong", "em", "small", "b", "i"}:
        return inner
    return inner


def render_children(el, depth: int) -> str:
    chunks: list[str] = []
    if el.text and normalize(el.text):
        chunks.append(esc(translate_text(el.text)))
    for child in el:
        rendered = render_element(child, depth)
        if rendered:
            chunks.append(rendered)
        if child.tail and normalize(child.tail):
            chunks.append(esc(translate_text(child.tail)))
    return " ".join(chunks)


def cell_html(cell, depth: int) -> str:
    rendered = render_children(cell, depth)
    if rendered:
        return rendered
    return esc(translate_text(text(cell)))


def table_html(table, depth: int, wide: bool = False) -> str:
    rows = []
    for tr in table.xpath(".//tr"):
        cells = tr.xpath("./th|./td")
        if not cells:
            continue
        tag = "th" if tr.xpath("./th") else "td"
        row_cells = "".join(f"<{tag}>{cell_html(cell, depth)}</{tag}>" for cell in cells)
        rows.append(f"<tr>{row_cells}</tr>")
    if not rows:
        return ""
    css = "k-table wide" if wide else "k-table"
    return f'<div class="table-wrap"><table class="{css}"><tbody>{"".join(rows)}</tbody></table></div>'


def sidebar(active: str, depth: int) -> str:
    prefix = "../" * depth
    links = []
    for config in MODELS:
        active_class = " active" if config.label == active else ""
        links.append(
            f'<a class="{active_class.strip()}" href="{prefix}{config.file}">{esc(config.label)}</a>'
        )
    return "".join(links)


def shell(title: str, active: str, body: str, depth: int = 0) -> str:
    prefix = "../" * depth
    return f"""<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{esc(title)} | \u8352\u91ce\u8cc7\u6599\u5eab</title>
    <link rel="stylesheet" href="{prefix}styles.css">
  </head>
  <body class="k-page">
    <header class="k-top">
      <div class="k-crumbs">
        <a href="{prefix}index.html">\u9b54\u7269\u7375\u4eba \u8352\u91ce</a>
        <span>\u203a</span>
        <a href="{prefix}database.html">\u8cc7\u6599\u5eab</a>
      </div>
      <div class="k-global-search" data-search-root="{prefix}">
        <input type="search" placeholder="\u641c\u5c0b\u6240\u6709\u672c\u6a5f\u8cc7\u6599" autocomplete="off" data-global-search-input>
        <div class="k-search-results" data-global-search-results hidden></div>
      </div>
    </header>
    <div class="k-shell">
      <aside class="k-sidebar">
        <div class="lang-badge">\u7e41\u9ad4\u4e2d\u6587</div>
        <div class="version">\u904a\u6232\u7248\u672c 1.040</div>
        <nav>{sidebar(active, depth)}</nav>
      </aside>
      <main class="k-content">{body}</main>
    </div>
    <script src="{prefix}app.js" defer></script>
  </body>
</html>
"""


def make_title(doc, fallback: str) -> str:
    for selector in ("//h1", "//h2"):
        nodes = [text(node) for node in doc.xpath(selector) if text(node)]
        if nodes:
            return translate_text(nodes[0].split("|")[0])
    title_nodes = doc.xpath("//title")
    if title_nodes and text(title_nodes[0]):
        return translate_text(text(title_nodes[0]).split("|")[0])
    return fallback


def unique_item_links(doc, model: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen = set()
    for link in doc.xpath(f'//a[starts-with(@href,"/zh-Hant/data/{model}/")]'):
        slug = slug_from_url(link.get("href") or "")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        leaf_text = [normalize(part) for part in link.xpath(".//text()") if normalize(part)]
        name = leaf_text[-1] if leaf_text else slug
        img = link.xpath(".//img/@src")
        items.append({"slug": slug, "name": name, "icon": img[0] if img else ""})
    return items


def detail_records_for_model(records: dict[str, dict[str, str]], model: str) -> list[tuple[str, dict[str, str]]]:
    prefix = f"{BASE}/data/{model}/"
    found: list[tuple[str, dict[str, str]]] = []
    for url, record in records.items():
        if url.startswith(prefix):
            slug = slug_from_url(url)
            if slug:
                found.append((slug, record))
    return found


def stat_value(doc, label: str) -> str:
    for tr in doc.xpath("//table[1]//tr"):
        cells = tr.xpath("./th|./td")
        if len(cells) >= 2 and text(cells[0]) == label:
            return text(cells[1])
    return ""


def build_weapon_list_from_details(
    config: ModelConfig,
    data_dir: Path,
    output_dir: Path,
    records: dict[str, dict[str, str]],
) -> int:
    rows = []
    entries = []
    for slug, record in detail_records_for_model(records, config.model):
        doc = read_doc(data_dir, record)
        title = make_title(doc, slug)
        quote_nodes = [text(q) for q in doc.xpath("//blockquote") if text(q)]
        description = quote_nodes[0] if quote_nodes else ""
        if "#Rejected#" in title or "#Rejected#" in description:
            continue
        icon_nodes = doc.xpath("//img/@src")
        entries.append(
            {
                "slug": slug,
                "title": title,
                "description": description,
                "icon": icon_nodes[0] if icon_nodes else "",
                "attack": stat_value(doc, "\u653b\u64ca\u529b"),
                "affinity": stat_value(doc, "\u6703\u5fc3\u7387"),
                "element": stat_value(doc, "\u5c6c\u6027\u503c") or stat_value(doc, "\u5c6c\u6027"),
            }
        )
    for entry in sorted(entries, key=lambda item: item["title"]):
        icon = f'<img class="k-weapon-thumb" src="{esc(entry["icon"])}" alt="">' if entry["icon"] else ""
        rows.append(
            "<tr>"
            f"<td>{icon}</td>"
            f'<td><a href="database/{esc(config.detail_dir)}/{esc(entry["slug"])}.html">{esc(entry["title"])}</a></td>'
            f"<td>{esc(entry['attack'])}</td>"
            f"<td>{esc(entry['affinity'])}</td>"
            f"<td>{esc(entry['element'])}</td>"
            f"<td>{esc(entry['description'])}</td>"
            "</tr>"
        )
    header = (
        "<tr>"
        "<th></th>"
        f"<th>{esc(config.label)}</th>"
        "<th>\u653b\u64ca\u529b</th>"
        "<th>\u6703\u5fc3\u7387</th>"
        "<th>\u5c6c\u6027</th>"
        "<th>\u8aaa\u660e</th>"
        "</tr>"
    )
    body = (
        '<section class="k-list-page">'
        f'<div class="table-wrap"><table class="k-table wide"><tbody>{header}{"".join(rows)}</tbody></table></div>'
        "</section>"
    )
    (output_dir / config.file).write_text(shell(config.label, config.label, body), encoding="utf-8")
    return len(entries)


def build_database_index(output_dir: Path) -> None:
    rows = []
    for config in MODELS:
        rows.append(
            f"""
            <a class="k-index-card" href="{esc(config.file)}">
              <span>{esc(config.label)}</span>
            </a>
            """
        )
    body = f"""
      <section class="k-database-index">
        <h1>\u8cc7\u6599\u5eab</h1>
        <div class="k-index-grid">{''.join(rows)}</div>
      </section>
    """
    (output_dir / "database.html").write_text(
        shell("\u8cc7\u6599\u5eab", "\u9b54\u7269", body),
        encoding="utf-8",
    )


def build_list_page(
    config: ModelConfig,
    data_dir: Path,
    output_dir: Path,
    records: dict[str, dict[str, str]],
) -> int:
    if config.model == "weapons":
        return build_weapon_list_from_details(config, data_dir, output_dir, records)
    record = records.get(f"{BASE}/data/{config.model}")
    if not record:
        return 0
    doc = read_doc(data_dir, record)
    tables = doc.xpath("//table")
    if tables:
        table_blocks = [table_html(table, 0, wide=True) for table in tables]
        body = f'<section class="k-list-page">{"".join(table_blocks)}</section>'
        count = sum(len(table.xpath(".//tr")) for table in tables)
    else:
        links = unique_item_links(doc, config.model)
        cards = []
        for item in links:
            icon = f'<img src="{esc(item["icon"])}" alt="">' if item["icon"] else ""
            cards.append(
                f'<a class="k-link-card" href="database/{esc(config.detail_dir)}/{esc(item["slug"])}.html">'
                f'{icon}<span>{esc(item["name"])}</span></a>'
            )
        body = f'<section class="k-link-grid">{"".join(cards)}</section>'
        count = len(links)
    (output_dir / config.file).write_text(shell(config.label, config.label, body), encoding="utf-8")
    return count


def detail_sections(doc, depth: int) -> str:
    quotes = [text(q) for q in doc.xpath("//blockquote") if text(q)]
    quote_html = "".join(f"<blockquote>{esc(q)}</blockquote>" for q in quotes)

    tables = [table_html(table, depth, wide=True) for table in doc.xpath("//table")]
    table_html_block = "".join(f'<section class="k-section">{table}</section>' for table in tables if table)

    if not quote_html and not table_html_block:
        paragraphs = [text(node) for node in doc.xpath("//main//p|//article//p") if text(node)]
        quote_html = "".join(f"<blockquote>{esc(p)}</blockquote>" for p in paragraphs[:4])
    return f'<div class="k-quotes">{quote_html}</div>{table_html_block}'


def search_summary(doc) -> str:
    quotes = [text(q) for q in doc.xpath("//blockquote") if text(q)]
    if quotes:
        return normalize(" ".join(quotes))[:260]
    table_bits = []
    for table in doc.xpath("//table")[:2]:
        for row in table.xpath(".//tr")[:8]:
            value = text(row)
            if value:
                table_bits.append(value)
    if table_bits:
        return normalize(" ".join(table_bits))[:260]
    paragraphs = [text(node) for node in doc.xpath("//main//p|//article//p") if text(node)]
    return normalize(" ".join(paragraphs))[:260]


def build_search_index(
    data_dir: Path,
    output_dir: Path,
    records: dict[str, dict[str, str]],
) -> None:
    entries = []
    seen = set()
    for config in MODELS:
        entries.append(
            {
                "title": config.label,
                "category": config.label,
                "summary": "\u5206\u985e\u6e05\u55ae",
                "href": config.file,
                "path": f"/zh-Hant/data/{config.model}",
            }
        )
        for slug, record in detail_records_for_model(records, config.model):
            key = (config.model, slug)
            if key in seen:
                continue
            seen.add(key)
            doc = read_doc(data_dir, record)
            title = make_title(doc, slug)
            if "#Rejected#" in title:
                continue
            entries.append(
                {
                    "title": title,
                    "category": config.label,
                    "summary": search_summary(doc),
                    "href": f"database/{config.detail_dir}/{slug}.html",
                    "path": f"/zh-Hant/data/{config.model}/{slug}",
                }
            )
    (output_dir / "data" / "local-search-index.json").write_text(
        json.dumps(entries, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def build_detail_pages(
    config: ModelConfig,
    data_dir: Path,
    output_dir: Path,
    records: dict[str, dict[str, str]],
) -> int:
    prefix = f"{BASE}/data/{config.model}/"
    detail_dir = output_dir / "database" / config.detail_dir
    detail_dir.mkdir(parents=True, exist_ok=True)
    for old_page in detail_dir.glob("*.html"):
        old_page.unlink()
    count = 0
    for url, record in records.items():
        if not url.startswith(prefix):
            continue
        slug = slug_from_url(url)
        if not slug:
            continue
        doc = read_doc(data_dir, record)
        title = make_title(doc, slug)
        if "#Rejected#" in title:
            continue
        body = f"""
          <article class="k-detail">
            <h1>{esc(title)}</h1>
            {detail_sections(doc, 2)}
          </article>
        """
        (detail_dir / f"{slug}.html").write_text(
            shell(title, config.label, body, depth=2),
            encoding="utf-8",
        )
        count += 1
    return count


def build(data_dir: Path, output_dir: Path) -> None:
    records = load_records(data_dir)
    build_database_index(output_dir)
    manifest: dict[str, dict[str, int]] = {}
    for config in MODELS:
        list_count = build_list_page(config, data_dir, output_dir, records)
        detail_count = build_detail_pages(config, data_dir, output_dir, records)
        manifest[config.model] = {"list_rows": list_count, "detail_pages": detail_count}
    data_out = output_dir / "data"
    data_out.mkdir(parents=True, exist_ok=True)
    build_search_index(data_dir, output_dir, records)
    (data_out / "local-pages-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local Kiranico-like data pages.")
    parser.add_argument("--data-dir", default=str(Path(__file__).resolve().parents[1] / "data" / "kiranico"))
    parser.add_argument("--output-dir", default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args()
    build(Path(args.data_dir), Path(args.output_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
