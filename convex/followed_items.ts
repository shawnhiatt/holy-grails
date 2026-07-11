import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
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

/** Delete all cached items of one kind for a followed user. */
export const clearForUser = internalMutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    kind: v.union(v.literal("collection"), v.literal("want")),
  },
  handler: async (ctx, args) => {
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

/** Insert a batch of cached items (sync action writes in chunks). */
export const appendItems = internalMutation({
  args: {
    follower_username: v.string(),
    followed_username: v.string(),
    kind: v.union(v.literal("collection"), v.literal("want")),
    items: v.array(v.object(itemFields)),
  },
  handler: async (ctx, args) => {
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
