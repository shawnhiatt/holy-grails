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
