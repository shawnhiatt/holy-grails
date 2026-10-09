import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Sessions expire after 90 days WITHOUT USE. Expired tokens are rejected
 * everywhere, which sends the client back through OAuth to mint a fresh one.
 *
 * The clock used to run from mint, with nothing renewing it, so everyone who
 * logged in during the same week was signed out together 90 days later,
 * however often they had opened the app since. Each open now renews the
 * session (users.touchSession), so only a device left unused for 90 days
 * expires.
 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * How stale a session must be before touchSession writes a renewal. Keeps
 * renewals to about one write per device per day, however often the app is
 * opened; a day of slack against a 90-day window costs nothing.
 */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

type SessionRow = { created_at: number; last_seen_at?: number };

/** When a sessions-table row was last renewed (or minted, if never). */
export function sessionLastActive(session: SessionRow): number {
  return session.last_seen_at ?? session.created_at;
}

export function isSessionRowExpired(session: SessionRow, now: number): boolean {
  return now - sessionLastActive(session) >= SESSION_TTL_MS;
}

/** Validity check for the LEGACY single-token fields on the users table. */
export function isSessionValid(user: {
  session_token?: string;
  session_created_at?: number;
}): boolean {
  if (!user.session_token) return false;
  if (!user.session_created_at) return false; // pre-TTL-era token — force rotation
  return Date.now() - user.session_created_at < SESSION_TTL_MS;
}

/**
 * Resolve a session token to its user record, or null.
 *
 * Primary path: the sessions table (one row per device, minted per login).
 * Legacy fallback: the single session_token field on the users table —
 * honored read-only so devices signed in before the sessions table existed
 * stay signed in until their token ages out.
 */
export async function resolveSession(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string
) {
  if (!sessionToken) return null;

  const session = await ctx.db
    .query("auth_sessions")
    .withIndex("by_token", (q) => q.eq("session_token", sessionToken))
    .first();
  if (session) {
    if (isSessionRowExpired(session, Date.now())) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", session.discogs_username)
      )
      .first();
  }

  const legacyUser = await ctx.db
    .query("users")
    .withIndex("by_session_token", (q) => q.eq("session_token", sessionToken))
    .first();
  if (legacyUser && isSessionValid(legacyUser)) return legacyUser;
  return null;
}

/**
 * Validate a session token and return the authenticated user record.
 *
 * Every guarded Convex query/mutation calls this at the top of its handler.
 * Throws if the token is missing, empty, expired, or unknown.
 */
export async function authenticateUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string
) {
  const user = await resolveSession(ctx, sessionToken);
  if (!user) throw new Error("Unauthorized");
  return user;
}
