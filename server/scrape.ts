import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import type {
  ExtractedForm,
  ExtractedHeading,
  ExtractedLink,
  ExtractedMedia,
  ExtractedMeta,
  ExtractedScript,
  ExtractedTable,
  HeaderPair,
  RedirectHop,
  ScrapeInput,
  ScrapeResponse,
  ScrapeResult,
  TechHint,
} from "../src/lib/types.js";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_RAW_CHARS = 350_000;
const MAX_TEXT_CHARS = 120_000;
const MAX_REDIRECTS = 6;
const FETCH_MS = 18_000;
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const BLOCKED_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-connection",
]);

const SOCIAL_HOSTS = [
  "twitter.com",
  "x.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "tiktok.com",
  "reddit.com",
  "github.com",
  "threads.net",
  "pinterest.com",
  "snapchat.com",
  "discord.gg",
  "discord.com",
  "t.me",
  "telegram.me",
  "wa.me",
  "whatsapp.com",
  "mastodon.social",
  "bsky.app",
  "vk.com",
  "weibo.com",
];

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v.includes(".")) {
    const mapped = v.startsWith("::ffff:") ? v.slice(7) : v;
    return isPrivateIPv4(mapped);
  }
  if (v === "::1" || v === "::" || v === "0:0:0:0:0:0:0:1") return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("fe80")) return true;
  if (v.startsWith("ff")) return true;
  return false;
}

function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".lan") ||
    h === "metadata.google.internal" ||
    h === "metadata" ||
    h.endsWith(".home.arpa")
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be fetched.");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are blocked.");
  }
  if (blockedHost(url.hostname)) throw new Error("That host is blocked.");
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
    if (isPrivateIp(url.hostname)) throw new Error("Private and loopback addresses are blocked.");
    return url;
  }
  let records: { address: string }[];
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`Could not resolve ${url.hostname}.`);
  }
  if (!records.length) throw new Error(`Could not resolve ${url.hostname}.`);
  if (records.some((r) => isPrivateIp(r.address))) {
    throw new Error("That host resolves to a private address.");
  }
  return url;
}

