import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Sessions expire 90 days after the token is minted. Expired (or
 * pre-expiry-era) tokens are rejected everywhere, which sends the client
 * back through OAuth — a painless re-login that rotates the token.
 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function isSessionValid(user: {
  session_token?: string;
  session_created_at?: number;
}): boolean {
  if (!user.session_token) return false;
  if (!user.session_created_at) return false; // legacy token — force rotation
  return Date.now() - user.session_created_at < SESSION_TTL_MS;
}

/**
 * Validate a session token and return the authenticated user record.
 *
 * Every guarded Convex query/mutation calls this at the top of its handler.
 * Throws if the token is missing, empty, expired, or not found in the users
 * table.
 */
export async function authenticateUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string
) {
  if (!sessionToken) throw new Error("Unauthorized");
  const user = await ctx.db
    .query("users")
    .withIndex("by_session_token", (q) => q.eq("session_token", sessionToken))
    .first();
  if (!user || !isSessionValid(user)) throw new Error("Unauthorized");
  return user;
}
