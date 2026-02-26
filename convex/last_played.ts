import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
  },
});

export const upsert = mutation({
  args: {
    discogs_username: v.string(),
    release_id: v.number(),
    played_at: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("last_played")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", args.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { played_at: args.played_at });
      return existing._id;
    }

    return await ctx.db.insert("last_played", {
      discogs_username: args.discogs_username,
      release_id: args.release_id,
      played_at: args.played_at,
    });
  },
});