function headerList(headers: Headers): HeaderPair[] {
  const out: HeaderPair[] = [];
  headers.forEach((value, name) => out.push({ name, value }));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function absUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function classifyLink(pageUrl: string, href: string): ExtractedLink["kind"] {
  if (!href || href.startsWith("javascript:") || href.startsWith("data:")) return "other";
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return "other";
  try {
    const a = new URL(href, pageUrl);
    const b = new URL(pageUrl);
    if (a.hash && a.pathname === b.pathname && a.host === b.host && !a.search) return "anchor";
    return a.host === b.host ? "internal" : "external";
  } catch {
    return "other";
  }
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = item.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

function textOf($el: { text: () => string }): string {
  return $el.text().replace(/\s+/g, " ").trim();
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24}/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{3,4})?/g;

function extractEmails(hay: string): string[] {
  return unique((hay.match(EMAIL_RE) ?? []).filter((e) => !e.endsWith(".png") && !e.endsWith(".jpg")));
}

function extractPhones(hay: string): string[] {
  return unique(
    (hay.match(PHONE_RE) ?? []).filter((p) => p.replace(/\D/g, "").length >= 10).slice(0, 200),
  );
}

function isSocial(href: string): boolean {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "").toLowerCase();
    return SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

function detectTech(html: string, $: ReturnType<typeof cheerio.load>, generator: string): TechHint[] {
  const hints: TechHint[] = [];
  const add = (name: string, evidence: string) => {
    if (!hints.some((h) => h.name === name)) hints.push({ name, evidence });
  };
  if (generator) add(generator, "meta generator");
  if (html.includes("wp-content") || html.includes("wp-includes")) add("WordPress", "wp-content");
  if (html.includes("__NEXT_DATA__") || $("script#__NEXT_DATA__").length) add("Next.js", "__NEXT_DATA__");
  if (html.includes("window.__NUXT__") || html.includes("__NUXT__")) add("Nuxt", "__NUXT__");
  if (html.includes("cdn.shopify.com")) add("Shopify", "cdn.shopify.com");
  if (html.includes("squarespace.com") || html.includes("static1.squarespace")) add("Squarespace", "squarespace");
  if (html.includes("static.wixstatic.com")) add("Wix", "wixstatic");
  if (html.includes("gtag(") || html.includes("googletagmanager.com")) add("Google Analytics", "gtag / GTM");
  if (html.includes("cdn-cgi/") || html.includes("cloudflare")) add("Cloudflare", "cdn-cgi");
  if ($('script[src*="react"]').length || html.includes("data-reactroot")) add("React", "react markers");
  if (html.includes("webpackChunk") || html.includes("__webpack_")) add("Webpack", "webpack chunk");
  if ($('meta[name="viewport"]').length) add("Responsive", "viewport meta");
  if ($('script[src*="jquery"]').length) add("jQuery", "jquery script");
  if (html.includes("csrf-token") || $('meta[name="csrf-token"]').length) add("CSRF token", "csrf-token meta");
  return hints;
}

function kindFromContentType(ct: string, body: string): ScrapeResult["kind"] {
  const c = ct.toLowerCase();
  if (c.includes("application/json") || c.includes("+json")) return "json";
  if (c.includes("xml") || c.includes("rss") || c.includes("atom")) return "xml";
  if (c.includes("text/html") || c.includes("xhtml")) return "html";
  if (c.startsWith("text/")) return "text";
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (
    trimmed.startsWith("<!DOCTYPE html") ||
    trimmed.startsWith("<html") ||
    /<html[\s>]/i.test(trimmed.slice(0, 400))
  ) {
    return "html";
  }
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<rss") || trimmed.startsWith("<feed"))
    return "xml";
  if (
    c.includes("octet-stream") ||
    c.startsWith("image/") ||
    c.startsWith("audio/") ||
    c.startsWith("video/") ||
    c.includes("pdf")
  ) {
    return "binary";
  }
  return body.trim() ? "text" : "binary";
}

async function readLimited(res: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const lenHeader = res.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BYTES) {
    throw new Error(`Response is ${lenHeader} bytes — over the ${MAX_BYTES} byte cap.`);
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return { bytes: buf.slice(0, MAX_BYTES), truncated: true };
    return { bytes: buf, truncated: false };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > MAX_BYTES) {
      const room = MAX_BYTES - total;
      if (room > 0) chunks.push(value.slice(0, room));
      total = MAX_BYTES;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes: out, truncated };
}

