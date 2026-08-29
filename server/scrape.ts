import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import type {
  ExtractedForm,
  ExtractedLink,
  ExtractedMedia,
  ExtractedMeta,
  HeaderPair,
  RedirectHop,
  ScrapeInput,
  ScrapeResponse,
  ScrapeResult,
} from "../src/lib/types.js";
import { extractAuthFromPage } from "./auth-extract.js";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_RAW_CHARS = 500_000;
const MAX_TEXT_CHARS = 150_000;
const MAX_REDIRECTS = 6;
const FETCH_MS = 18_000;
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const BLOCKED_HEADER_NAMES = new Set([
  "host", "content-length", "transfer-encoding", "connection", "keep-alive",
  "upgrade", "te", "trailer", "proxy-authorization", "proxy-connection",
]);

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v.includes(".")) return isPrivateIPv4(v.startsWith("::ffff:") ? v.slice(7) : v);
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
  return false;
}

function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal";
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("That is not a valid URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs can be fetched.");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are blocked.");
  if (blockedHost(url.hostname)) throw new Error("That host is blocked.");
  if (isIP(url.hostname.replace(/^\[|\]$/g, ""))) {
    if (isPrivateIp(url.hostname)) throw new Error("Private and loopback addresses are blocked.");
    return url;
  }
  const records = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => {
    throw new Error(`Could not resolve ${url.hostname}.`);
  });
  if (!records.length) throw new Error(`Could not resolve ${url.hostname}.`);
  if (records.some((r) => isPrivateIp(r.address))) throw new Error("That host resolves to a private address.");
  return url;
}

function absUrl(base: string, href: string): string {
  try { return new URL(href, base).href; } catch { return href; }
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
const PHONE_RE = /(?:\+\d{1,3}[\s.\-]*)?(?:\(?\d{2,4}\)?[\s.\-]*)?\d{2,4}[\s.\-]+\d{2,4}(?:[\s.\-]+\d{2,4})?/g;
const BG_IMAGE_RE = /background(?:-image)?\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/gi;

function extractEmails(hay: string): string[] {
  return unique((hay.match(EMAIL_RE) ?? []).filter((e) => !/\.(png|jpg|gif|svg|webp)$/i.test(e))).slice(0, 300);
}

function extractPhones(hay: string): string[] {
  return unique((hay.match(PHONE_RE) ?? []).filter((p) => p.replace(/\D/g, "").length >= 10)).slice(0, 100);
}

function emptyResult(partial: Partial<ScrapeResult> & Pick<ScrapeResult, "requestedUrl" | "finalUrl" | "kind" | "status" | "statusText" | "contentType" | "charset" | "bytes" | "truncatedDownload" | "timingMs" | "fetchedAt" | "redirectChain" | "headers" | "setCookies">): ScrapeResult {
  return {
    ok: true,
    title: "", description: "", canonical: "", language: "", robots: "", generator: "", favicon: "", baseHref: "",
    meta: [], openGraph: [], twitter: [], jsonLd: [], headings: [], paragraphs: [], text: "", wordCount: 0,
    links: [], media: [], forms: [], tables: [], scripts: [], stylesheets: [], comments: [],
    emails: [], phones: [], usernames: [], passwords: [], credentials: [], social: [], feeds: [], tech: [],
    raw: "", truncatedRaw: false,
    ...partial,
  };
}

async function fetchOnce(url: URL, headers: Headers): Promise<{ res: Response; redirectChain: RedirectHop[]; finalUrl: string }> {
  const redirectChain: RedirectHop[] = [];
  let current = url;
  let res: Response | null = null;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_MS);
    try {
      res = await fetch(current.href, { method: "GET", headers, redirect: "manual", signal: controller.signal });
    } catch (err) {
      clearTimeout(t);
      if (err instanceof Error && err.name === "AbortError") throw new Error("Fetch timed out.");
      throw new Error(err instanceof Error ? err.message : "Fetch failed.");
    } finally { clearTimeout(t); }
    const loc = res.headers.get("location");
    const isRedirect = res.status >= 300 && res.status < 400 && loc;
    redirectChain.push({ url: current.href, status: res.status });
    if (!isRedirect) break;
    if (i === MAX_REDIRECTS) throw new Error("Too many redirects.");
    current = await assertPublicUrl(new URL(loc!, current.href).href);
  }
  if (!res) throw new Error("No response.");
  return { res, redirectChain, finalUrl: res.url || current.href };
}

