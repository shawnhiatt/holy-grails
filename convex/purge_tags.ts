import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("purge_tags")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
  },
});

export const getByRelease = query({
  args: { discogs_username: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", args.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();
  },
});

export const upsert = mutation({
  args: {
    discogs_username: v.string(),
    release_id: v.number(),
    tag: v.union(v.literal("keep"), v.literal("cut"), v.literal("maybe")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", args.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tag: args.tag,
        tagged_at: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("purge_tags", {
      discogs_username: args.discogs_username,
      release_id: args.release_id,
      tag: args.tag,
      tagged_at: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { discogs_username: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", args.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
