import { useEffect, useState } from "react";
import { ChevronDown, History, ScanSearch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ResultView } from "@/components/ResultView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  clearHistory,
  loadHistory,
  pushHistory,
  removeHistory,
  type HistoryItem,
} from "@/lib/history";
import type { ScrapeResponse, ScrapeResult } from "@/lib/types";
import { formatBytes, hostOf } from "@/lib/utils";

const EXAMPLES = [
  "https://example.com",
  "https://news.ycombinator.com",
  "https://en.wikipedia.org/wiki/Web_scraping",
];

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t;
  return `https://${t}`;
}

export function ScraperApp() {
  const [url, setUrl] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    fetch("/api/health")
      .then(async (r) => {
        if (!r.ok) throw new Error("bad status");
        const j = (await r.json()) as { ok?: boolean };
        setApiUp(j.ok === true);
      })
      .catch(() => setApiUp(false));
  }, []);

  async function run(target = url) {
    const next = normalizeUrl(target);
    if (!next) {
      setError("Paste a URL to extract.");
      return;
    }
    setUrl(next);
    setLoading(true);
    setError(null);
    try {
      const extraHeaders =
        headerName.trim() && headerValue
          ? [{ name: headerName.trim(), value: headerValue }]
          : undefined;

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: next,
          userAgent: userAgent.trim() || undefined,
          extraHeaders,
        }),
      });

      const text = await res.text();
      let data: ScrapeResponse;
      try {
        data = JSON.parse(text) as ScrapeResponse;
      } catch {
        const message =
          res.status === 404 || res.status === 502 || res.status === 504
            ? "API server is not running. In a terminal run: npm run dev (starts both UI and API)."
            : `Server returned non-JSON (HTTP ${res.status}). Is the API up on port 3001?`;
        setResult(null);
        setError(message);
        setApiUp(false);
        toast.error(message);
        return;
      }

      if (!res.ok && !("ok" in data)) {
        const message = `Request failed (HTTP ${res.status}).`;
        setResult(null);
        setError(message);
        toast.error(message);
        return;
      }

      if (!data.ok) {
        setResult(null);
        setError(data.error || "Scrape failed.");
        toast.error(data.error || "Scrape failed.");
        return;
      }

      setApiUp(true);
      setResult(data);
      setHistory(
        pushHistory({
          id: `${Date.now()}`,
          url: data.finalUrl || data.requestedUrl,
          title: data.title || hostOf(data.finalUrl),
          status: data.status,
          kind: data.kind,
          scrapedAt: Date.now(),
          bytes: data.bytes,
          links: data.links.length,
          images: data.media.filter((m) => m.type === "image").length,
          emails: data.emails.length,
        }),
      );
      toast.success(`Extracted ${data.title || hostOf(data.finalUrl)}`);
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Cannot reach API. Run npm run dev so both the UI and the server start."
          : err instanceof Error
            ? err.message
            : "Scrape failed.";
      setResult(null);
      setError(message);
      setApiUp(false);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-70" />
      <header className="relative z-10 border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-elevated font-mono text-xs tracking-widest text-scan shadow-[var(--shadow-border)]">
              VS
            </span>
            <div>
              <div className="text-sm font-semibold tracking-[0.18em] text-fg">VOIDSCAN</div>
              <div className="text-xs text-muted">Full-spectrum extractor</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {apiUp === false ? (
              <Badge variant="danger">API offline</Badge>
            ) : apiUp === true ? (
              <Badge variant="success">API online</Badge>
            ) : (
              <Badge>checking API…</Badge>
            )}
            <Badge>no filter</Badge>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-subtle">
              <History className="size-3.5" /> History
            </h2>
            {history.length ? (
              <button
                type="button"
                className="inline-flex h-11 items-center text-xs text-muted hover:text-fg"
                onClick={() => setHistory(clearHistory())}
              >
                <Trash2 className="mr-1 size-3.5" />
                Clear
              </button>
            ) : null}
          </div>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Extracts you run stay on this device.</p>
          ) : (
            <ul className="mt-3 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {history.map((h) => (
                <li key={h.id} className="min-w-[14rem] lg:min-w-0">
                  <div className="flex items-stretch rounded-md bg-surface shadow-[var(--shadow-border)]">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                      onClick={() => run(h.url)}
                    >
                      <div className="truncate text-sm text-fg">{h.title}</div>
                      <div className="truncate font-mono text-xs text-subtle">{hostOf(h.url)}</div>
                      <div className="mt-1 font-mono text-xs text-muted">
                        {h.status} · {formatBytes(h.bytes)} · {h.links} links
                      </div>
                    </button>
                    <button
                      type="button"
                      className="flex w-11 items-center justify-center text-subtle hover:text-fg"
                      aria-label="Remove from history"
                      onClick={() => setHistory(removeHistory(h.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="order-1 lg:order-2">
          <section className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
            <h1 className="text-2xl font-medium tracking-tight text-fg sm:text-3xl">
              Pull every byte a page will give you.
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Paste any public URL. VOIDSCAN fetches it server-side and extracts headers, text,
              links, media, forms, hidden fields, scripts, comments, and contacts — unfiltered.
            </p>

            {apiUp === false ? (
              <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">
                <strong className="font-medium">API offline.</strong> Scraping needs the Node server.
                In the project folder run:
                <pre className="mt-2 overflow-x-auto rounded bg-bg px-2 py-1 font-mono text-xs text-fg">
                  npm install{"\n"}npm run dev
                </pre>
                Then open <span className="font-mono">http://localhost:5173</span> (not a random port
                or opened HTML file).
              </div>
            ) : null}

            <form
              className="mt-5 flex flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="URL to extract"
                className="font-mono sm:flex-1"
              />
              <Button type="submit" size="lg" disabled={loading} className="sm:w-40">
                <ScanSearch />
                {loading ? "Scanning" : "Extract"}
              </Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="h-11 rounded-full px-3 font-mono text-xs text-muted shadow-[var(--shadow-border)] hover:text-fg"
                  onClick={() => {
                    setUrl(ex);
                    void run(ex);
                  }}
                >
                  {hostOf(ex)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 inline-flex h-11 items-center gap-1 text-xs text-muted hover:text-fg"
              onClick={() => setAdvanced((v) => !v)}
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${advanced ? "rotate-180" : ""}`}
              />
              Advanced
            </button>
            {advanced ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-subtle">
                  User-Agent
                  <Input
                    className="mt-1 font-mono"
                    value={userAgent}
                    onChange={(e) => setUserAgent(e.target.value)}
                    placeholder="Optional custom UA"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs text-subtle">
                    Header
                    <Input
                      className="mt-1 font-mono"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      placeholder="Accept-Language"
                    />
                  </label>
                  <label className="block text-xs text-subtle">
                    Value
                    <Input
                      className="mt-1 font-mono"
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                      placeholder="en"
                    />
                  </label>
                </div>
              </div>
            ) : null}
            {loading ? (
              <div className="relative mt-4 h-px overflow-hidden bg-border">
                <div className="scan-line absolute inset-y-0 w-1/3" />
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </section>

          <div className="mt-6">
            {result ? (
              <ResultView result={result} />
            ) : (
              !loading && (
                <div className="rounded-xl px-4 py-16 text-center shadow-[var(--shadow-border)]">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-scan">Ready</p>
                  <p className="mt-2 text-sm text-muted">
                    Try the <span className="font-mono text-fg">example.com</span> chip first. Source is
                    shown as text so nothing executes.
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
