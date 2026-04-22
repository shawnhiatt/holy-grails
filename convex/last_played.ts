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

// TEMPORARY — remove after prod clear
export const clearAllAdmin = mutation({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});