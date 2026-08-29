const KEY = "voidscan-history-v1";
const MAX = 24;

export type HistoryItem = {
  id: string;
  url: string;
  title: string;
  status: number;
  kind: string;
  scrapedAt: number;
  bytes: number;
  links: number;
  images: number;
  emails: number;
};

function read(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: HistoryItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
}

export function loadHistory(): HistoryItem[] {
  return read();
}

export function pushHistory(item: HistoryItem): HistoryItem[] {
  const next = [item, ...read().filter((h) => h.url !== item.url)].slice(0, MAX);
  write(next);
  return next;
}

export function removeHistory(id: string): HistoryItem[] {
  const next = read().filter((h) => h.id !== id);
  write(next);
  return next;
}

export function clearHistory(): HistoryItem[] {
  write([]);
  return [];
}
