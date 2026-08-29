import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeInputSchema } from "../src/lib/types.js";
import { scrapePage } from "./scrape.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/scrape", async (req, res) => {
  try {
    const input = scrapeInputSchema.parse(req.body);
    const result = await scrapePage(input);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    res.status(400).json({ ok: false, error: message, requestedUrl: "" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "voidscan" });
});

if (isProd) {
  const dist = path.resolve(__dirname, "../dist");
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`VOIDSCAN API on http://0.0.0.0:${PORT}`);
});
