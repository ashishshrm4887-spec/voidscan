# VOIDSCAN

Full-spectrum page extractor. Paste any public URL — headers, text, links, media, forms, scripts, contacts, raw source.

**Repo:** https://github.com/ashishshrm4887-spec/voidscan

---

## Two ways to scrape

| Stack | Parser | Fetcher | Use for |
| --- | --- | --- | --- |
| **Web app** (TypeScript) | Cheerio | `fetch` | UI + API on localhost / Vercel |
| **Python CLI** | **BeautifulSoup** | **requests** | Scripts, notebooks, terminal |

Cheerio (Node) ≈ BeautifulSoup (Python). Same job: parse HTML and extract data.

---

## Python (requests + BeautifulSoup)

```bash
cd python
pip install -r requirements.txt
python scrape.py https://example.com
python scrape.py https://example.com --json result.json
```

Extracts title, description, emails, phones, usernames/password fields, links, media (including CSS backgrounds + og:image), forms, meta, and visible text.

---

## Web app (Node)

```bash
npm install
npm run dev
```

Open **http://localhost:5173** — header must show **API online**.

### Publish (Vercel)

1. [vercel.com/new](https://vercel.com/new)
2. Import this GitHub repo
3. Deploy

---

## License

MIT
