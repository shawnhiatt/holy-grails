import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { authenticateUser } from "./authHelper";
import { albumSignature, collectionRowFields } from "./cacheRows";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The window `changeSummary` counts over. */
export const CHANGE_WINDOW_DAYS = 30;
/** How long a removal stays in the log; older rows are pruned on write. */
export const REMOVAL_RETENTION_DAYS = 90;
/** Old rows pruned per write. A steady trickle keeps up; the cap keeps a write cheap. */
const PRUNE_BATCH = 50;

/**
 * Log one cached row leaving the collection, for `changeSummary`. Called only
 * where a row is really deleted: the sync's diff and removeItem, never
 * replaceAll (a full replace isn't a removal). A copy leaves once — Discogs
 * gives a re-added copy a new instanceId — so a second log for the same
 * (releaseId, instanceId) is a confirmation, not another removal.
 */
async function logRemoval(ctx: MutationCtx, row: Doc<"collection">) {
  const now = Date.now();
  const logged = await ctx.db
    .query("collection_removals")
    .withIndex("by_username_and_release", (q) =>
      q.eq("discogsUsername", row.discogsUsername).eq("releaseId", row.releaseId)
    )
    .collect();
  if (!logged.some((r) => r.instanceId === row.instanceId)) {
    await ctx.db.insert("collection_removals", {
      discogsUsername: row.discogsUsername,
      releaseId: row.releaseId,
      instanceId: row.instanceId,
      removedAt: now,
    });
  }

  const stale = await ctx.db
    .query("collection_removals")
    .withIndex("by_username_and_removedAt", (q) =>
      q.eq("discogsUsername", row.discogsUsername).lt("removedAt", now - REMOVAL_RETENTION_DAYS * DAY_MS)
    )
    .take(PRUNE_BATCH);
  for (const r of stale) await ctx.db.delete(r._id);
}

/**
 * `dateAdded` in ms. Discogs sends a full ISO timestamp; a bare date reads as
 * UTC midnight. NaN for anything unparseable, which never counts.
 */
function addedAt(dateAdded: string): number {
  return Date.parse(dateAdded.trim());
}

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", user.discogs_username)
      )
      .collect();
  },
});

/**
 * Free data (Session Builder phase 1): fields the Discogs collection response
 * already returns and the app used to discard. All optional — rows written
 * before this change read undefined and backfill on the user's next sync.
 * `rating` is never 0 here: the mapper drops Discogs' 0-means-unrated.
 */
const freeDataFields = {
  genres: v.optional(v.array(v.string())),
  styles: v.optional(v.array(v.string())),
  rating: v.optional(v.number()),
  discCount: v.optional(v.number()),
  artistIds: v.optional(v.array(v.number())),
};

