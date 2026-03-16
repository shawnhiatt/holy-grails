import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const add = mutation({
  args: {
    sessionToken: v.string(),
    following_username: v.string(),
    avatar_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    // Check if already following
    const existing = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
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
      discogs_username: user.discogs_username,
      following_username: args.following_username,
      followed_at: Date.now(),
      avatar_url: args.avatar_url,
    });
  },
});

export const updateAvatar = mutation({
  args: {
    sessionToken: v.string(),
    following_username: v.string(),
    avatar_url: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
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
    sessionToken: v.string(),
    following_username: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
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

export const clearAll = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    // Also clear cached following feed data
    const feedRows = await ctx.db
      .query("following_feed")
      .withIndex("by_follower", (q) =>
        q.eq("follower_username", user.discogs_username)
      )
      .collect();
    for (const row of feedRows) await ctx.db.delete(row._id);
  },
});
