import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Sessions expire 90 days after the token is minted. Expired tokens are
 * rejected everywhere, which sends the client back through OAuth — a
 * painless re-login that mints a fresh token.
 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("session_token", sessionToken))
    .first();
  if (session) {
    if (Date.now() - session.created_at >= SESSION_TTL_MS) return null;
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