export async function scrapePage(input: ScrapeInput): Promise<ScrapeResponse> {
  const requestedUrl = input.url.trim();
  try {
    const current = await assertPublicUrl(requestedUrl);
    const ua = input.userAgent?.trim() || DEFAULT_UA;
    const headers = new Headers({
      "User-Agent": ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
    });
    for (const h of input.extraHeaders ?? []) {
      const name = h.name.trim();
      if (!name || BLOCKED_HEADER_NAMES.has(name.toLowerCase())) continue;
      headers.set(name, h.value);
    }

    const started = Date.now();
    const { res, redirectChain, finalUrl } = await fetchOnce(current, headers);
    const contentType = res.headers.get("content-type") || "";
    const buf = new Uint8Array(await res.arrayBuffer());
    const truncated = buf.byteLength > MAX_BYTES;
    const bytes = truncated ? buf.slice(0, MAX_BYTES) : buf;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const timingMs = Date.now() - started;
    const headerPairs: HeaderPair[] = [];
    res.headers.forEach((value, name) => headerPairs.push({ name, value }));

    const base = {
      requestedUrl,
      finalUrl,
      kind: "html" as const,
      status: res.status,
      statusText: res.statusText,
      contentType,
      charset: "utf-8",
      bytes: bytes.byteLength,
      truncatedDownload: truncated,
      timingMs,
      fetchedAt: new Date().toISOString(),
      redirectChain,
      headers: headerPairs.sort((a, b) => a.name.localeCompare(b.name)),
      setCookies: typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [],
    };

    // Cheerio = BeautifulSoup for Node — parse full HTML document
    const $ = cheerio.load(text, { xml: false });
    const baseHref = $("base[href]").first().attr("href")?.trim() || finalUrl;
    const resolve = (href: string) => absUrl(baseHref, href);

    const title = ($("title").first().text() || $('meta[property="og:title"]').attr("content") || "").trim();
    const description = ($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "").trim();
    const canonical = ($('link[rel="canonical"]').attr("href") || "").trim();
    const language = ($("html").attr("lang") || "").trim();
    const robots = ($('meta[name="robots"]').attr("content") || "").trim();
    const generator = ($('meta[name="generator"]').attr("content") || "").trim();
    const favicon =
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      "";

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
      if (m.property.startsWith("og:") || m.name.startsWith("og:")) openGraph.push({ name: m.property || m.name, value: m.content });
      if (m.name.startsWith("twitter:") || m.property.startsWith("twitter:")) twitter.push({ name: m.name || m.property, value: m.content });
    }

    const jsonLd: unknown[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).html() || "";
      try {
        jsonLd.push(JSON.parse(raw));
      } catch {
        jsonLd.push({ raw: clip(raw, 2000) });
      }
    });

    const links: ExtractedLink[] = [];
    $("a[href]").each((_, el) => {
      const n = $(el);
      const hrefRaw = (n.attr("href") || "").trim();
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
        kind: "other",
      });
    });

    const media: ExtractedMedia[] = [];
    const seen = new Set<string>();
    const pushMedia = (src: string, alt: string, type: ExtractedMedia["type"]) => {
      if (!src || src.startsWith("data:") || seen.has(src)) return;
      seen.add(src);
      media.push({ src, alt, type, width: "", height: "", poster: "" });
    };

    $("img").each((_, el) => {
      const n = $(el);
      const src = n.attr("src") || n.attr("data-src") || n.attr("data-lazy-src") || "";
      if (src) pushMedia(resolve(src), n.attr("alt") || "", "image");
      const srcset = n.attr("srcset") || n.attr("data-srcset") || "";
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (u) pushMedia(resolve(u), n.attr("alt") || "srcset", "image");
      }
    });

    for (const m of meta) {
      const prop = (m.property || m.name).toLowerCase();
      if (["og:image", "twitter:image", "twitter:image:src", "og:image:url"].includes(prop) && m.content) {
        pushMedia(resolve(m.content), prop, "image");
      }
      if (["og:video", "og:video:url", "twitter:player:stream"].includes(prop) && m.content) {
        pushMedia(resolve(m.content), prop, "video");
      }
    }

    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      let m: RegExpExecArray | null;
      BG_IMAGE_RE.lastIndex = 0;
      while ((m = BG_IMAGE_RE.exec(style))) {
        const raw = (m[1] || "").trim();
        if (raw && !raw.startsWith("data:")) pushMedia(resolve(raw), "css background", "image");
      }
    });

    $("video,audio").each((_, el) => {
      const n = $(el);
      const tag = String((el as { tagName?: string }).tagName || "video").toLowerCase();
      const src = n.attr("src") || n.find("source").first().attr("src") || "";
      if (src) pushMedia(resolve(src), "", tag === "audio" ? "audio" : "video");
      n.find("source[src]").each((__, s) => {
        const ss = $(s).attr("src");
        if (ss) pushMedia(resolve(ss), "source", tag === "audio" ? "audio" : "video");
      });
      const poster = n.attr("poster");
      if (poster) pushMedia(resolve(poster), "poster", "image");
    });

    $("iframe[src],embed[src],object[data]").each((_, el) => {
      const n = $(el);
      const src = n.attr("src") || n.attr("data") || "";
      if (src) pushMedia(resolve(src), n.attr("title") || "embed", "iframe");
    });

    const forms: ExtractedForm[] = [];
    $("form").each((_, el) => {
      const n = $(el);
      const fields: ExtractedForm["fields"] = [];
      n.find("input,textarea,select,button[name]").each((__, fel) => {
        const f = $(fel);
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
        action: n.attr("action") ? resolve(n.attr("action") || "") : finalUrl,
        method: (n.attr("method") || "GET").toUpperCase(),
        enctype: n.attr("enctype") || "",
        id: n.attr("id") || "",
        name: n.attr("name") || "",
        fields,
      });
    });

    const headings: { level: number; text: string }[] = [];
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      const tag = String((el as { tagName?: string }).tagName || "h1").toLowerCase();
      const level = Number(tag.replace("h", "")) || 1;
      const t = textOf($(el));
      if (t) headings.push({ level, text: clip(t, 300) });
    });

    const paragraphs: string[] = [];
    $("p").each((_, el) => {
      const t = textOf($(el));
      if (t) paragraphs.push(clip(t, 500));
    });

    const tables: { headers: string[]; rows: string[][] }[] = [];
    $("table").each((_, el) => {
      const n = $(el);
      const headers: string[] = [];
      n.find("thead th, tr:first-child th").each((__, th) => {
        headers.push(clip(textOf($(th)), 120));
      });
      const rows: string[][] = [];
      n.find("tbody tr, tr").each((__, tr) => {
        const cells: string[] = [];
        $(tr).find("td,th").each((___, td) => {
          cells.push(clip(textOf($(td)), 200));
        });
        if (cells.length) rows.push(cells);
      });
      if (headers.length || rows.length) tables.push({ headers, rows: rows.slice(0, 50) });
    });

    const scripts: { src: string; type: string; inline: string }[] = [];
    $("script").each((_, el) => {
      const n = $(el);
      const src = n.attr("src") ? resolve(n.attr("src") || "") : "";
      const type = n.attr("type") || "";
      const inline = src ? "" : clip((n.html() || "").replace(/\s+/g, " "), 400);
      scripts.push({ src, type, inline });
    });

    const stylesheets: string[] = [];
    $('link[rel="stylesheet"][href]').each((_, el) => {
      stylesheets.push(resolve($(el).attr("href") || ""));
    });
    $("style").each((_, el) => {
      const css = clip(($(el).html() || "").replace(/\s+/g, " "), 300);
      if (css) stylesheets.push(`[inline] ${css}`);
    });

    const comments: string[] = [];
    $("*").contents().each((_, node) => {
      if (node.type === "comment") {
        const c = String((node as { data?: string }).data || "").trim();
        if (c) comments.push(clip(c, 400));
      }
    });

    const feeds: string[] = [];
    $('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) feeds.push(resolve(href));
    });

    const $text = cheerio.load(text);
    $text("script,style,noscript").remove();
    const bodyText = clip(
      textOf($text("body").length ? $text("body") : $text.root()),
      MAX_TEXT_CHARS,
    );

    const hay = text + "\n" + bodyText;
    const emails = extractEmails(hay);
    const phones = extractPhones(bodyText);
    const auth = extractAuthFromPage(forms, text);

    const tech: string[] = [];
    if (generator) tech.push(generator);
    if (text.includes("wp-content")) tech.push("WordPress");
    if (text.includes("cdn.shopify.com")) tech.push("Shopify");
    if (text.includes("__NEXT_DATA__")) tech.push("Next.js");
    if (text.includes("react")) tech.push("React");

    return emptyResult({
      ...base,
      title,
      description,
      canonical: canonical ? resolve(canonical) : "",
      language,
      robots,
      generator,
      favicon: favicon ? resolve(favicon) : "",
      baseHref,
      meta: meta.slice(0, 500),
      openGraph,
      twitter,
      jsonLd: jsonLd.slice(0, 40),
      headings: headings.slice(0, 200),
      paragraphs: paragraphs.slice(0, 200),
      text: bodyText,
      wordCount: bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0,
      links: links.slice(0, 3000),
      media: media.slice(0, 800),
      forms: forms.slice(0, 100),
      tables: tables.slice(0, 40),
      scripts: scripts.slice(0, 200),
      stylesheets: stylesheets.slice(0, 100),
      comments: comments.slice(0, 100),
      emails,
      phones,
      usernames: auth.usernames,
      passwords: auth.passwords,
      credentials: auth.credentials,
      feeds: unique(feeds).slice(0, 40),
      tech: unique(tech),
      raw: clip(text, MAX_RAW_CHARS),
      truncatedRaw: text.length > MAX_RAW_CHARS,
    });
  } catch (err) {
    return {
      ok: false,
      requestedUrl,
      error: err instanceof Error ? err.message : "Scrape failed.",
    };
  }
}
