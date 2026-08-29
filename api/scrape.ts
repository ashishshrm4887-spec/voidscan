import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeInputSchema } from "../src/lib/types.js";
import { scrapePage } from "../server/scrape.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed", requestedUrl: "" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const input = scrapeInputSchema.parse(req.body);
    const result = await scrapePage(input);
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return res.status(400).json({ ok: false, error: message, requestedUrl: "" });
  }
}