export const replaceAll = mutation({
  args: {
    sessionToken: v.string(),
    albums: v.array(
      v.object({
        releaseId: v.number(),
        masterId: v.optional(v.number()),
        instanceId: v.number(),
        folderId: v.optional(v.number()),
        artist: v.string(),
        title: v.string(),
        year: v.number(),
        thumb: v.optional(v.string()),
        cover: v.string(),
        folder: v.string(),
        label: v.string(),
        catalogNumber: v.string(),
        format: v.string(),
        mediaCondition: v.string(),
        sleeveCondition: v.string(),
        notes: v.string(),
        customFields: v.optional(
          v.array(v.object({
            name: v.string(),
            value: v.string(),
            fieldId: v.optional(v.number()),
            type: v.optional(v.string()),
            options: v.optional(v.array(v.string())),
          }))
        ),
        dateAdded: v.string(),
        ...freeDataFields,
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", user.discogs_username)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const album of args.albums) {
      await ctx.db.insert("collection", {
        discogsUsername: user.discogs_username,
        ...album,
      });
    }
  },
});


/** Rows per page when the sync reads the cache's signatures. */
const SIGNATURE_PAGE_SIZE = 500;

/**
 * The sync's read of the cache: one page of (id, releaseId, signature). The
 * action pages through this, plans the diff in cacheRows.ts, and writes it
 * back through applySyncChunk — see chunkCacheDiff for why the reconcile no
 * longer happens inside one mutation. Internal: the username comes from the
 * action's own credential lookup, never from a client.
 */
export const syncSignaturesPage = internalQuery({
  args: { username: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", args.username))
      .paginate({ numItems: SIGNATURE_PAGE_SIZE, cursor: args.cursor });
    return {
      page: result.page.map((row) => ({
        id: row._id,
        key: row.releaseId,
        signature: albumSignature(row),
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Apply one chunk of a planned sync diff. Every write re-checks ownership and
 * existence, because the plan was made from an earlier read: a row another
 * sync already deleted is re-inserted rather than patched, and an insert whose
 * release another sync already cached patches that row instead of duplicating
 * it.
 */
export const applySyncChunk = internalMutation({
  args: {
    username: v.string(),
    inserts: v.array(v.object(collectionRowFields)),
    patches: v.array(v.object({ id: v.id("collection"), row: v.object(collectionRowFields) })),
    deletes: v.array(v.id("collection")),
  },
  handler: async (ctx, args) => {
    const upsert = async (row: (typeof args.inserts)[number]) => {
      const existing = await ctx.db
        .query("collection")
        .withIndex("by_username_and_release", (q) =>
          q.eq("discogsUsername", args.username).eq("releaseId", row.releaseId)
        )
        .first();
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("collection", { discogsUsername: args.username, ...row });
    };

    for (const row of args.inserts) await upsert(row);
    for (const { id, row } of args.patches) {
      const existing = await ctx.db.get(id);
      if (existing && existing.discogsUsername === args.username) await ctx.db.patch(id, row);
      else await upsert(row);
    }
    for (const id of args.deletes) {
      const existing = await ctx.db.get(id);
      if (existing && existing.discogsUsername === args.username) {
        await ctx.db.delete(id);
        await logRemoval(ctx, existing);
      }
    }
  },
});

/**
 * Patch a single album document by releaseId.
 * Used after editing instance fields (condition, notes, folder) in the album detail panel.
 * Does not trigger a full re-sync — only updates the affected document.
 */
export const updateInstance = mutation({
  args: {
    sessionToken: v.string(),
    releaseId: v.number(),
    mediaCondition: v.optional(v.string()),
    sleeveCondition: v.optional(v.string()),
    notes: v.optional(v.string()),
    folder: v.optional(v.string()),
    folderId: v.optional(v.number()),
    instanceId: v.optional(v.number()),
    customFields: v.optional(v.array(v.object({
      name: v.string(),
      value: v.string(),
      fieldId: v.optional(v.number()),
      type: v.optional(v.string()),
      options: v.optional(v.array(v.string())),
    }))),
    // The user's 1–5 star rating. The only free-data field that is editable —
    // genres/styles/discCount/artistIds come from Discogs and are sync-only.
    // Pass 0 to clear the rating (stored as the field's absence, since 0 is
    // Discogs' "unrated" sentinel and must never be written as a value).
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const row = await ctx.db
      .query("collection")
      .withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", user.discogs_username).eq("releaseId", args.releaseId)
      )
      .first();

    if (!row) return;

    const patch: {
      mediaCondition?: string;
      sleeveCondition?: string;
      notes?: string;
      folder?: string;
      folderId?: number;
      instanceId?: number;
      customFields?: { name: string; value: string; fieldId?: number; type?: string; options?: string[] }[];
      rating?: number;
    } = {};
    if (args.mediaCondition !== undefined) patch.mediaCondition = args.mediaCondition;
    if (args.sleeveCondition !== undefined) patch.sleeveCondition = args.sleeveCondition;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.folder !== undefined) patch.folder = args.folder;
    if (args.folderId !== undefined) patch.folderId = args.folderId;
    if (args.instanceId !== undefined) patch.instanceId = args.instanceId;
    if (args.customFields !== undefined) patch.customFields = args.customFields;
    // 0 clears the rating: patching a field to undefined removes it, which is
    // exactly how "unrated" is represented.
    if (args.rating !== undefined) patch.rating = args.rating > 0 ? args.rating : undefined;

    await ctx.db.patch(row._id, patch);
  },
});

/**
 * Rename a folder across all cached collection rows. Called after a Discogs
 * folder rename so the cache (which client album state is reactively derived
 * from) never resurfaces the old name.
 */
export const renameFolderInCache = mutation({
  args: {
    sessionToken: v.string(),
    folderId: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", user.discogs_username)
      )
      .collect();
    for (const row of rows) {
      if (row.folderId === args.folderId) {
        await ctx.db.patch(row._id, { folder: args.name });
      }
    }
  },
});

/** Remove a single album from the collection cache by releaseId. */
export const removeItem = mutation({
  args: {
    sessionToken: v.string(),
    releaseId: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const row = await ctx.db
      .query("collection")
      .withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", user.discogs_username).eq("releaseId", args.releaseId)
      )
      .first();
    if (!row) return;
    await ctx.db.delete(row._id);
    await logRemoval(ctx, row);
  },
});

/**
 * The native Feed's 30-day change chips ("+6", "−2 in 30 days", "Last change
 * Aug 2"). `added30` counts `dateAdded` in the window, as the app's
 * RecentAdds does; `removed30` counts the removal log. `lastChangeAt` is the
 * newest add or logged removal in ms, or null when there is neither. Removals
 * are only known from when logging began, and for 90 days.
 */
export const changeSummary = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const username = user.discogs_username;
    const cutoff = Date.now() - CHANGE_WINDOW_DAYS * DAY_MS;

    const rows = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", username))
      .collect();
    let added30 = 0;
    let lastAdd: number | null = null;
    for (const row of rows) {
      const at = addedAt(row.dateAdded);
      if (Number.isNaN(at)) continue;
      if (at >= cutoff) added30++;
      if (lastAdd === null || at > lastAdd) lastAdd = at;
    }

    const removed = await ctx.db
      .query("collection_removals")
      .withIndex("by_username_and_removedAt", (q) =>
        q.eq("discogsUsername", username).gte("removedAt", cutoff)
      )
      .collect();
    const lastRemoval = await ctx.db
      .query("collection_removals")
      .withIndex("by_username_and_removedAt", (q) => q.eq("discogsUsername", username))
      .order("desc")
      .first();

    const candidates = [lastAdd, lastRemoval?.removedAt ?? null].filter((n): n is number => n !== null);
    return {
      added30,
      removed30: removed.length,
      lastChangeAt: candidates.length ? Math.max(...candidates) : null,
    };
  },
});

/** Insert a single album into the collection cache (after "Add to Collection" action). */
export const addItem = mutation({
  args: {
    sessionToken: v.string(),
    releaseId: v.number(),
    masterId: v.optional(v.number()),
    instanceId: v.number(),
    folderId: v.optional(v.number()),
    artist: v.string(),
    title: v.string(),
    year: v.number(),
    thumb: v.optional(v.string()),
    cover: v.string(),
    folder: v.string(),
    label: v.string(),
    catalogNumber: v.string(),
    format: v.string(),
    mediaCondition: v.string(),
    sleeveCondition: v.string(),
    notes: v.string(),
    customFields: v.optional(
      v.array(v.object({
        name: v.string(),
        value: v.string(),
        fieldId: v.optional(v.number()),
        type: v.optional(v.string()),
        options: v.optional(v.array(v.string())),
      }))
    ),
    dateAdded: v.string(),
    ...freeDataFields,
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    await ctx.db.insert("collection", {
      discogsUsername: user.discogs_username,
      releaseId: args.releaseId,
      masterId: args.masterId,
      instanceId: args.instanceId,
      folderId: args.folderId,
      artist: args.artist,
      title: args.title,
      year: args.year,
      thumb: args.thumb,
      cover: args.cover,
      folder: args.folder,
      label: args.label,
      catalogNumber: args.catalogNumber,
      format: args.format,
      mediaCondition: args.mediaCondition,
      sleeveCondition: args.sleeveCondition,
      notes: args.notes,
      customFields: args.customFields,
      dateAdded: args.dateAdded,
      genres: args.genres,
      styles: args.styles,
      rating: args.rating,
      discCount: args.discCount,
      artistIds: args.artistIds,
    });
  },
});
