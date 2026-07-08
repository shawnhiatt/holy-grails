import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

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
        pricePaid: v.string(),
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

const albumFields = {
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
  pricePaid: v.string(),
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
};

// Fields compared to decide whether an existing row needs patching during a
// diff sync. Identity/display fields are included; releaseId is the key.
type AlbumInput = {
  releaseId: number;
  masterId?: number;
  instanceId: number;
  folderId?: number;
  artist: string;
  title: string;
  year: number;
  thumb?: string;
  cover: string;
  folder: string;
  label: string;
  catalogNumber: string;
  format: string;
  mediaCondition: string;
  sleeveCondition: string;
  pricePaid: string;
  notes: string;
  customFields?: { name: string; value: string; fieldId?: number; type?: string; options?: string[] }[];
  dateAdded: string;
};

function albumSignature(a: AlbumInput | Record<string, unknown>): string {
  return JSON.stringify([
    (a as AlbumInput).masterId ?? null,
    (a as AlbumInput).instanceId,
    (a as AlbumInput).folderId ?? null,
    (a as AlbumInput).artist,
    (a as AlbumInput).title,
    (a as AlbumInput).year,
    (a as AlbumInput).thumb ?? null,
    (a as AlbumInput).cover,
    (a as AlbumInput).folder,
    (a as AlbumInput).label,
    (a as AlbumInput).catalogNumber,
    (a as AlbumInput).format,
    (a as AlbumInput).mediaCondition,
    (a as AlbumInput).sleeveCondition,
    (a as AlbumInput).pricePaid,
    (a as AlbumInput).notes,
    (a as AlbumInput).customFields ?? null,
    (a as AlbumInput).dateAdded,
  ]);
}

/**
 * Incremental sync write: reconcile the cached collection against a freshly
 * fetched one without deleting everything first.
 *   - insert releases that are new
 *   - patch releases whose fields changed
 *   - delete releases no longer present
 * Avoids the empty-state flash and write churn of replaceAll, and lets a
 * background sync update the cache invisibly under the user.
 */
export const applyDiff = mutation({
  args: {
    sessionToken: v.string(),
    albums: v.array(v.object(albumFields)),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", user.discogs_username)
      )
      .collect();

    const existingByRelease = new Map(existing.map((row) => [row.releaseId, row]));
    const incomingIds = new Set<number>();
    let added = 0;
    let removed = 0;
    let updated = 0;

    for (const album of args.albums) {
      incomingIds.add(album.releaseId);
      const row = existingByRelease.get(album.releaseId);
      if (!row) {
        await ctx.db.insert("collection", {
          discogsUsername: user.discogs_username,
          ...album,
        });
        added++;
      } else if (albumSignature(row as unknown as AlbumInput) !== albumSignature(album)) {
        await ctx.db.patch(row._id, album);
        updated++;
      }
    }

    for (const row of existing) {
      if (!incomingIds.has(row.releaseId)) {
        await ctx.db.delete(row._id);
        removed++;
      }
    }

    return { added, removed, updated };
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
    } = {};
    if (args.mediaCondition !== undefined) patch.mediaCondition = args.mediaCondition;
    if (args.sleeveCondition !== undefined) patch.sleeveCondition = args.sleeveCondition;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.folder !== undefined) patch.folder = args.folder;
    if (args.folderId !== undefined) patch.folderId = args.folderId;
    if (args.instanceId !== undefined) patch.instanceId = args.instanceId;
    if (args.customFields !== undefined) patch.customFields = args.customFields;

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
    pricePaid: v.string(),
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
      pricePaid: args.pricePaid,
      notes: args.notes,
      customFields: args.customFields,
      dateAdded: args.dateAdded,
    });
  },
});
