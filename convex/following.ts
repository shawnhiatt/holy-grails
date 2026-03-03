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
    avatar_url: v.optional(v.string()),
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

    if (existing) {
      if (args.avatar_url && args.avatar_url !== existing.avatar_url) {
        await ctx.db.patch(existing._id, { avatar_url: args.avatar_url });
      }
      return existing._id;
    }

    return await ctx.db.insert("following", {
      discogs_username: args.discogs_username,
      following_username: args.following_username,
      followed_at: Date.now(),
      avatar_url: args.avatar_url,
    });
  },
});

export const updateAvatar = mutation({
  args: {
    discogs_username: v.string(),
    following_username: v.string(),
    avatar_url: v.string(),
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
      await ctx.db.patch(existing._id, { avatar_url: args.avatar_url });
    }
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
