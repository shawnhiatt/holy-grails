import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authenticateUser } from "./authHelper";
import { clearUnfollowedPair, FOLLOWED_DELETE_BATCH } from "./followed_items";

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
    // Clean up the persisted collection/wantlist cache for this user — one
    // batch now, the rest in scheduled steps (a followed collection can be
    // larger than one mutation may delete).
    await clearUnfollowedPair(ctx, user.discogs_username, args.following_username);
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

/** following_feed rows each carry a 50-release snapshot, so they go in
 *  smaller bites to keep a step well under the read limit. */
const FEED_DELETE_BATCH = 100;

/**
 * One step of Clear following: the follow rows, then the feed cache, then the
 * followed collections cache, at most FOLLOWED_DELETE_BATCH rows per
 * transaction, with the rest scheduled (it used to be one transaction, which
 * fails once the followed collections outgrow Convex's per-mutation limits).
 *
 * `upTo` is the newest follow or feed row that existed when Clear following
 * was pressed: those rows are read by the _creationTime range up to it, so
 * someone followed again while a long clear is still running keeps their new
 * row. The followed_items rows of anyone followed at the time of a step are
 * left alone for the same reason; the re-follow's own sync clears its old
 * rows. That index can't range on _creationTime (followed_username sits in
 * front of it), so the cache is walked with a cursor instead.
 */
async function clearFollowingStep(
  ctx: MutationCtx,
  follower: string,
  upTo: number,
  cursor: string | null
): Promise<void> {
  const reschedule = (nextCursor: string | null) =>
    ctx.scheduler.runAfter(0, internal.following.continueClearAll, {
      follower_username: follower,
      upTo,
      cursor: nextCursor ?? undefined,
    });

  const follows = await ctx.db
    .query("following")
    .withIndex("by_username", (q) =>
      q.eq("discogs_username", follower).lte("_creationTime", upTo)
    )
    .take(FOLLOWED_DELETE_BATCH);
  for (const row of follows) await ctx.db.delete(row._id);
  if (follows.length === FOLLOWED_DELETE_BATCH) return void (await reschedule(cursor));

  const feedRows = await ctx.db
    .query("following_feed")
    .withIndex("by_follower", (q) =>
      q.eq("follower_username", follower).lte("_creationTime", upTo)
    )
    .take(FEED_DELETE_BATCH);
  for (const row of feedRows) await ctx.db.delete(row._id);
  if (feedRows.length === FEED_DELETE_BATCH) return void (await reschedule(cursor));

  // Whoever is followed now (only someone re-followed since the clear began).
  const stillFollowed = new Set(
    (
      await ctx.db
        .query("following")
        .withIndex("by_username", (q) => q.eq("discogs_username", follower))
        .collect()
    ).map((f) => f.following_username.toLowerCase())
  );
  const page = await ctx.db
    .query("followed_items")
    .withIndex("by_follower_followed", (q) => q.eq("follower_username", follower))
    .paginate({ cursor, numItems: FOLLOWED_DELETE_BATCH });
  for (const row of page.page) {
    if (!stillFollowed.has(row.followed_username.toLowerCase())) await ctx.db.delete(row._id);
  }
  if (!page.isDone) await reschedule(page.continueCursor);
}

/**
 * Clear following. Same name, arguments and (empty) return as before; a
 * typical account is cleared when this returns, a larger one finishes in
 * scheduled steps.
 */
export const clearAll = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const follower = user.discogs_username;
    const newestFollow = await ctx.db
      .query("following")
      .withIndex("by_username", (q) => q.eq("discogs_username", follower))
      .order("desc")
      .first();
    const newestFeed = await ctx.db
      .query("following_feed")
      .withIndex("by_follower", (q) => q.eq("follower_username", follower))
      .order("desc")
      .first();
    const upTo = Math.max(newestFollow?._creationTime ?? 0, newestFeed?._creationTime ?? 0);
    await clearFollowingStep(ctx, follower, upTo, null);
  },
});

/** The scheduled rest of clearAll. Internal: it takes a username. */
export const continueClearAll = internalMutation({
  args: {
    follower_username: v.string(),
    upTo: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await clearFollowingStep(ctx, args.follower_username, args.upTo, args.cursor ?? null);
  },
});
