# VOIDSCAN

Full-spectrum page extractor. Paste any public URL — pull headers, text, links, media, forms, scripts, contacts, and raw source with **no content filter**.

## Why scrape returns nothing

Scraping runs on a **Node API**, not in the browser alone.

| Symptom | Cause | Fix |
| --- | --- | --- |
| **API offline** badge | Server not running | Run `npm run dev` (starts UI **and** API) |
| Opens but Extract does nothing useful | Only Vite client, no API | Same: full `npm run dev`, open **http://localhost:5173** |
| Opened `index.html` as a file | No server at all | Use `npm run dev`, not double-click HTML |
| Some sites empty / error | Site blocks bots or needs login | Try `https://example.com` first |

Header shows **API online** / **API offline** so you can see the problem immediately.

## Quick start

```bash
git clone https://github.com/ashishshrm4887-spec/voidscan.git
cd voidscan
npm install
npm run dev
```

Then open **http://localhost:5173** (not port 3001 for the UI).

- UI (Vite): http://localhost:5173  
- API (Express): http://localhost:3001  
- Health: http://localhost:3001/api/health  

Click the **example.com** chip — you should get title, links, and raw HTML.

Production:

```bash
npm run build
npm start
```

Serves UI + API together on port `3001`.

## API

`POST /api/scrape`

```json
{
  "url": "https://example.com",
  "userAgent": "optional custom UA",
  "extraHeaders": [{ "name": "Accept-Language", "value": "en" }]
}
```

## Stack

- Vite + React 19 + TypeScript
- Express + Cheerio
- Tailwind CSS v4

## License

MIT
