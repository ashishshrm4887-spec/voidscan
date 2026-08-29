import type { ExtractedCredential, ExtractedForm } from "../src/lib/types.js";

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = item.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

const USER_FIELD_RE = /^(user(name)?|login|account|userid|user_id|email|e-?mail|member)$/i;
const PASS_FIELD_RE = /^(pass(word)?|passwd|pwd|secret|passphrase)$/i;
const TOKEN_FIELD_RE = /^(token|api[_-]?key|apikey|auth|access[_-]?token|secret[_-]?key)$/i;

function classifyAuthField(name: string, type: string): ExtractedCredential["kind"] | null {
  const n = name.trim();
  const ty = type.toLowerCase();
  if (ty === "password" || PASS_FIELD_RE.test(n)) return "password";
  if (ty === "email" || /e-?mail/i.test(n)) return "email";
  if (USER_FIELD_RE.test(n)) return "username";
  if (TOKEN_FIELD_RE.test(n)) return "token";
  return null;
}

/** Pull username/password/token-like values from forms and page source (exposed HTML only). */
export function extractAuthFromPage(
  forms: ExtractedForm[],
  html: string,
): { usernames: string[]; passwords: string[]; credentials: ExtractedCredential[] } {
  const credentials: ExtractedCredential[] = [];
  const usernames: string[] = [];
  const passwords: string[] = [];

  for (const form of forms) {
    for (const f of form.fields) {
      const kind = classifyAuthField(f.name, f.type);
      if (!kind) continue;
      credentials.push({
        kind,
        name: f.name || f.type,
        value: f.value,
        source: `form ${form.method} ${form.action || ""}`.trim(),
      });
      if (kind === "username" && f.value) usernames.push(f.value);
      if (kind === "password" && f.value) passwords.push(f.value);
    }
  }

  const pairRe =
    /(?:["']?(?:user(?:name)?|login|email|pass(?:word)?|passwd|pwd|api[_-]?key|token)["']?\s*[:=]\s*["']([^"']{1,200})["'])/gi;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(html))) {
    const full = m[0];
    const val = m[1]?.trim() || "";
    if (!val || val.length < 2) continue;
    const lower = full.toLowerCase();
    let kind: ExtractedCredential["kind"] = "other";
    if (/pass|pwd/.test(lower)) kind = "password";
    else if (/user|login/.test(lower)) kind = "username";
    else if (/email/.test(lower)) kind = "email";
    else if (/token|api/.test(lower)) kind = "token";
    credentials.push({
      kind,
      name: full.split(/[:=]/)[0].replace(/["']/g, "").trim(),
      value: val,
      source: "page source",
    });
    if (kind === "username") usernames.push(val);
    if (kind === "password") passwords.push(val);
  }

  return {
    usernames: unique(usernames).slice(0, 100),
    passwords: unique(passwords).slice(0, 100),
    credentials: credentials.slice(0, 200),
  };
}
