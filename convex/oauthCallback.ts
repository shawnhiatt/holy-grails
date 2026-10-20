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
 * Native app callbacks are a second, separate allowlist: the
 * `HG_NATIVE_CALLBACKS` env var (comma-separated exact URLs, e.g.
 * "holygrails://auth/callback"). A custom scheme has no web origin —
 * `new URL("holygrails://auth/callback").origin` is "null" — so the origin
 * check above can't express it, and the match is on the exact string instead.
 * Unset fails closed (no native callbacks), and it is set on the dev
 * deployment only: another app on the same phone could register the same
 * scheme, which is acceptable for one person on dev and not for prod. Prod's
 * native login gets an https callback instead (iOS SPEC §5.3).
 *
 * That https callback, `NATIVE_HTTPS_CALLBACK`, is built in rather than
 * configured: it lives on our own domain, and an https URL can only be handed
 * to the app that holds the Associated Domains entitlement for that domain
 * (Apple checks the `apple-app-site-association` file on www.holygrails.app), so
 * the scheme's hijack risk doesn't apply and prod can allow it with no env
 * var. It is matched as an exact string, independent of HG_ALLOWED_ORIGINS, so
 * setting that env var (which replaces the default origins) can't switch the
 * iOS login off. `www.holygrails.app` only: Vercel redirects the bare domain
 * to www, and Apple won't read an AASA file behind a redirect, so the app's
 * entitlement names www and the bare host is refused. Its path
 * is deliberately not `/auth/callback`, so the PWA's login is untouched.
 *
 * Pure module, no Convex imports (admin.ts pattern), so it is unit-testable.
 */

export const CALLBACK_PATH = "/auth/callback";

/** The iOS app's prod login callback — exact string, always allowed. */
export const NATIVE_HTTPS_CALLBACK = "https://www.holygrails.app/auth/native-callback";

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
 * Exact callback URLs from `HG_NATIVE_CALLBACKS`, or an empty list when unset.
 * Only custom-scheme entries are kept: an http(s) URL here would sidestep the
 * origin allowlist, so web callbacks can only ever come from HG_ALLOWED_ORIGINS.
 */
export function parseNativeCallbacks(raw: string | undefined): string[] {
  if (!raw) return [];
  const callbacks: string[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") continue;
    callbacks.push(trimmed);
  }
  return callbacks;
}

/**
 * True only for exactly `{allowed origin}/auth/callback` — no query string,
 * no fragment, no credentials. The origin compare is on the parsed origin
 * (scheme + host + port), never a prefix or substring match, so
 * "https://holygrails.app.evil.example" and "https://evil.example/?https://holygrails.app"
 * are both rejected. A native callback must equal `NATIVE_HTTPS_CALLBACK` or
 * an `HG_NATIVE_CALLBACKS` entry character for character.
 */
export function isAllowedCallbackUrl(
  url: string,
  raw: string | undefined = process.env.HG_ALLOWED_ORIGINS,
  nativeRaw: string | undefined = process.env.HG_NATIVE_CALLBACKS
): boolean {
  if (url === NATIVE_HTTPS_CALLBACK) return true;
  if (parseNativeCallbacks(nativeRaw).includes(url)) return true;
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
