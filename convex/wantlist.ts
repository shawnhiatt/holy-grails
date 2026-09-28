import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";
import { wantRowFields, wantSignature } from "./cacheRows";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

/**
 * Free data (Session Builder phase 1): genres/styles/disc count/artist ids off
 * the wantlist response the sync already makes. All optional — rows written
 * before this change read undefined and backfill on the next sync. No
 * `rating`: Discogs only rates copies you own.
 */
const freeDataFields = {
  genres: v.optional(v.array(v.string())),
  styles: v.optional(v.array(v.string())),
  discCount: v.optional(v.number()),
  artistIds: v.optional(v.array(v.number())),
  /** Discogs `date_added`, "YYYY-MM-DD" (same shape `collection` stores).
   *  Powers the identity block's recent-adds delta. Optional for the same
   *  reason as the rest of this block: legacy rows backfill on next sync. */
  dateAdded: v.optional(v.string()),
};

export const replaceAll = mutation({
  args: {
    sessionToken: v.string(),
    items: v.array(
      v.object(wantRowFields)
    ),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const item of args.items) {
      await ctx.db.insert("wantlist", {
        discogs_username: user.discogs_username,
        ...item,
      });
    }
  },
});

/** Rows per page when the sync reads the cache's signatures. */
const SIGNATURE_PAGE_SIZE = 500;

/**
 * The sync's read of the cache — same paged (id, release_id, signature) read
 * as collection.syncSignaturesPage. Internal: the username comes from the
 * action's own credential lookup.
 */
export const syncSignaturesPage = internalQuery({
  args: { username: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) => q.eq("discogs_username", args.username))
      .paginate({ numItems: SIGNATURE_PAGE_SIZE, cursor: args.cursor });
    return {
      page: result.page.map((row) => ({
        id: row._id,
        key: row.release_id,
        signature: wantSignature(row),
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Apply one chunk of a planned wantlist sync diff — same re-checks as
 *  collection.applySyncChunk. */
export const applySyncChunk = internalMutation({
  args: {
    username: v.string(),
    inserts: v.array(v.object(wantRowFields)),
    patches: v.array(v.object({ id: v.id("wantlist"), row: v.object(wantRowFields) })),
    deletes: v.array(v.id("wantlist")),
  },
  handler: async (ctx, args) => {
    const upsert = async (row: (typeof args.inserts)[number]) => {
      const existing = await ctx.db
        .query("wantlist")
        .withIndex("by_username_release", (q) =>
          q.eq("discogs_username", args.username).eq("release_id", row.release_id)
        )
        .first();
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("wantlist", { discogs_username: args.username, ...row });
    };

    for (const row of args.inserts) await upsert(row);
    for (const { id, row } of args.patches) {
      const existing = await ctx.db.get(id);
      if (existing && existing.discogs_username === args.username) await ctx.db.patch(id, row);
      else await upsert(row);
    }
    for (const id of args.deletes) {
      const existing = await ctx.db.get(id);
      if (existing && existing.discogs_username === args.username) await ctx.db.delete(id);
    }
  },
});

export const addItem = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
    master_id: v.optional(v.number()),
    title: v.string(),
    artist: v.string(),
    year: v.number(),
    cover: v.string(),
    thumb: v.optional(v.string()),
    label: v.string(),
    format: v.optional(v.string()),
    ...freeDataFields,
    priority: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    // Check for existing item to avoid duplicates
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username_release", (q) =>
        q.eq("discogs_username", user.discogs_username).eq("release_id", args.release_id)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("wantlist", {
      discogs_username: user.discogs_username,
      release_id: args.release_id,
      master_id: args.master_id,
      title: args.title,
      artist: args.artist,
      year: args.year,
      cover: args.cover,
      thumb: args.thumb,
      label: args.label,
      format: args.format,
      genres: args.genres,
      styles: args.styles,
      discCount: args.discCount,
      artistIds: args.artistIds,
      dateAdded: args.dateAdded,
      priority: args.priority,
    });
  },
});

export const removeItem = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username_release", (q) =>
        q.eq("discogs_username", user.discogs_username).eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
