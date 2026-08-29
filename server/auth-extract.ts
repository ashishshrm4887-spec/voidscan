import type { ExtractedForm } from "../src/lib/types.js";

/**
 * Authorized scraping only.
 * - Never collect password values, hashes, tokens, or session secrets.
 * - Login forms are treated as protected: we record field *names/types* only,
 *   not submitted or default credential values.
 * - Public contact (emails/phones) is handled elsewhere from visible page text.
 */
export function extractAuthFromPage(
  forms: ExtractedForm[],
  _html: string,
): { usernames: string[]; passwords: string[]; credentials: never[] } {
  // Intentionally empty: credential values are out of scope for authorized scraping.
  void forms;
  return {
    usernames: [],
    passwords: [],
    credentials: [],
  };
}
