import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { resolveSession } from "./authHelper";

/**
 * Internal query to look up user credentials by session token.
 * Used by convex/discogs.ts actions (Node.js runtime) via ctx.runQuery.
 *
 * Resolves through resolveSession (auth_sessions table first, legacy
 * users.session_token fallback) — the same path as authenticateUser.
 * It previously queried only the legacy by_session_token index, which
 * broke every Discogs proxy action for tokens minted into auth_sessions
 * (i.e. any login after the per-device sessions migration).
 */
export const getUserCredentials = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveSession(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");
    return {
      username: user.discogs_username,
      access_token: user.access_token,
      token_secret: user.token_secret,
    };
  },
});

/**
 * The pool of usable OAuth credentials — every user with tokens. Internal-only.
 * The market-value drip (Spec 6A.1) rotates through these to fetch the *shared*
 * per-release prices: the lowest ask is the same regardless of which token
 * asks, so spreading the requests across users keeps each user's own 60/min
 * Discogs budget intact instead of funnelling everything through one token.
 */
export const listUsersForMarketDrip = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => u.access_token && u.token_secret)
      .map((u) => ({
        accessToken: u.access_token,
        tokenSecret: u.token_secret,
      }));
  },
});
