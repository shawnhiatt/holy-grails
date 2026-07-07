import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const now = Date.now();
    return await ctx.db.insert("stacks", {
      discogs_username: user.discogs_username,
      stack_id: args.stack_id,
      name: args.name,
      album_ids: args.album_ids,
      created_at: now,
      last_modified: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.optional(v.string()),
    album_ids: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (!existing) {
      throw new Error(`Stack ${args.stack_id} not found`);
    }

    const updates: Record<string, unknown> = { last_modified: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.album_ids !== undefined) updates.album_ids = args.album_ids;

    await ctx.db.patch(existing._id, updates);
    return existing._id;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// ── Session sharing (capability-token share links) ──
// See the Sessions naming note in CLAUDE.md: internal identifiers stay
// stack*/share*; user-facing copy says "Session".

/**
 * Turn on a public share link for a session. Idempotent — returns the
 * existing share_id if one is already set. The share_id is unguessable
 * (128-bit, crypto-random) and IS the capability that grants read access.
 */
export const enableShare = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (!existing) {
      throw new Error(`Stack ${args.stack_id} not found`);
    }
    if (existing.share_id) {
      return existing.share_id;
    }

    // 32 hex chars = 128 bits of entropy — unguessable.
    const shareId = crypto.randomUUID().replace(/-/g, "");
    await ctx.db.patch(existing._id, { share_id: shareId });
    return shareId;
  },
});

/** Revoke a session's share link. */
export const disableShare = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (existing && existing.share_id) {
      await ctx.db.patch(existing._id, { share_id: undefined });
    }
  },
});

/**
 * Public read of a shared session. Deliberately UNAUTHENTICATED — the
 * unguessable share_id is the capability. Mirrors the Cross-User Data
 * Pattern's "null for not-found and not-shared alike": returns null for an
 * unknown/revoked share_id.
 *
 * Returns ONLY the whitelisted display fields. Never exposes
 * discogs_username, release ids, purge tags, notes, conditions, price paid,
 * or any token. Albums that have left the collection since sharing are
 * silently skipped.
 */
export const getShared = query({
  args: { share_id: v.string() },
  handler: async (ctx, args) => {
    if (!args.share_id) return null;

    const stack = await ctx.db
      .query("stacks")
      .withIndex("by_share_id", (q) => q.eq("share_id", args.share_id))
      .first();

    if (!stack) return null;

    const albums: {
      title: string;
      artist: string;
      year: number;
      cover: string;
      thumb: string | null;
    }[] = [];

    for (const releaseId of stack.album_ids) {
      const row = await ctx.db
        .query("collection")
        .withIndex("by_username_and_release", (q) =>
          q
            .eq("discogsUsername", stack.discogs_username)
            .eq("releaseId", releaseId)
        )
        .first();
      // Silently skip albums that have left the collection since sharing.
      if (!row) continue;
      albums.push({
        title: row.title,
        artist: row.artist,
        year: row.year,
        cover: row.cover,
        thumb: row.thumb ?? null,
      });
    }

    return {
      name: stack.name,
      last_modified: stack.last_modified,
      albums,
    };
  },
});
