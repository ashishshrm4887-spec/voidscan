# VOIDSCAN

Full-spectrum page extractor. Paste any public URL — headers, text, links, media, forms, scripts, contacts, raw source. **No content filter.**

**Repo (public):** https://github.com/ashishshrm4887-spec/voidscan

---

## Publish online (easiest) — Vercel

1. Open [https://vercel.com/new](https://vercel.com/new)
2. Sign in with **GitHub**
3. Import **`ashishshrm4887-spec/voidscan`**
4. Click **Deploy** (defaults are fine)
5. Open the link Vercel gives you (like `https://voidscan-xxx.vercel.app`)
6. Try **https://example.com** in the app

That’s your published scraper. No local server needed after deploy.

---

## Run on your computer

```bash
git clone https://github.com/ashishshrm4887-spec/voidscan.git
cd voidscan
npm install
npm run dev
```

Open **http://localhost:5173**

You must see **API online** in the header. If it says **API offline**, the server is not running — use `npm run dev`, not only the UI.

---

## API

`POST /api/scrape`

```json
{ "url": "https://example.com" }
```

`GET /api/health` → `{ "ok": true }`

---

## Stack

Vite + React + Express/Cheerio · Tailwind · works locally and on Vercel

## License

MIT
