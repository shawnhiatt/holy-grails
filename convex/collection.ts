import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogsUsername: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", args.discogsUsername)
      )
      .collect();
  },
});

export const replaceAll = mutation({
  args: {
    discogsUsername: v.string(),
    albums: v.array(
      v.object({
        releaseId: v.number(),
        instanceId: v.number(),
        folderId: v.optional(v.number()),
        artist: v.string(),
        title: v.string(),
        year: v.number(),
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
          v.array(v.object({ name: v.string(), value: v.string() }))
        ),
        dateAdded: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", args.discogsUsername)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const album of args.albums) {
      await ctx.db.insert("collection", {
        discogsUsername: args.discogsUsername,
        ...album,
      });
    }
  },
});

/**
 * Patch a single album document by releaseId + discogsUsername.
 * Used after editing instance fields (condition, notes, folder) in the album detail panel.
 * Does not trigger a full re-sync — only updates the affected document.
 */
export const updateInstance = mutation({
  args: {
    discogsUsername: v.string(),
    releaseId: v.number(),
    mediaCondition: v.optional(v.string()),
    sleeveCondition: v.optional(v.string()),
    notes: v.optional(v.string()),
    folder: v.optional(v.string()),
    folderId: v.optional(v.number()),
    instanceId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("collection")
      .withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", args.discogsUsername).eq("releaseId", args.releaseId)
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
    } = {};
    if (args.mediaCondition !== undefined) patch.mediaCondition = args.mediaCondition;
    if (args.sleeveCondition !== undefined) patch.sleeveCondition = args.sleeveCondition;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.folder !== undefined) patch.folder = args.folder;
    if (args.folderId !== undefined) patch.folderId = args.folderId;
    if (args.instanceId !== undefined) patch.instanceId = args.instanceId;

    await ctx.db.patch(row._id, patch);
  },
});
