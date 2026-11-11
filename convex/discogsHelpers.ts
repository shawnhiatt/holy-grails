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
 * The one account the market-value drip fetches with. Internal-only.
 *
 * The drip prices releases shared by every user, and the lowest ask is the same
 * whichever token asks, so it runs on a single designated account instead of
 * borrowing every user's credentials (audit D-04). `username` comes from the
 * `HG_DRIP_USERNAME` Convex env var (a Discogs username, not a secret) and is
 * read by the action, which passes it in. Returns null when the name is blank,
 * the user doesn't exist, or the user has no stored token, so the caller can
 * log once and end the run.
 */
export const getDripCredentials = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const wanted = args.username.trim();
    if (!wanted) return null;
    // Exact match on the index first; fall back to a case-insensitive scan so a
    // differently-cased env var still finds the account.
    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("discogs_username", wanted))
      .first();
    if (!user) {
      const lower = wanted.toLowerCase();
      const all = await ctx.db.query("users").collect();
      user = all.find((u) => u.discogs_username.toLowerCase() === lower) ?? null;
    }
    if (!user || !user.access_token || !user.token_secret) return null;
    return {
      accessToken: user.access_token,
      tokenSecret: user.token_secret,
    };
  },
});