function decodeBody(bytes: Uint8Array, contentType: string): { text: string; charset: string } {
  const m = /charset=([^;]+)/i.exec(contentType);
  const charset = (m?.[1] ?? "utf-8").trim().replace(/["']/g, "");
  try {
    return { text: new TextDecoder(charset, { fatal: false }).decode(bytes), charset };
  } catch {
    return { text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), charset: "utf-8" };
  }
}

function emptyExtract(): Pick<
  ScrapeResult,
  | "title"
  | "description"
  | "canonical"
  | "language"
  | "robots"
  | "generator"
  | "favicon"
  | "baseHref"
  | "meta"
  | "openGraph"
  | "twitter"
  | "jsonLd"
  | "headings"
  | "paragraphs"
  | "text"
  | "wordCount"
  | "links"
  | "media"
  | "forms"
  | "tables"
  | "scripts"
  | "stylesheets"
  | "comments"
  | "emails"
  | "phones"
  | "social"
  | "feeds"
  | "tech"
  | "raw"
  | "truncatedRaw"
> {
  return {
    title: "",
    description: "",
    canonical: "",
    language: "",
    robots: "",
    generator: "",
    favicon: "",
    baseHref: "",
    meta: [],
    openGraph: [],
    twitter: [],
    jsonLd: [],
    headings: [],
    paragraphs: [],
    text: "",
    wordCount: 0,
    links: [],
    media: [],
    forms: [],
    tables: [],
    scripts: [],
    stylesheets: [],
    comments: [],
    emails: [],
    phones: [],
    social: [],
    feeds: [],
    tech: [],
    raw: "",
    truncatedRaw: false,
  };
}

function emptyHtmlResult(
  base: Omit<ScrapeResult, keyof ReturnType<typeof emptyExtract> | "ok"> &
    Partial<ReturnType<typeof emptyExtract>>,
): ScrapeResult {
  return { ok: true, ...emptyExtract(), ...base };
}

function parseDocument(html: string, pageUrl: string, xml: boolean): Partial<ScrapeResult> {
  const $ = cheerio.load(html, xml ? { xml: true } : undefined);
  const baseHref = $("base[href]").first().attr("href")?.trim() || pageUrl;
  const resolve = (href: string) => absUrl(baseHref, href);

  const title = ($("title").first().text() || $('meta[property="og:title"]').attr("content") || "").trim();
  const description = (
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    ""
  ).trim();
  const canonical = resolve($('link[rel="canonical"]').attr("href") || "");
  const language = ($("html").attr("lang") || $('meta[http-equiv="content-language"]').attr("content") || "").trim();
  const robots = ($('meta[name="robots"]').attr("content") || "").trim();
  const generator = ($('meta[name="generator"]').attr("content") || "").trim();
  const iconHref =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    "/favicon.ico";
  const favicon = resolve(iconHref);

  const meta: ExtractedMeta[] = [];
  $("meta").each((_, el) => {
    const n = $(el);
    meta.push({
      name: n.attr("name") || "",
      content: n.attr("content") || n.attr("value") || "",
      property: n.attr("property") || "",
      httpEquiv: n.attr("http-equiv") || "",
      charset: n.attr("charset") || "",
    });
  });

  const openGraph: HeaderPair[] = [];
  const twitter: HeaderPair[] = [];
  for (const m of meta) {
    if (m.property.startsWith("og:") || m.name.startsWith("og:"))
      openGraph.push({ name: m.property || m.name, value: m.content });
    if (m.name.startsWith("twitter:") || m.property.startsWith("twitter:"))
      twitter.push({ name: m.name || m.property, value: m.content });
  }

  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      jsonLd.push(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      jsonLd.push(raw);
    }
  });

  const headings: ExtractedHeading[] = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const tag = (el as { tagName?: string }).tagName || "";
    const level = Number(String(tag).replace(/[^0-9]/g, "")) || 1;
    const text = textOf($(el));
    if (text) headings.push({ level, text: clip(text, 500) });
  });

  const paragraphs: string[] = [];
  $("p").each((_, el) => {
    const t = textOf($(el));
    if (t) paragraphs.push(clip(t, 2000));
  });

  $("script,style,noscript").remove();
  const text = clip(textOf($("body").length ? $("body") : $.root()), MAX_TEXT_CHARS);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const $full = cheerio.load(html, xml ? { xml: true } : undefined);

  const links: ExtractedLink[] = [];
  $full("a[href]").each((_, el) => {
    const n = $full(el);
    const hrefRaw = n.attr("href") || "";
    const href =
      hrefRaw.startsWith("#") ||
      hrefRaw.startsWith("mailto:") ||
      hrefRaw.startsWith("tel:") ||
      hrefRaw.startsWith("javascript:")
        ? hrefRaw
        : resolve(hrefRaw);
    links.push({
      href,
      text: clip(textOf(n), 240),
      rel: n.attr("rel") || "",
      target: n.attr("target") || "",
      kind: classifyLink(pageUrl, href),
    });
  });

  const media: ExtractedMedia[] = [];
  $full("img").each((_, el) => {
    const n = $full(el);
    const src = n.attr("src") || n.attr("data-src") || n.attr("data-lazy-src") || "";
    if (!src) return;
    media.push({
      src: src.startsWith("data:") ? clip(src, 120) : resolve(src),
      alt: n.attr("alt") || "",
      type: "image",
      width: n.attr("width") || "",
      height: n.attr("height") || "",
      poster: "",
    });
  });
  $full("video,audio").each((_, el) => {
    const n = $full(el);
    const tag = String((el as { tagName?: string }).tagName || "video").toLowerCase();
    const src = n.attr("src") || n.find("source").first().attr("src") || "";
    media.push({
      src: src ? resolve(src) : "",
      alt: n.attr("aria-label") || "",
      type: tag === "audio" ? "audio" : "video",
      width: n.attr("width") || "",
      height: n.attr("height") || "",
      poster: n.attr("poster") ? resolve(n.attr("poster") || "") : "",
    });
  });
  $full("iframe[src]").each((_, el) => {
    const n = $full(el);
    media.push({
      src: resolve(n.attr("src") || ""),
      alt: n.attr("title") || n.attr("aria-label") || "",
      type: "iframe",
      width: n.attr("width") || "",
      height: n.attr("height") || "",
      poster: "",
    });
  });

  const forms: ExtractedForm[] = [];
  $full("form").each((_, el) => {
    const n = $full(el);
    const fields: ExtractedForm["fields"] = [];
    n.find("input,textarea,select,button[name]").each((__, fel) => {
      const f = $full(fel);
      const type = (f.attr("type") || (fel as { tagName?: string }).tagName || "text").toLowerCase();
      fields.push({
        name: f.attr("name") || f.attr("id") || "",
        type,
        value: f.attr("value") || "",
        required: f.is("[required]"),
        hidden: type === "hidden",
        placeholder: f.attr("placeholder") || "",
      });
    });
    forms.push({
      action: n.attr("action") ? resolve(n.attr("action") || "") : pageUrl,
      method: (n.attr("method") || "GET").toUpperCase(),
      enctype: n.attr("enctype") || "",
      id: n.attr("id") || "",
      name: n.attr("name") || "",
      fields,
    });
  });

  const tables: ExtractedTable[] = [];
  $full("table").each((_, el) => {
    if (tables.length >= 40) return;
    const n = $full(el);
    const headers: string[] = [];
    n.find("thead th, tr:first-child th").each((__, th) => {
      headers.push(clip(textOf($full(th)), 200));
    });
    const rows: string[][] = [];
    n.find("tr").each((__, tr) => {
      const cells: string[] = [];
      $full(tr)
        .find("td")
        .each((___, td) => {
          cells.push(clip(textOf($full(td)), 300));
        });
      if (cells.length) rows.push(cells);
    });
    tables.push({
      caption: clip(textOf(n.find("caption").first()), 200),
      headers,
      rows: rows.slice(0, 80),
    });
  });

  const scripts: ExtractedScript[] = [];
  $full("script").each((_, el) => {
    const n = $full(el);
    const src = n.attr("src") || "";
    scripts.push({
      src: src ? resolve(src) : "",
      type: n.attr("type") || "",
      async: n.is("[async]"),
      defer: n.is("[defer]"),
      inline: src ? "" : clip(n.html() || n.text() || "", 4000),
    });
  });

  const stylesheets = unique(
    $full('link[rel="stylesheet"]')
      .map((_, el) => resolve($full(el).attr("href") || ""))
      .get()
      .filter(Boolean),
  );

  const comments: string[] = [];
  const commentRe = /<!--([\s\S]*?)-->/g;
  let cm: RegExpExecArray | null;
  while ((cm = commentRe.exec(html)) && comments.length < 200) {
    const c = cm[1]?.trim() ?? "";
    if (c) comments.push(clip(c, 1500));
  }

  const feeds = unique(
    $full('link[rel="alternate"]')
      .map((_, el) => {
        const type = ($full(el).attr("type") || "").toLowerCase();
        if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
          return resolve($full(el).attr("href") || "");
        }
        return "";
      })
      .get()
      .filter(Boolean),
  );

  const hay = `${html}\n${text}`;
  const emails = extractEmails(hay).slice(0, 300);
  const phones = extractPhones(text).slice(0, 100);
  const social = links.filter((l) => isSocial(l.href));
  const tech = detectTech(html, $full, generator);

  return {
    title,
    description,
    canonical,
    language,
    robots,
    generator,
    favicon,
    baseHref,
    meta: meta.slice(0, 400),
    openGraph,
    twitter,
    jsonLd: jsonLd.slice(0, 40),
    headings: headings.slice(0, 400),
    paragraphs: paragraphs.slice(0, 400),
    text,
    wordCount,
    links: links.slice(0, 2500),
    media: media.slice(0, 600),
    forms: forms.slice(0, 80),
    tables,
    scripts: scripts.slice(0, 400),
    stylesheets: stylesheets.slice(0, 200),
    comments,
    emails,
    phones,
    social: social.slice(0, 200),
    feeds,
    tech,
  };
}

