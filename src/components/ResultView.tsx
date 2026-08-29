import { useMemo, useState } from "react";
import {
  Braces,
  Code2,
  Download,
  ExternalLink,
  FileJson,
  FormInput,
  Hash,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Mail,
  Server,
  Type,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { CopyButton } from "@/components/CopyButton";
import { fileBase, resultToLinksCsv, resultToMarkdown } from "@/lib/export";
import type { ScrapeResult } from "@/lib/types";
import { downloadText, formatBytes, formatMs, hostOf } from "@/lib/utils";

function statusVariant(status: number) {
  if (status >= 200 && status < 300) return "success" as const;
  if (status >= 300 && status < 400) return "warn" as const;
  return "danger" as const;
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-md bg-elevated px-3 py-3 shadow-[var(--shadow-border)]">
      <div className="font-mono text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 break-all text-sm text-fg">{value}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: string }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

function PreBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-[28rem] overflow-auto rounded-lg bg-elevated p-4 font-mono text-xs leading-relaxed text-fg shadow-[var(--shadow-border)] whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-elevated px-3 py-2 shadow-[var(--shadow-border)]">
      <div className="font-mono text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-fg">{value}</div>
    </div>
  );
}

function MetaTable({ title, rows }: { title: string; rows: { name: string; value: string }[] }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="overflow-x-auto rounded-lg bg-elevated shadow-[var(--shadow-border)]">
        <table className="w-full text-left text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border first:border-0 align-top">
                <td className="w-44 px-3 py-2 font-mono text-subtle">{r.name}</td>
                <td className="px-3 py-2 break-all text-fg">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResultView({ result }: { result: ScrapeResult }) {
  const [linkQuery, setLinkQuery] = useState("");
  const [tab, setTab] = useState("overview");

  const filteredLinks = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    if (!q) return result.links;
    return result.links.filter(
      (l) =>
        l.href.toLowerCase().includes(q) ||
        l.text.toLowerCase().includes(q) ||
        l.kind.includes(q),
    );
  }, [linkQuery, result.links]);

  const images = result.media.filter((m) => m.type === "image");
  const otherMedia = result.media.filter((m) => m.type !== "image");
  const usernames = result.usernames ?? [];
  const passwords = result.passwords ?? [];
  const credentials = result.credentials ?? [];

  function exportJson() {
    downloadText(`${fileBase(result)}.json`, JSON.stringify(result, null, 2), "application/json");
    toast.success("JSON downloaded");
  }
  function exportMd() {
    downloadText(`${fileBase(result)}.md`, resultToMarkdown(result), "text/markdown");
    toast.success("Markdown downloaded");
  }
  function exportHtml() {
    downloadText(`${fileBase(result)}.html`, result.raw, "text/html");
    toast.success("HTML downloaded");
  }
  function exportCsv() {
    downloadText(`${fileBase(result)}-links.csv`, resultToLinksCsv(result), "text/csv");
    toast.success("CSV downloaded");
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(result.status)}>
                {result.status} {result.statusText || ""}
              </Badge>
              <Badge>{result.kind}</Badge>
              {result.truncatedDownload ? <Badge variant="warn">download truncated</Badge> : null}
              {result.truncatedRaw ? <Badge variant="warn">raw truncated</Badge> : null}
            </div>
            <h2 className="mt-2 text-lg font-medium tracking-tight text-fg sm:text-xl">
              {result.title || hostOf(result.finalUrl)}
            </h2>
            <a
              href={result.finalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-muted hover:text-fg"
            >
              {result.finalUrl}
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={exportJson}>
              <FileJson /> JSON
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={exportMd}>
              <Download /> Markdown
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={exportHtml}>
              <Code2 /> HTML
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={exportCsv}>
              CSV
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="Time" value={formatMs(result.timingMs)} />
          <Stat label="Size" value={formatBytes(result.bytes)} />
          <Stat label="Links" value={String(result.links.length)} />
          <Stat label="Media" value={String(result.media.length)} />
          <Stat label="Emails" value={String(result.emails.length)} />
          <Stat label="Auth" value={String(usernames.length + passwords.length)} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="meta">Meta</TabsTrigger>
          <TabsTrigger value="forms">Forms</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="headers">Headers</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact label="Title" value={result.title} />
            <Fact label="Description" value={result.description} />
            <Fact label="Canonical" value={result.canonical} />
            <Fact label="Language" value={result.language} />
            <Fact label="Generator" value={result.generator} />
            <Fact label="Robots" value={result.robots} />
            <Fact label="Charset" value={result.charset} />
            <Fact label="Content-Type" value={result.contentType} />
          </div>
          {result.redirectChain.length > 1 ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-fg">Redirect chain</h3>
              <ol className="space-y-1 font-mono text-xs text-muted">
                {result.redirectChain.map((h, i) => (
                  <li key={`${h.url}-${i}`} className="break-all">
                    {h.status} · {h.url}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {result.tech.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {result.tech.map((t) => (
                <Badge key={t.name} title={t.evidence}>
                  {t.name}
                </Badge>
              ))}
            </div>
          ) : null}
          {result.jsonLd.length ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
                  <Braces className="size-4" /> Structured data
                </h3>
                <CopyButton value={result.jsonLd.join("\n\n")} />
              </div>
              <PreBlock text={result.jsonLd.join("\n\n")} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="text">
          {result.headings.length ? (
            <div className="mb-5">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
                <Hash className="size-4" /> Headings
              </h3>
              <ul className="space-y-1">
                {result.headings.map((h, i) => (
                  <li
                    key={`${h.level}-${i}`}
                    className="text-sm text-fg"
                    style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                  >
                    <span className="mr-2 font-mono text-xs text-subtle">H{h.level}</span>
                    {h.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.text ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
                  <Type className="size-4" /> Visible text
                </h3>
                <CopyButton value={result.text} />
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-elevated p-4 text-sm leading-relaxed text-fg shadow-[var(--shadow-border)]">
                {result.text}
              </p>
            </div>
          ) : (
            <EmptyNote>No visible text extracted.</EmptyNote>
          )}
        </TabsContent>

        <TabsContent value="links">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="Filter links"
              className="sm:max-w-xs"
            />
            <span className="font-mono text-xs text-subtle">
              {filteredLinks.length} / {result.links.length}
            </span>
          </div>
          {filteredLinks.length === 0 ? (
            <EmptyNote>No links match.</EmptyNote>
          ) : (
            <ul className="divide-y divide-border rounded-lg bg-elevated shadow-[var(--shadow-border)]">
              {filteredLinks.slice(0, 500).map((l, i) => (
                <li
                  key={`${l.href}-${i}`}
                  className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-fg">{l.text || l.href}</div>
                    <div className="truncate font-mono text-xs text-muted">{l.href}</div>
                  </div>
                  <Badge>{l.kind}</Badge>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="media">
          {images.length === 0 && otherMedia.length === 0 ? (
            <EmptyNote>No media found.</EmptyNote>
          ) : (
            <>
              {images.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {images.slice(0, 80).map((m, i) => (
                    <figure
                      key={`${m.src}-${i}`}
                      className="overflow-hidden rounded-lg bg-elevated shadow-[var(--shadow-border)]"
                    >
                      {m.src.startsWith("data:") ? (
                        <div className="flex aspect-video items-center justify-center text-xs text-subtle">
                          data URI
                        </div>
                      ) : (
                        <img
                          src={m.src}
                          alt={m.alt || ""}
                          className="aspect-video w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      <figcaption className="space-y-1 p-2">
                        <div className="line-clamp-2 text-xs text-fg">{m.alt || "untitled"}</div>
                        <a
                          href={m.src}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-mono text-xs text-scan hover:underline"
                        >
                          {m.src}
                        </a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
              {otherMedia.length ? (
                <ul className="mt-4 space-y-2">
                  {otherMedia.map((m, i) => (
                    <li key={`${m.src}-${i}`} className="flex items-center gap-2 text-sm">
                      <ImageIcon className="size-4 shrink-0 text-muted" />
                      <Badge>{m.type}</Badge>
                      <a
                        href={m.src}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate font-mono text-xs text-muted hover:text-fg"
                      >
                        {m.src}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="contacts">
          <p className="mb-4 text-xs text-muted">
            Values found in page HTML only (forms, scripts, comments). Password fields are rarely
            filled in source — empty means nothing was exposed, not that login is broken.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="size-4" /> Emails
                </h3>
                {result.emails.length ? <CopyButton value={result.emails.join("\n")} /> : null}
              </div>
              {result.emails.length ? (
                <ul className="space-y-1 font-mono text-sm text-fg">
                  {result.emails.map((e) => (
                    <li key={e} className="break-all">
                      {e}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None found.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Phones</h3>
              {result.phones.length ? (
                <ul className="space-y-1 font-mono text-sm text-fg">
                  {result.phones.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None found.</p>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <User className="size-4" /> Usernames
                </h3>
                {usernames.length ? <CopyButton value={usernames.join("\n")} /> : null}
              </div>
              {usernames.length ? (
                <ul className="space-y-1 font-mono text-sm text-fg">
                  {usernames.map((u) => (
                    <li key={u} className="break-all">
                      {u}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None found.</p>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4" /> Passwords
                </h3>
                {passwords.length ? <CopyButton value={passwords.join("\n")} /> : null}
              </div>
              {passwords.length ? (
                <ul className="space-y-1 font-mono text-sm text-fg">
                  {passwords.map((p) => (
                    <li key={p} className="break-all">
                      {p}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None found in HTML.</p>
              )}
            </div>
          </div>

          {credentials.length ? (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium">Auth fields / leaked values</h3>
              <div className="overflow-x-auto rounded-lg bg-elevated shadow-[var(--shadow-border)]">
                <table className="w-full min-w-[28rem] text-left text-xs">
                  <thead className="text-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">kind</th>
                      <th className="px-3 py-2 font-medium">name</th>
                      <th className="px-3 py-2 font-medium">value</th>
                      <th className="px-3 py-2 font-medium">source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials.map((c, i) => (
                      <tr key={i} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <Badge variant={c.kind === "password" ? "danger" : "default"}>{c.kind}</Badge>
                        </td>
                        <td className="px-3 py-2 font-mono">{c.name}</td>
                        <td className="px-3 py-2 break-all font-mono text-fg">{c.value || "(empty)"}</td>
                        <td className="px-3 py-2 text-muted">{c.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result.social.length ? (
            <div className="mt-6">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Link2 className="size-4" /> Social
              </h3>
              <ul className="space-y-1">
                {result.social.map((s, i) => (
                  <li key={`${s.href}-${i}`} className="truncate font-mono text-xs text-muted">
                    {s.href}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="meta">
          {result.openGraph.length ? <MetaTable title="Open Graph" rows={result.openGraph} /> : null}
          {result.twitter.length ? <MetaTable title="Twitter" rows={result.twitter} /> : null}
          {result.meta.length ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium">All meta</h3>
              <div className="overflow-x-auto rounded-lg bg-elevated shadow-[var(--shadow-border)]">
                <table className="w-full min-w-[32rem] text-left text-xs">
                  <thead className="text-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">name</th>
                      <th className="px-3 py-2 font-medium">property</th>
                      <th className="px-3 py-2 font-medium">content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.meta.map((m, i) => (
                      <tr key={i} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono">{m.name || m.httpEquiv || m.charset}</td>
                        <td className="px-3 py-2 font-mono">{m.property}</td>
                        <td className="px-3 py-2 break-all text-muted">{m.content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyNote>No meta tags.</EmptyNote>
          )}
        </TabsContent>

        <TabsContent value="forms">
          {result.forms.length === 0 ? (
            <EmptyNote>No forms.</EmptyNote>
          ) : (
            <div className="space-y-4">
              {result.forms.map((f, i) => (
                <div key={i} className="rounded-lg bg-elevated p-4 shadow-[var(--shadow-border)]">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <FormInput className="size-4 text-muted" />
                    <Badge>{f.method}</Badge>
                    <span className="truncate font-mono text-xs text-muted">{f.action}</span>
                  </div>
                  <ul className="space-y-1 font-mono text-xs">
                    {f.fields.map((field, fi) => (
                      <li key={fi} className="flex flex-wrap gap-2 text-fg">
                        <span>{field.name || "(unnamed)"}</span>
                        <span className="text-subtle">{field.type}</span>
                        {field.hidden ? <Badge variant="warn">hidden</Badge> : null}
                        {field.type === "password" ? <Badge variant="danger">password</Badge> : null}
                        {field.value ? (
                          <span className="break-all text-muted">{field.value}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {result.comments.length ? (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium">HTML comments</h3>
              <PreBlock text={result.comments.map((c) => `<!-- ${c} -->`).join("\n\n")} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="scripts">
          {result.scripts.length === 0 && result.stylesheets.length === 0 ? (
            <EmptyNote>No scripts or stylesheets.</EmptyNote>
          ) : (
            <>
              <h3 className="mb-2 text-sm font-medium">Scripts ({result.scripts.length})</h3>
              <ul className="space-y-2">
                {result.scripts.map((s, i) => (
                  <li key={i} className="rounded-md bg-elevated p-3 shadow-[var(--shadow-border)]">
                    <div className="flex flex-wrap gap-2">
                      {s.src ? (
                        <span className="break-all font-mono text-xs text-fg">{s.src}</span>
                      ) : (
                        <Badge>inline</Badge>
                      )}
                      {s.async ? <Badge>async</Badge> : null}
                      {s.defer ? <Badge>defer</Badge> : null}
                    </div>
                    {s.inline ? (
                      <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs text-muted whitespace-pre-wrap">
                        {s.inline}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
              {result.stylesheets.length ? (
                <div className="mt-5">
                  <h3 className="mb-2 text-sm font-medium">Stylesheets</h3>
                  <ul className="space-y-1 font-mono text-xs text-muted">
                    {result.stylesheets.map((s) => (
                      <li key={s} className="break-all">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="headers">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Server className="size-4" /> Response headers
            </h3>
            <CopyButton value={result.headers.map((h) => `${h.name}: ${h.value}`).join("\n")} />
          </div>
          <div className="overflow-x-auto rounded-lg bg-elevated shadow-[var(--shadow-border)]">
            <table className="w-full text-left text-xs">
              <tbody>
                {result.headers.map((h, i) => (
                  <tr key={i} className="border-t border-border first:border-0 align-top">
                    <td className="w-40 px-3 py-2 font-mono text-subtle">{h.name}</td>
                    <td className="px-3 py-2 break-all font-mono text-fg">{h.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.setCookies.length ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium">Set-Cookie</h3>
              <PreBlock text={result.setCookies.join("\n")} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="raw">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Source</h3>
            <CopyButton value={result.raw} label="Copy source" />
          </div>
          {result.raw ? <PreBlock text={result.raw} /> : <EmptyNote>No source body.</EmptyNote>}
        </TabsContent>
      </Tabs>
    </section>
  );
}
