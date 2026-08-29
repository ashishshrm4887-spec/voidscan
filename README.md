# VOIDSCAN

Full-spectrum page extractor. Paste any public URL — pull headers, text, links, media, forms, scripts, contacts, and raw source with **no content filter**.

## Features

- Server-side fetch (no browser CORS limits)
- HTML / JSON / XML / text responses
- Meta, Open Graph, JSON-LD, headings, visible text
- Links, images, video, iframes
- Emails, phones, social URLs
- Forms (including hidden fields), tables, scripts, HTML comments
- Response headers and Set-Cookie
- Export JSON, Markdown, HTML, CSV
- Local history (browser `localStorage`)

Private/loopback addresses are blocked (SSRF protection). Scraped HTML is shown as **text** so nothing executes in your browser.

## Quick start

```bash
npm install
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3001

Production:

```bash
npm run build
npm start
```

Serves the built UI and API on port `3001`.

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
