import { v } from "convex/values";
import { query, internalMutation, MutationCtx } from "./_generated/server";
import { authenticateUser } from "./authHelper";

/**
 * Persisted followed-user collection/wantlist items.
 *
 * Written by the server-side sync action (discogs.syncFollowedUser) and read
 * per-profile when a followed user's profile opens. The Following screen no
 * longer re-downloads every followed collection from Discogs each session —
 * profiles render instantly from this cache and freshen in the background.
 */

const itemFields = {
  release_id: v.number(),
  master_id: v.optional(v.number()),
  title: v.string(),
  artist: v.string(),
  year: v.number(),
  thumb: v.optional(v.string()),
  cover: v.string(),
  label: v.string(),
  format: v.optional(v.string()),
  dateAdded: v.string(),
};

/**
 * Everything a followed user's profile needs in one subscription: their
 * cached collection and wantlist, when they were last synced, and whether
 * their collection turned out to be private.
 */
export const getForUser = query({
  args: { sessionToken: v.string(), followed_username: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("followed_items")
      .withIndex("by_follower_followed", (q) =>
        q
          .eq("follower_username", user.discogs_username)
          .eq("followed_username", args.followed_username)
      )
      .collect();

    const followRows = await ctx.db
      .query("following")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
    const meta = followRows.find(
      (f) =>
        f.following_username.toLowerCase() ===
        args.followed_username.toLowerCase()
    );

    const strip = (r: (typeof rows)[number]) => ({
      release_id: r.release_id,
      master_id: r.master_id,
      title: r.title,
      artist: r.artist,
      year: r.year,
      thumb: r.thumb,
      cover: r.cover,
      label: r.label,
      format: r.format,
      dateAdded: r.dateAdded,
    });

    return {
      collection: rows.filter((r) => r.kind === "collection").map(strip),
      wants: rows.filter((r) => r.kind === "want").map(strip),
      syncedAt: meta?.collection_synced_at ?? null,
      isPrivate: meta?.is_private ?? false,
    };
  },
});

/**
 * Whether `follower` still follows `followed`, read inside the writing
 * mutation so the answer is atomic with the write. syncFollowedUser fetches
 * from Discogs for seconds before it writes; an unfollow landing in that
 * window used to be followed by the sync's writes, leaving cached rows under
 * the follower for someone they no longer follow. Case-insensitive, matching
 * getForUser, so a casing difference between the follow row and the sync's
 * argument can never cost a legitimate write.
 */
async function stillFollowing(
  ctx: MutationCtx,
  follower: string,
  followed: string
): Promise<boolean> {
  const rows = await ctx.db
    .query("following")
    .withIndex("by_username", (q) => q.eq("discogs_username", follower))
    .collect();
  const target = followed.toLowerCase();
  return rows.some((f) => f.following_username.toLowerCase() === target);
}

/** Every cached row (both kinds) for one follower/followed pair. */
async function deleteAllForPair(
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

/**
 * Delete all cached items of one kind for a followed user. If the follow is
 * gone by the time this lands, every row for the pair goes instead — nothing
 * should be cached for someone no longer followed.
 */
export const clearForUser = internalMutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    kind: v.union(v.literal("collection"), v.literal("want")),
  },
  handler: async (ctx, args) => {
    if (!(await stillFollowing(ctx, args.follower_username, args.followed_username))) {
      await deleteAllForPair(ctx, args.follower_username, args.followed_username);
      return;
    }
    const rows = await ctx.db
      .query("followed_items")
      .withIndex("by_follower_followed", (q) =>
        q
          .eq("follower_username", args.follower_username)
          .eq("followed_username", args.followed_username)
      )
      .collect();
    for (const row of rows) {
      if (row.kind === args.kind) await ctx.db.delete(row._id);
    }
  },
});

/**
 * Insert a batch of cached items (sync action writes in chunks). Skipped —
 * and any rows already written for the pair removed — when the follower
 * unfollowed while the sync was running. Checked per chunk, so an unfollow
 * between two chunks is caught by the next one.
 */
export const appendItems = internalMutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    kind: v.union(v.literal("collection"), v.literal("want")),
    items: v.array(v.object(itemFields)),
  },
  handler: async (ctx, args) => {
    if (!(await stillFollowing(ctx, args.follower_username, args.followed_username))) {
      await deleteAllForPair(ctx, args.follower_username, args.followed_username);
      return;
    }
    for (const item of args.items) {
      await ctx.db.insert("followed_items", {
        follower_username: args.follower_username,
        followed_username: args.followed_username,
        kind: args.kind,
        ...item,
      });
    }
  },
});
