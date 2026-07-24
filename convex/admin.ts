/**
 * Admin identity — who can read the bug-report inbox.
 *
 * The allowlist lives in the `HG_ADMIN_USERNAMES` Convex environment variable
 * (comma-separated Discogs usernames), never in code: the repo may go public
 * as a portfolio piece, and an admin list in git is a permanent one. Unset =
 * nobody is an admin, which fails closed — the inbox simply never appears.
 *
 * Pure module, no Convex imports (same pattern as marketValue.ts and
 * coverIdentity.ts) so the gate is unit-testable without a deployment.
 */

export function parseAdminUsernames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
}

/**
 * Discogs usernames are case-insensitive for identity purposes, so the compare
 * is too — a tester who signs in as "Shawn" is the same person as "shawn".
 */
export function isAdminUsername(
  username: string,
  raw: string | undefined = process.env.HG_ADMIN_USERNAMES
): boolean {
  const admins = parseAdminUsernames(raw);
  if (admins.length === 0) return false;
  return admins.includes(username.trim().toLowerCase());
}
