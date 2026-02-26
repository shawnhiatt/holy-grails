import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("preferences")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();
  },
});

export const upsert = mutation({
  args: {
    discogs_username: v.string(),
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
    ),
    hide_purge_indicators: v.optional(v.boolean()),
    hide_gallery_meta: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("preferences")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (args.theme !== undefined) updates.theme = args.theme;
      if (args.hide_purge_indicators !== undefined)
        updates.hide_purge_indicators = args.hide_purge_indicators;
      if (args.hide_gallery_meta !== undefined)
        updates.hide_gallery_meta = args.hide_gallery_meta;

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("preferences", {
      discogs_username: args.discogs_username,
      theme: args.theme ?? "system",
      hide_purge_indicators: args.hide_purge_indicators ?? false,
      hide_gallery_meta: args.hide_gallery_meta ?? false,
    });
  },
});
