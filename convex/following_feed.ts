import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByFollower = query({
  args: { follower_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("following_feed")
      .withIndex("by_follower", (q) =>
        q.eq("follower_username", args.follower_username)
      )
      .collect();
  },
});

export const upsert = mutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    recent_albums: v.array(
      v.object({
        release_id: v.number(),
        title: v.string(),
        artist: v.string(),
        year: v.number(),
        thumb: v.optional(v.string()),
        cover: v.string(),
        label: v.string(),
        dateAdded: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("following_feed")
      .withIndex("by_follower_and_followed", (q) =>
        q
          .eq("follower_username", args.follower_username)
          .eq("followed_username", args.followed_username)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        recent_albums: args.recent_albums,
        lastSyncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("following_feed", {
      follower_username: args.follower_username,
      followed_username: args.followed_username,
      recent_albums: args.recent_albums,
      lastSyncedAt: Date.now(),
    });
  },
});

export const deleteEntry = mutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("following_feed")
      .withIndex("by_follower_and_followed", (q) =>
        q
          .eq("follower_username", args.follower_username)
          .eq("followed_username", args.followed_username)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
