import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Validate a session token and return the authenticated user record.
 *
 * Every guarded Convex query/mutation calls this at the top of its handler.
 * Throws if the token is missing, empty, or not found in the users table.
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
  if (!user) throw new Error("Unauthorized");
  return user;
}
