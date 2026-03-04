import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Internal query to look up user credentials by session token.
 * Used by convex/discogs.ts actions (Node.js runtime) via ctx.runQuery.
 */
export const getUserCredentials = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    if (!args.sessionToken) throw new Error("Unauthorized");
    const user = await ctx.db
      .query("users")
      .withIndex("by_session_token", (q) =>
        q.eq("session_token", args.sessionToken)
      )
      .first();
    if (!user) throw new Error("Unauthorized");
    return {
      username: user.discogs_username,
      access_token: user.access_token,
      token_secret: user.token_secret,
    };
  },
});
