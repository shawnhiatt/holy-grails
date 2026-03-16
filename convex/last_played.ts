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

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
    played_at: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("last_played")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { played_at: args.played_at });
      return existing._id;
    }

    return await ctx.db.insert("last_played", {
      discogs_username: user.discogs_username,
      release_id: args.release_id,
      played_at: args.played_at,
    });
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
