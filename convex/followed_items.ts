import { v } from "convex/values";
import { query, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
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

// ─── Paged clears ───
//
// A followed user's cached collection can be tens of thousands of rows, more
// than one Convex mutation may read or delete (32,000 read, 16,000 written).
// Every clear here deletes at most FOLLOWED_DELETE_BATCH rows per transaction
// and schedules the rest — the same reasoning as the chunked sync write in
// cacheRows.ts and the paged Delete all data in users.ts.

/** Rows one clear step may delete. Far under the per-mutation limits. */
export const FOLLOWED_DELETE_BATCH = 1000;

/**
 * Delete every cached row (both kinds) for a pair the follower no longer
 * follows: one batch now, the rest in scheduled steps. Each step re-checks the
 * follow and stops if it is back — the re-follow's own sync clears the old
 * rows (clearForUser), and this must not delete the rows that sync writes.
 */
export async function clearUnfollowedPair(
  ctx: MutationCtx,
  follower: string,
  followed: string
): Promise<void> {
  if (await stillFollowing(ctx, follower, followed)) return;
  const rows = await ctx.db
    .query("followed_items")
    .withIndex("by_follower_followed", (q) =>
      q.eq("follower_username", follower).eq("followed_username", followed)
    )
    .take(FOLLOWED_DELETE_BATCH);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length === FOLLOWED_DELETE_BATCH) {
    await ctx.scheduler.runAfter(0, internal.followed_items.continueClearUnfollowedPair, {
      follower_username: follower,
      followed_username: followed,
    });
  }
}

export const continueClearUnfollowedPair = internalMutation({
  args: { follower_username: v.string(), followed_username: v.string() },
  handler: async (ctx, args) => {
    await clearUnfollowedPair(ctx, args.follower_username, args.followed_username);
  },
});

/**
 * One page of a sync's clear: rows of `kind` for the pair created no later
 * than `upTo`, the newest row that existed when the clear started. The cutoff
 * is what makes the scheduled rest safe — the sync action appends the fresh
 * rows straight after clearForUser returns, and a later step must delete only
 * the old ones. (Taken from the rows themselves rather than Date.now(), so
 * the comparison never mixes two clocks.) The range is on the index's
 * implicit _creationTime, and the page walks it with a cursor, so the other
 * kind's rows are passed over once rather than re-read every step.
 */
async function clearKindStep(
  ctx: MutationCtx,
  args: {
    follower_username: string;
    followed_username: string;
    kind: "collection" | "want";
    upTo: number;
    cursor: string | null;
  }
): Promise<void> {
  const page = await ctx.db
    .query("followed_items")
    .withIndex("by_follower_followed", (q) =>
      q
        .eq("follower_username", args.follower_username)
        .eq("followed_username", args.followed_username)
        .lte("_creationTime", args.upTo)
    )
    .paginate({ cursor: args.cursor, numItems: FOLLOWED_DELETE_BATCH });
  for (const row of page.page) {
    if (row.kind === args.kind) await ctx.db.delete(row._id);
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.followed_items.continueClearForUser, {
      follower_username: args.follower_username,
      followed_username: args.followed_username,
      kind: args.kind,
      upTo: args.upTo,
      cursor: page.continueCursor,
    });
  }
}

const kindValidator = v.union(v.literal("collection"), v.literal("want"));

/**
 * Delete all cached items of one kind for a followed user. If the follow is
 * gone by the time this lands, every row for the pair goes instead — nothing
 * should be cached for someone no longer followed.
 *
 * The first page is deleted here; a larger cache finishes in scheduled steps
 * (see clearKindStep), so for a moment the profile can show old rows beside
 * the new ones. That replaces failing the whole refresh.
 */
export const clearForUser = internalMutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    kind: kindValidator,
  },
  handler: async (ctx, args) => {
    if (!(await stillFollowing(ctx, args.follower_username, args.followed_username))) {
      await clearUnfollowedPair(ctx, args.follower_username, args.followed_username);
      return;
    }
    const newest = await ctx.db
      .query("followed_items")
      .withIndex("by_follower_followed", (q) =>
        q
          .eq("follower_username", args.follower_username)
          .eq("followed_username", args.followed_username)
      )
      .order("desc")
      .first();
    if (!newest) return;
    await clearKindStep(ctx, { ...args, upTo: newest._creationTime, cursor: null });
  },
});

export const continueClearForUser = internalMutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    kind: kindValidator,
    upTo: v.number(),
    cursor: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await stillFollowing(ctx, args.follower_username, args.followed_username))) {
      await clearUnfollowedPair(ctx, args.follower_username, args.followed_username);
      return;
    }
    await clearKindStep(ctx, args);
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
      await clearUnfollowedPair(ctx, args.follower_username, args.followed_username);
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
