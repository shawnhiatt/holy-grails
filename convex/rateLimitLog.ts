/**
 * Temporary instrumentation for bug hunt M3 — remove once M3 is decided.
 *
 * `discogsFetch` keeps one module-level `rateLimitRemaining` for every token
 * in the runtime. Whether that is right depends on how Discogs budgets
 * requests, which could not be checked without live traffic:
 *
 * - per source IP: every user's requests from Convex drain one shared budget,
 *   so a single counter is close to right;
 * - per token: each user has their own 60/min, so the counter should be keyed
 *   by token.
 *
 * With `HG_RATELIMIT_LOG` set on a deployment, every Discogs response logs its
 * rate-limit headers beside a fingerprint of the token that made it. The
 * market drip alternates tokens request by request, so one run answers it:
 * one falling count across fingerprints means per IP, a separate count per
 * fingerprint means per token.
 *
 * Pure (no Convex or Node deps) so it is testable in the plain node env. The
 * fingerprint is hashed in discogs.ts; nothing here ever sees a raw token.
 */

/** Convex reads env vars per call, so this toggles without a redeploy. */
export function rateLimitLogEnabled(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "off";
}

/**
 * The request path with the username segment masked. The path is enough to
 * tell a sync page from a drip lookup; whose collection it was is not needed.
 */
export function describeEndpoint(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return "?";
  }
  return path.replace(/^\/users\/[^/]+/, "/users/:u");
}

type HeaderReader = { get(name: string): string | null };

export function rateLimitLogLine(args: {
  method: string;
  url: string;
  status: number;
  tokenFingerprint: string;
  headers: HeaderReader;
}): string {
  const h = (name: string) => args.headers.get(name) ?? "-";
  return [
    "[Discogs ratelimit]",
    `token=${args.tokenFingerprint}`,
    `limit=${h("X-Discogs-Ratelimit")}`,
    `used=${h("X-Discogs-Ratelimit-Used")}`,
    `remaining=${h("X-Discogs-Ratelimit-Remaining")}`,
    `status=${args.status}`,
    `${args.method.toUpperCase()} ${describeEndpoint(args.url)}`,
  ].join(" ");
}
