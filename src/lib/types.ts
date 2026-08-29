import { z } from "zod";

export const scrapeInputSchema = z.object({
  url: z.string().trim().min(1, "URL is required").max(2048),
  userAgent: z.string().max(400).optional(),
  extraHeaders: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        value: z.string().max(2000),
      }),
    )
    .max(12)
    .optional(),
});

export type ScrapeInput = z.infer<typeof scrapeInputSchema>;

export type HeaderPair = { name: string; value: string };

export type ExtractedLink = {
  href: string;
  text: string;
  rel: string;
  target: string;
  kind: "internal" | "external" | "anchor" | "other";
};

export type ExtractedMedia = {
  src: string;
  alt: string;
  type: "image" | "video" | "audio" | "iframe" | "source";
  width: string;
  height: string;
  poster: string;
};

export type ExtractedHeading = {
  level: number;
  text: string;
};

export type ExtractedFormField = {
  name: string;
  type: string;
  value: string;
  required: boolean;
  hidden: boolean;
  placeholder: string;
};

export type ExtractedForm = {
  action: string;
  method: string;
  enctype: string;
  id: string;
  name: string;
  fields: ExtractedFormField[];
};

export type ExtractedTable = {
  caption: string;
  headers: string[];
  rows: string[][];
};

export type ExtractedScript = {
  src: string;
  type: string;
  async: boolean;
  defer: boolean;
  inline: string;
};

export type ExtractedMeta = {
  name: string;
  content: string;
  property: string;
  httpEquiv: string;
  charset: string;
};

export type TechHint = {
  name: string;
  evidence: string;
};

export type RedirectHop = {
  url: string;
  status: number;
};

/** Credential-like values found in page HTML (forms, JS, comments). */
export type ExtractedCredential = {
  kind: "username" | "password" | "email" | "token" | "other";
  name: string;
  value: string;
  source: string;
};

export type ScrapeResult = {
  ok: true;
  requestedUrl: string;
  finalUrl: string;
  kind: "html" | "xml" | "json" | "text" | "binary";
  status: number;
  statusText: string;
  contentType: string;
  charset: string;
  bytes: number;
  truncatedDownload: boolean;
  truncatedRaw: boolean;
  timingMs: number;
  fetchedAt: string;
  redirectChain: RedirectHop[];
  headers: HeaderPair[];
  setCookies: string[];
  title: string;
  description: string;
  canonical: string;
  language: string;
  robots: string;
  generator: string;
  favicon: string;
  baseHref: string;
  meta: ExtractedMeta[];
  openGraph: HeaderPair[];
  twitter: HeaderPair[];
  jsonLd: string[];
  headings: ExtractedHeading[];
  paragraphs: string[];
  text: string;
  wordCount: number;
  links: ExtractedLink[];
  media: ExtractedMedia[];
  forms: ExtractedForm[];
  tables: ExtractedTable[];
  scripts: ExtractedScript[];
  stylesheets: string[];
  comments: string[];
  emails: string[];
  phones: string[];
  usernames: string[];
  passwords: string[];
  credentials: ExtractedCredential[];
  social: ExtractedLink[];
  feeds: string[];
  tech: TechHint[];
  raw: string;
};

export type ScrapeError = {
  ok: false;
  error: string;
  requestedUrl: string;
};

export type ScrapeResponse = ScrapeResult | ScrapeError;
