import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByFollower = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("following_feed")
      .withIndex("by_follower", (q) =>
        q.eq("follower_username", user.discogs_username)
      )
      .collect();
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    followed_username: v.string(),
    recent_albums: v.array(
      v.object({
        release_id: v.number(),
        master_id: v.optional(v.number()),
        title: v.string(),
        artist: v.string(),
        year: v.number(),
        thumb: v.optional(v.string()),
        cover: v.string(),
        label: v.string(),
        dateAdded: v.string(),
      })
    ),
    recent_wants: v.optional(
      v.array(
        v.object({
          release_id: v.number(),
          master_id: v.optional(v.number()),
          title: v.string(),
          artist: v.string(),
          year: v.number(),
          thumb: v.optional(v.string()),
          cover: v.string(),
          label: v.string(),
          dateAdded: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("following_feed")
      .withIndex("by_follower_and_followed", (q) =>
        q
          .eq("follower_username", user.discogs_username)
          .eq("followed_username", args.followed_username)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        recent_albums: args.recent_albums,
        recent_wants: args.recent_wants,
        lastSyncedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("following_feed", {
      follower_username: user.discogs_username,
      followed_username: args.followed_username,
      recent_albums: args.recent_albums,
      recent_wants: args.recent_wants,
      lastSyncedAt: Date.now(),
    });
  },
});

export const deleteEntry = mutation({
  args: {
    sessionToken: v.string(),
    followed_username: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("following_feed")
      .withIndex("by_follower_and_followed", (q) =>
        q
          .eq("follower_username", user.discogs_username)
          .eq("followed_username", args.followed_username)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
