import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const insightAlbum = v.object({
  releaseId: v.number(),
  title: v.string(),
  artist: v.string(),
  cover: v.string(),
  numForSale: v.number(),
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
    mostForSale: insightAlbum,
    hardestToFind: insightAlbum,
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
      updatedAt: args.updatedAt,
    };

    if (existing) {
      await ctx.db.replace(existing._id, data);
    } else {
      await ctx.db.insert("market_insights", data);
    }
  },
});
