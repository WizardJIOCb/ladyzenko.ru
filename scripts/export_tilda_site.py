from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT_URL = "https://ladyzenko.ru/"
OUTPUT_DIR = Path("export")
RAW_DIR = OUTPUT_DIR / "raw_html"
PAGES_DIR = OUTPUT_DIR / "pages"
ASSETS_DIR = OUTPUT_DIR / "assets"
TIMEOUT = 30
USER_AGENT = "Mozilla/5.0 (compatible; LadyzenkoMigrationBot/1.0; +https://ladyzenko.ru)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})

CONTENT_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".zip",
    ".rar",
    ".mp3",
    ".wav",
    ".ogg",
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".m4a",
}


@dataclass
class PageRecord:
    url: str
    slug: str
    title: str
    meta_description: str
    meta_keywords: str
    h1: list[str]
    headings: list[dict[str, str]]
    text: str
    paragraphs: list[str]
    popups: list[dict[str, str]]
    images: list[str]
    files: list[str]
    videos: list[dict[str, str]]
    contacts: list[str]
    links: list[str]
    canonical: str
    og_image: str


def fetch(url: str) -> requests.Response:
    response = SESSION.get(url, timeout=TIMEOUT)
    response.raise_for_status()
    response.encoding = "utf-8"
    return response


def ensure_dirs() -> None:
    for path in (OUTPUT_DIR, RAW_DIR, PAGES_DIR, ASSETS_DIR):
        path.mkdir(parents=True, exist_ok=True)


def xml_loc_values(xml_text: str) -> list[str]:
    soup = BeautifulSoup(xml_text, "xml")
    return [loc.get_text(strip=True) for loc in soup.find_all("loc")]


def slugify_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    if not path:
        return "index"
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", path)
    return safe.strip("-") or "page"


def text_content(node) -> str:
    return " ".join(node.get_text(" ", strip=True).split())


def dedupe(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        item = item.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def normalize_url(url: str) -> str:
    return urljoin(ROOT_URL, url)


def is_content_asset(url: str) -> bool:
    parsed = urlparse(url)
    ext = Path(parsed.path.lower()).suffix
    if ext in CONTENT_EXTENSIONS:
        return True
    mime, _ = mimetypes.guess_type(parsed.path)
    return bool(mime and not mime.startswith("text/"))


def asset_target_path(url: str) -> Path:
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    host = parsed.netloc.replace(":", "_")
    base_name = Path(parsed.path).name or "asset"
    if not ext:
        base_name = f"{base_name}.bin"
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "-", base_name)
    return ASSETS_DIR / host / f"{digest}-{safe_name}"


def download_asset(url: str) -> str:
    url = normalize_url(url)
    target = asset_target_path(url)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return str(target.as_posix())
    try:
        response = SESSION.get(url, timeout=TIMEOUT, stream=True)
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 64):
                if chunk:
                    handle.write(chunk)
        time.sleep(0.05)
        return str(target.as_posix())
    except Exception as exc:  # noqa: BLE001
        return f"ERROR: {url} :: {exc}"


