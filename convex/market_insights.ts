import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const marketAlbum = v.object({
  releaseId: v.number(),
  title: v.string(),
  artist: v.string(),
  cover: v.string(),
  numForSale: v.number(),
});

const valueAlbum = v.object({
  releaseId: v.number(),
  title: v.string(),
  artist: v.string(),
  cover: v.string(),
  price: v.number(),
});

export const getByUsername = query({
  args: { discogsUsername: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("market_insights")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", args.discogsUsername)
      )
      .first();
  },
});

export const upsert = mutation({
  args: {
    discogsUsername: v.string(),
    mostForSale: marketAlbum,
    hardestToFind: marketAlbum,
    mostValuable: valueAlbum,
    leastValuable: valueAlbum,
    averageValue: v.number(),
    folderValues: v.array(v.object({
      folder: v.string(),
      totalValue: v.number(),
    })),
    albumsAnalyzed: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("market_insights")
      .withIndex("by_username", (q) =>
        q.eq("discogsUsername", args.discogsUsername)
      )
      .first();

    const data = {
      discogsUsername: args.discogsUsername,
      mostForSale: args.mostForSale,
      hardestToFind: args.hardestToFind,
      mostValuable: args.mostValuable,
      leastValuable: args.leastValuable,
      averageValue: args.averageValue,
      folderValues: args.folderValues,
      albumsAnalyzed: args.albumsAnalyzed,
      updatedAt: args.updatedAt,
    };

    if (existing) {
      await ctx.db.replace(existing._id, data);
    } else {
      await ctx.db.insert("market_insights", data);
    }
  },
});
