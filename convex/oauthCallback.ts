/**
 * Which URLs Discogs may send a login back to.
 *
 * `oauth.requestToken` is public and unauthenticated (it has to be — it is
 * step one of logging in), and whatever callback it is handed goes to Discogs
 * as `oauth_callback`. Unchecked, that is an account takeover: an attacker
 * requests a token with their own callback, sends someone the real Discogs
 * "authorize Holy Grails" link, receives the verifier at their own URL, and
 * trades it through `completeLogin` for a session on the victim's account.
 * Pinning the callback to our own origins means the verifier only ever lands
 * in the browser that started the login — the one holding the token secret.
 *
 * The allowlist is the `HG_ALLOWED_ORIGINS` Convex env var (comma-separated
 * origins, e.g. "https://holygrails.app,http://localhost:1234"). When it is
 * unset, the known public origins below apply, so deploying this before the
 * env var is set cannot lock anyone out; any origin not listed is rejected
 * either way. Set the env var to add a domain (a Vercel preview, a new custom
 * domain) — setting it REPLACES the defaults rather than adding to them.
 *
 * Pure module, no Convex imports (admin.ts pattern), so it is unit-testable.
 */

export const CALLBACK_PATH = "/auth/callback";

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://holygrails.app",
  "https://www.holygrails.app",
  "https://holy-grails.vercel.app",
  "http://localhost:1234",
];

/** Normalized origins from the env var, or null when unset/empty. Entries
 *  that are not valid origins are dropped rather than trusted. */
export function parseAllowedOrigins(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const origins: string[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      origins.push(new URL(trimmed).origin);
    } catch {
      // Not a URL — ignore it.
    }
  }
  return origins.length > 0 ? origins : null;
}

/**
 * True only for exactly `{allowed origin}/auth/callback` — no query string,
 * no fragment, no credentials. The origin compare is on the parsed origin
 * (scheme + host + port), never a prefix or substring match, so
 * "https://holygrails.app.evil.example" and "https://evil.example/?https://holygrails.app"
 * are both rejected.
 */
export function isAllowedCallbackUrl(
  url: string,
  raw: string | undefined = process.env.HG_ALLOWED_ORIGINS
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.search || parsed.hash) return false;
  if (parsed.pathname !== CALLBACK_PATH) return false;
  const allowed = parseAllowedOrigins(raw) ?? DEFAULT_ALLOWED_ORIGINS;
  return allowed.includes(parsed.origin);
}
