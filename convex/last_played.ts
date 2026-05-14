import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const getCountByRelease = query({
  args: { sessionToken: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const records = await ctx.db
      .query("last_played")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
          .eq("release_id", args.release_id)
      )
      .collect();
    return records.length;
  },
});

export const getHistoryByRelease = query({
  args: { sessionToken: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const records = await ctx.db
      .query("last_played")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
          .eq("release_id", args.release_id)
      )
      .collect();
    return records
      .map((r) => ({ _id: r._id, played_at: r.played_at }))
      .sort((a, b) => b.played_at - a.played_at);
  },
});

/**
 * Authenticated query: returns play activity for a target user, gated on
 * shareActivity === true. Returns null for invalid viewer token, "not found",
 * and "not opted in" — all three cases are indistinguishable to callers.
 * Returns null (not throws) to prevent React error-boundary crashes when the
 * session token is briefly stale on startup.
 */
export const getPublicActivitySummary = query({
  args: {
    sessionToken: v.string(),
    targetUsername: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;
    const viewer = await ctx.db
      .query("users")
      .withIndex("by_session_token", (q) =>
        q.eq("session_token", args.sessionToken)
      )
      .first();
    if (!viewer) return null;
    const target = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.targetUsername)
      )
      .first();
    if (!target || target.shareActivity !== true) return null;
    const records = await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.targetUsername)
      )
      .collect();
    const sorted = [...records].sort((a, b) => b.played_at - a.played_at);
    return {
      totalPlays: sorted.length,
      recentPlays: sorted.slice(0, 10).map((r) => ({
        release_id: r.release_id,
        played_at: r.played_at,
      })),
    };
  },
});

export const logPlay = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
    played_at: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db.insert("last_played", {
      discogs_username: user.discogs_username,
      release_id: args.release_id,
      played_at: args.played_at,
    });
  },
});

export const deletePlay = mutation({
  args: { sessionToken: v.string(), play_id: v.id("last_played") },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const row = await ctx.db.get(args.play_id);
    if (!row) return;
    if (row.discogs_username !== user.discogs_username) {
      throw new Error("Unauthorized");
    }
    await ctx.db.delete(args.play_id);
  },
});

export const clearAll = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