export async function scrapePage(input: ScrapeInput): Promise<ScrapeResponse> {
  const requestedUrl = input.url.trim();
  try {
    let current = await assertPublicUrl(requestedUrl);
    const ua = input.userAgent?.trim() || DEFAULT_UA;
    const headers = new Headers({
      "User-Agent": ua,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    });
    for (const h of input.extraHeaders ?? []) {
      const name = h.name.trim();
      if (!name || BLOCKED_HEADER_NAMES.has(name.toLowerCase())) continue;
      headers.set(name, h.value);
    }

    const redirectChain: RedirectHop[] = [];
    const started = Date.now();
    let res: Response | null = null;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), FETCH_MS);
      try {
        res = await fetch(current.href, {
          method: "GET",
          headers,
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(t);
        if (err instanceof Error && err.name === "AbortError") throw new Error("Fetch timed out.");
        throw new Error(err instanceof Error ? err.message : "Fetch failed.");
      } finally {
        clearTimeout(t);
      }

      const loc = res.headers.get("location");
      const isRedirect = res.status >= 300 && res.status < 400 && loc;
      redirectChain.push({ url: current.href, status: res.status });
      if (!isRedirect) break;
      if (i === MAX_REDIRECTS) throw new Error("Too many redirects.");
      current = await assertPublicUrl(new URL(loc!, current.href).href);
    }

    if (!res) throw new Error("No response.");

    const contentType = res.headers.get("content-type") || "";
    const { bytes, truncated } = await readLimited(res);
    const { text, charset } = decodeBody(bytes, contentType);
    const kind = kindFromContentType(contentType, text);
    const timingMs = Date.now() - started;
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];

    const base = {
      requestedUrl,
      finalUrl: res.url || current.href,
      kind,
      status: res.status,
      statusText: res.statusText,
      contentType,
      charset,
      bytes: bytes.byteLength,
      truncatedDownload: truncated,
      timingMs,
      fetchedAt: new Date().toISOString(),
      redirectChain,
      headers: headerList(res.headers),
      setCookies,
    };

    if (kind === "binary") {
      return emptyHtmlResult({
        ...base,
        raw: "",
        truncatedRaw: false,
        title: contentType || "binary",
        description: "Non-text response — headers only.",
      });
    }

    if (kind === "json") {
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        pretty = text;
      }
      const raw = clip(pretty, MAX_RAW_CHARS);
      return emptyHtmlResult({
        ...base,
        title: "JSON",
        jsonLd: [pretty],
        text: clip(pretty, MAX_TEXT_CHARS),
        wordCount: pretty.split(/\s+/).filter(Boolean).length,
        emails: extractEmails(pretty),
        raw,
        truncatedRaw: pretty.length > MAX_RAW_CHARS,
      });
    }

    if (kind === "text") {
      const raw = clip(text, MAX_RAW_CHARS);
      return emptyHtmlResult({
        ...base,
        title: "Text",
        text: clip(text, MAX_TEXT_CHARS),
        wordCount: text.split(/\s+/).filter(Boolean).length,
        emails: extractEmails(text),
        phones: extractPhones(text),
        raw,
        truncatedRaw: text.length > MAX_RAW_CHARS,
      });
    }

    const extracted = parseDocument(text, base.finalUrl, kind === "xml");
    const raw = clip(text, MAX_RAW_CHARS);
    return {
      ok: true,
      ...base,
      title: extracted.title || "",
      description: extracted.description || "",
      canonical: extracted.canonical || "",
      language: extracted.language || "",
      robots: extracted.robots || "",
      generator: extracted.generator || "",
      favicon: extracted.favicon || "",
      baseHref: extracted.baseHref || "",
      meta: extracted.meta || [],
      openGraph: extracted.openGraph || [],
      twitter: extracted.twitter || [],
      jsonLd: extracted.jsonLd || [],
      headings: extracted.headings || [],
      paragraphs: extracted.paragraphs || [],
      text: extracted.text || "",
      wordCount: extracted.wordCount || 0,
      links: extracted.links || [],
      media: extracted.media || [],
      forms: extracted.forms || [],
      tables: extracted.tables || [],
      scripts: extracted.scripts || [],
      stylesheets: extracted.stylesheets || [],
      comments: extracted.comments || [],
      emails: extracted.emails || [],
      phones: extracted.phones || [],
      social: extracted.social || [],
      feeds: extracted.feeds || [],
      tech: extracted.tech || [],
      raw,
      truncatedRaw: text.length > MAX_RAW_CHARS,
    };
  } catch (err) {
    return {
      ok: false,
      requestedUrl,
      error: err instanceof Error ? err.message : "Scrape failed.",
    };
  }
}
