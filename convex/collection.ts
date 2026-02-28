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
    // Load existing rows before deleting so we can carry over market stats.
    // Market stats are fetched in a separate background pass and must survive
    // collection re-syncs — they're not provided by the Discogs collection API.
    const existing = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", args.discogsUsername)
      )
      .collect();

    // Build a release_id → market stats map from the rows about to be deleted
    const statsMap = new Map<number, {
      numForSale?: number;
      lowestPrice?: number;
      marketStatsUpdatedAt?: number;
    }>();
    for (const row of existing) {
      if (row.marketStatsUpdatedAt !== undefined) {
        statsMap.set(row.releaseId, {
          numForSale: row.numForSale,
          lowestPrice: row.lowestPrice,
          marketStatsUpdatedAt: row.marketStatsUpdatedAt,
        });
      }
    }

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    // Insert new rows, preserving market stats for any release that had them
    for (const album of args.albums) {
      const stats = statsMap.get(album.releaseId);
      await ctx.db.insert("collection", {
        discogsUsername: args.discogsUsername,
        ...album,
        ...(stats ?? {}),
      });
    }
  },
});

export const updateMarketStats = mutation({
  args: {
    discogsUsername: v.string(),
    releaseId: v.number(),
    numForSale: v.number(),
    lowestPrice: v.optional(v.number()),
    marketStatsUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("collection")
      .withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", args.discogsUsername).eq("releaseId", args.releaseId)
      )
      .first();
    if (row) {
      await ctx.db.patch(row._id, {
        numForSale: args.numForSale,
        lowestPrice: args.lowestPrice,
        marketStatsUpdatedAt: args.marketStatsUpdatedAt,
      });
    }
  },
});
