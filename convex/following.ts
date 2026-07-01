import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { authenticateUser } from "./authHelper";

/** Delete all cached followed_items rows for one followed user. */
async function deleteFollowedItems(
  ctx: MutationCtx,
  follower: string,
  followed: string
) {
  const rows = await ctx.db
    .query("followed_items")
    .withIndex("by_follower_followed", (q) =>
      q.eq("follower_username", follower).eq("followed_username", followed)
    )
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

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
    // Clean up the persisted collection/wantlist cache for this user
    await deleteFollowedItems(ctx, user.discogs_username, args.following_username);
  },
});

/**
 * Sync metadata for a followed user's persisted collection cache. Internal —
 * written only by discogs.syncFollowedUser.
 */
export const updateSyncMeta = internalMutation({
  args: {
    follower_username: v.string(),
    following_username: v.string(),
    collection_synced_at: v.optional(v.number()),
    is_private: v.optional(v.boolean()),
    avatar_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.follower_username)
      )
      .filter((q) =>
        q.eq(q.field("following_username"), args.following_username)
      )
      .first();
    if (!existing) return;
    const patch: { collection_synced_at?: number; is_private?: boolean; avatar_url?: string } = {};
    if (args.collection_synced_at !== undefined) patch.collection_synced_at = args.collection_synced_at;
    if (args.is_private !== undefined) patch.is_private = args.is_private;
    if (args.avatar_url) patch.avatar_url = args.avatar_url;
    await ctx.db.patch(existing._id, patch);
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
    // And the persisted followed collections cache
    for (const row of rows) {
      await deleteFollowedItems(ctx, user.discogs_username, row.following_username);
    }
  },
});
