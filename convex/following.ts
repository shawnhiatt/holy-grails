import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
  },
});

export const add = mutation({
  args: {
    discogs_username: v.string(),
    following_username: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if already following
    const existing = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .filter((q) =>
        q.eq(q.field("following_username"), args.following_username)
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("following", {
      discogs_username: args.discogs_username,
      following_username: args.following_username,
      followed_at: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    discogs_username: v.string(),
    following_username: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .filter((q) =>
        q.eq(q.field("following_username"), args.following_username)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
