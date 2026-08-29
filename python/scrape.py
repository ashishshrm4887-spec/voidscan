#!/usr/bin/env python3
"""
VOIDSCAN — Python scraper (requests + BeautifulSoup)

Usage:
  pip install -r requirements.txt
  python scrape.py https://example.com
  python scrape.py https://example.com --json out.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
TIMEOUT = 18
MAX_BYTES = 6 * 1024 * 1024

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24}")
PHONE_RE = re.compile(
    r"(?:\+\d{1,3}[\s.\-]*)?(?:\(?\d{2,4}\)?[\s.\-]*)?\d{2,4}[\s.\-]+\d{2,4}(?:[\s.\-]+\d{2,4})?"
)
BG_IMAGE_RE = re.compile(
    r"background(?:-image)?\s*:\s*url\(['\"]?([^'\")\s]+)['\"]?\)", re.I
)


def unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        v = item.strip()
        if not v:
            continue
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out


def fetch_page(url: str, user_agent: str | None = None) -> tuple[str, requests.Response]:
    headers = {
        "User-Agent": user_agent or DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
    }
    resp = requests.get(url, headers=headers, timeout=TIMEOUT, allow_redirects=True)
    resp.raise_for_status()
    # Cap body size
    content = resp.content[:MAX_BYTES]
    text = content.decode(resp.encoding or "utf-8", errors="replace")
    return text, resp


def scrape(url: str, user_agent: str | None = None) -> dict[str, Any]:
    html, resp = fetch_page(url, user_agent)
    soup = BeautifulSoup(html, "lxml")

    base = url
    base_tag = soup.find("base", href=True)
    if base_tag and base_tag.get("href"):
        base = urljoin(url, base_tag["href"])

    def resolve(href: str) -> str:
        return urljoin(base, href)

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    og_title = soup.find("meta", property="og:title")
    if not title and og_title and og_title.get("content"):
        title = og_title["content"].strip()

    description = ""
    desc = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", property="og:description"
    )
    if desc and desc.get("content"):
        description = desc["content"].strip()

    # Meta tags
    meta: list[dict[str, str]] = []
    for tag in soup.find_all("meta"):
        meta.append(
            {
                "name": tag.get("name") or "",
                "property": tag.get("property") or "",
                "content": tag.get("content") or tag.get("value") or "",
            }
        )

    # Links
    links: list[dict[str, str]] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            resolved = href
        else:
            resolved = resolve(href)
        links.append(
            {
                "href": resolved,
                "text": a.get_text(" ", strip=True)[:240],
            }
        )

    # Images + CSS backgrounds + video
    media: list[dict[str, str]] = []
    seen_src: set[str] = set()

    def add_media(src: str, kind: str, alt: str = "") -> None:
        if not src or src.startswith("data:") or src in seen_src:
            return
        seen_src.add(src)
        media.append({"src": src, "type": kind, "alt": alt})

    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if src:
            add_media(resolve(src), "image", img.get("alt") or "")

    for m in meta:
        prop = (m.get("property") or m.get("name") or "").lower()
        content = m.get("content") or ""
        if prop in ("og:image", "twitter:image", "twitter:image:src") and content:
            add_media(resolve(content), "image", prop)
        if prop in ("og:video", "og:video:url") and content:
            add_media(resolve(content), "video", prop)

    for tag in soup.find_all(style=True):
        for match in BG_IMAGE_RE.finditer(tag.get("style") or ""):
            raw = match.group(1).strip()
            if raw and not raw.startswith("data:"):
                add_media(resolve(raw), "image", "css background")

    for tag in soup.find_all(["video", "audio"]):
        src = tag.get("src") or ""
        if not src:
            source = tag.find("source", src=True)
            if source:
                src = source["src"]
        if src:
            add_media(resolve(src), tag.name)
        poster = tag.get("poster")
        if poster:
            add_media(resolve(poster), "image", "poster")

    # Forms (including password / username fields)
    forms: list[dict[str, Any]] = []
    for form in soup.find_all("form"):
        fields: list[dict[str, Any]] = []
        for field in form.find_all(["input", "textarea", "select"]):
            ftype = (field.get("type") or field.name or "text").lower()
            fields.append(
                {
                    "name": field.get("name") or field.get("id") or "",
                    "type": ftype,
                    "value": field.get("value") or "",
                    "placeholder": field.get("placeholder") or "",
                    "hidden": ftype == "hidden",
                }
            )
        forms.append(
            {
                "action": resolve(form.get("action") or url),
                "method": (form.get("method") or "GET").upper(),
                "fields": fields,
            }
        )

    # Visible text
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    body_text = soup.get_text(" ", strip=True)
    body_text = re.sub(r"\s+", " ", body_text)[:MAX_TEXT_CHARS]

    emails = unique(EMAIL_RE.findall(html))[:300]
    phones = unique(
        [p for p in PHONE_RE.findall(body_text) if len(re.sub(r"\D", "", p)) >= 10]
    )[:100]

    # Auth-related fields from forms
    usernames: list[str] = []
    passwords: list[str] = []
    credentials: list[dict[str, str]] = []
    user_keys = re.compile(r"^(user(name)?|login|account|email|e-?mail)$", re.I)
    pass_keys = re.compile(r"^(pass(word)?|passwd|pwd)$", re.I)
    for form in forms:
        for f in form["fields"]:
            name = f["name"]
            ftype = f["type"]
            value = f["value"]
            kind = ""
            if ftype == "password" or pass_keys.match(name):
                kind = "password"
                if value:
                    passwords.append(value)
            elif ftype == "email" or user_keys.match(name):
                kind = "username" if "mail" not in name.lower() else "email"
                if value and kind == "username":
                    usernames.append(value)
            if kind:
                credentials.append(
                    {
                        "kind": kind,
                        "name": name or ftype,
                        "value": value,
                        "source": f"form {form['method']} {form['action']}",
                    }
                )

    return {
        "ok": True,
        "requestedUrl": url,
        "finalUrl": resp.url,
        "status": resp.status_code,
        "title": title,
        "description": description,
        "emails": emails,
        "phones": phones,
        "usernames": unique(usernames),
        "passwords": unique(passwords),
        "credentials": credentials[:200],
        "links": links[:2500],
        "media": media[:600],
        "forms": forms[:80],
        "meta": meta[:400],
        "text": body_text,
        "wordCount": len(body_text.split()) if body_text else 0,
        "bytes": len(resp.content),
        "parser": "beautifulsoup4+lxml",
        "fetcher": "requests",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="VOIDSCAN Python scraper (requests + BeautifulSoup)")
    parser.add_argument("url", help="URL to scrape")
    parser.add_argument("--json", metavar="FILE", help="Write full JSON result to file")
    parser.add_argument("--ua", metavar="UA", help="Custom User-Agent")
    args = parser.parse_args()

    try:
        result = scrape(args.url, user_agent=args.ua)
    except requests.RequestException as exc:
        print(json.dumps({"ok": False, "error": str(exc), "requestedUrl": args.url}, indent=2))
        sys.exit(1)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"Wrote {args.json}")

    # Summary to stdout
    print(f"Title:     {result['title']}")
    print(f"Status:    {result['status']}")
    print(f"Final URL: {result['finalUrl']}")
    print(f"Emails:    {len(result['emails'])}")
    print(f"Phones:    {len(result['phones'])}")
    print(f"Usernames: {len(result['usernames'])}")
    print(f"Passwords: {len(result['passwords'])}")
    print(f"Links:     {len(result['links'])}")
    print(f"Media:     {len(result['media'])}")
    print(f"Forms:     {len(result['forms'])}")
    if result["emails"]:
        print("\nEmails:")
        for e in result["emails"][:20]:
            print(f"  - {e}")
    if result["media"]:
        print("\nMedia (first 10):")
        for m in result["media"][:10]:
            print(f"  - [{m['type']}] {m['src']}")


if __name__ == "__main__":
    main()
