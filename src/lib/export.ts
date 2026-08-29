import type { ScrapeResult } from "./types";
import { slugFromUrl } from "./utils";

export function resultToMarkdown(r: ScrapeResult): string {
  const lines: string[] = [];
  lines.push(`# VOIDSCAN report`, "");
  lines.push(`- URL: ${r.finalUrl}`);
  lines.push(`- Requested: ${r.requestedUrl}`);
  lines.push(`- Status: ${r.status} ${r.statusText}`);
  lines.push(`- Type: ${r.contentType}`);
  lines.push(`- Bytes: ${r.bytes}`);
  lines.push(`- Time: ${r.timingMs} ms`);
  lines.push(`- Fetched: ${r.fetchedAt}`, "");
  if (r.title) lines.push(`## ${r.title}`, "");
  if (r.description) lines.push(r.description, "");
  if (r.headings.length) {
    lines.push("## Headings", "");
    for (const h of r.headings) lines.push(`${"#".repeat(Math.min(h.level, 6))} ${h.text}`);
    lines.push("");
  }
  if (r.text) lines.push("## Text", "", r.text, "");
  if (r.links.length) {
    lines.push("## Links", "");
    for (const l of r.links) lines.push(`- [${l.text || l.href}](${l.href}) (${l.kind})`);
    lines.push("");
  }
  if (r.emails.length) lines.push("## Emails", "", r.emails.map((e) => `- ${e}`).join("\n"), "");
  if (r.phones.length) lines.push("## Phones", "", r.phones.map((p) => `- ${p}`).join("\n"), "");
  if (r.media.length) {
    lines.push("## Media", "");
    for (const m of r.media) lines.push(`- ${m.type}: ${m.src}${m.alt ? ` — ${m.alt}` : ""}`);
    lines.push("");
  }
  if (r.comments.length) {
    lines.push("## Comments", "", r.comments.map((c) => `<!-- ${c} -->`).join("\n\n"), "");
  }
  return lines.join("\n");
}

export function resultToLinksCsv(r: ScrapeResult): string {
  const rows = [["href", "text", "kind", "rel", "target"]];
  for (const l of r.links) {
    rows.push([l.href, l.text, l.kind, l.rel, l.target].map(csvCell));
  }
  return rows.map((row) => row.join(",")).join("\n");
}

function csvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function fileBase(r: ScrapeResult): string {
  return `voidscan-${slugFromUrl(r.finalUrl || r.requestedUrl)}`;
}