def extract_page(url: str, html: str) -> PageRecord:
    soup = BeautifulSoup(html, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else ""

    def meta(name: str, attr: str = "name") -> str:
        tag = soup.find("meta", attrs={attr: name})
        return tag.get("content", "").strip() if tag else ""

    body = soup.body or soup
    for tag in body.select("script, style, noscript"):
        tag.decompose()

    paragraphs = dedupe(text_content(p) for p in body.select("p, li") if text_content(p))
    headings = [
        {"level": tag.name, "text": text_content(tag)}
        for tag in body.select("h1, h2, h3, h4, h5, h6")
        if text_content(tag)
    ]
    h1 = [item["text"] for item in headings if item["level"] == "h1"]

    popup_cards = []
    for popup in body.select(".t-popup, [data-tooltip-hook]"):
        title_node = popup.select_one(".t390__title, .t-popup__title, h1, h2, h3")
        text_node = popup.select_one(".t390__descr, .t-popup__descr, .t-popup__text")
        title_text = text_content(title_node) if title_node else ""
        popup_text = text_content(text_node) if text_node else ""
        if title_text or popup_text:
            popup_cards.append({"title": title_text, "text": popup_text})

    images = dedupe(
        normalize_url(tag.get("data-original") or tag.get("src") or "")
        for tag in body.select("img, [data-original]")
        if (tag.get("data-original") or tag.get("src"))
    )
    links = dedupe(normalize_url(tag.get("href")) for tag in body.select("a[href]"))
    files = [link for link in links if is_content_asset(link)]

    videos = []
    for node in body.select("[data-videolazy-type], iframe[src], video source[src], video[src]"):
        src = node.get("data-videolazy-id") or node.get("src") or ""
        kind = node.get("data-videolazy-type") or node.name
        if src:
            videos.append({"type": kind, "src": normalize_url(src)})

    contacts = dedupe(
        link
        for link in links
        if link.startswith("mailto:") or link.startswith("tel:") or "wa.me" in link or "whatsapp" in link or "t.me/" in link
    )

    return PageRecord(
        url=url,
        slug=slugify_url(url),
        title=title,
        meta_description=meta("description"),
        meta_keywords=meta("keywords"),
        h1=h1,
        headings=headings,
        text="\n\n".join(paragraphs),
        paragraphs=paragraphs,
        popups=popup_cards,
        images=images,
        files=files,
        videos=videos,
        contacts=contacts,
        links=links,
        canonical=(soup.find("link", rel="canonical") or {}).get("href", ""),
        og_image=meta("og:image", attr="property"),
    )


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def collect_urls() -> list[str]:
    sitemap_urls = xml_loc_values(fetch(urljoin(ROOT_URL, "sitemap.xml")).text)
    feed_sitemap_index = xml_loc_values(fetch(urljoin(ROOT_URL, "sitemap-feeds.xml")).text)
    for feed_map in feed_sitemap_index:
        try:
            sitemap_urls.extend(xml_loc_values(fetch(feed_map).text))
        except Exception:  # noqa: BLE001
            continue
    urls = dedupe(urljoin(ROOT_URL, url) for url in sitemap_urls)
    if ROOT_URL not in urls:
        urls.insert(0, ROOT_URL)
    return urls


def markdown_for_page(page: PageRecord, asset_map: dict[str, str]) -> str:
    lines = [
        f"# {page.title or page.slug}",
        "",
        f"- URL: {page.url}",
        f"- Slug: {page.slug}",
        f"- Canonical: {page.canonical}",
        f"- Description: {page.meta_description}",
        f"- OG image: {page.og_image}",
        "",
    ]

    if page.h1:
        lines.extend(["## H1", ""])
        lines.extend(f"- {item}" for item in page.h1)
        lines.append("")

    if page.headings:
        lines.extend(["## Headings", ""])
        lines.extend(f"- {item['level'].upper()}: {item['text']}" for item in page.headings)
        lines.append("")

    if page.popups:
        lines.extend(["## Popups", ""])
        for popup in page.popups:
            if popup["title"]:
                lines.append(f"### {popup['title']}")
            if popup["text"]:
                lines.append(popup["text"])
            lines.append("")

    if page.paragraphs:
        lines.extend(["## Text", ""])
        lines.extend(page.paragraphs)
        lines.append("")

    if page.images:
        lines.extend(["## Images", ""])
        for image in page.images:
            local = asset_map.get(image, "")
            suffix = f" -> {local}" if local else ""
            lines.append(f"- {image}{suffix}")
        lines.append("")

    if page.files:
        lines.extend(["## Files", ""])
        for file_url in page.files:
            local = asset_map.get(file_url, "")
            suffix = f" -> {local}" if local else ""
            lines.append(f"- {file_url}{suffix}")
        lines.append("")

    if page.videos:
        lines.extend(["## Videos", ""])
        lines.extend(f"- {item['type']}: {item['src']}" for item in page.videos)
        lines.append("")

    if page.contacts:
        lines.extend(["## Contacts", ""])
        lines.extend(f"- {item}" for item in page.contacts)
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def main() -> int:
    ensure_dirs()
    urls = collect_urls()
    all_pages: list[dict] = []
    asset_urls: list[str] = []

    print(f"Found {len(urls)} page URLs")

    for index, url in enumerate(urls, start=1):
        print(f"[{index}/{len(urls)}] Exporting {url}")
        response = fetch(url)
        page = extract_page(url, response.text)
        raw_html_path = RAW_DIR / f"{page.slug}.html"
        write_text(raw_html_path, response.text)
        all_pages.append(page.__dict__)
        asset_urls.extend(page.images)
        asset_urls.extend(page.files)
        time.sleep(0.1)

    asset_map: dict[str, str] = {}
    for asset_url in dedupe(asset_urls):
        print(f"Downloading asset {asset_url}")
        asset_map[asset_url] = download_asset(asset_url)

    for page_data in all_pages:
        page = PageRecord(**page_data)
        json_path = PAGES_DIR / f"{page.slug}.json"
        md_path = PAGES_DIR / f"{page.slug}.md"
        write_json(json_path, page_data)
        write_text(md_path, markdown_for_page(page, asset_map))

    summary = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "root_url": ROOT_URL,
        "page_count": len(all_pages),
        "asset_count": len(asset_map),
        "pages": [
            {
                "url": page["url"],
                "slug": page["slug"],
                "title": page["title"],
                "description": page["meta_description"],
                "images": len(page["images"]),
                "files": len(page["files"]),
                "videos": len(page["videos"]),
                "popups": len(page["popups"]),
            }
            for page in all_pages
        ],
        "assets": asset_map,
    }
    write_json(OUTPUT_DIR / "site-index.json", summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
