import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
  },
});

export const replaceAll = mutation({
  args: {
    discogs_username: v.string(),
    items: v.array(
      v.object({
        release_id: v.number(),
        master_id: v.optional(v.number()),
        title: v.string(),
        artist: v.string(),
        year: v.number(),
        cover: v.string(),
        thumb: v.optional(v.string()),
        label: v.string(),
        priority: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const item of args.items) {
      await ctx.db.insert("wantlist", {
        discogs_username: args.discogs_username,
        ...item,
      });
    }
  },
});

export const addItem = mutation({
  args: {
    discogs_username: v.string(),
    release_id: v.number(),
    master_id: v.optional(v.number()),
    title: v.string(),
    artist: v.string(),
    year: v.number(),
    cover: v.string(),
    thumb: v.optional(v.string()),
    label: v.string(),
    priority: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check for existing item to avoid duplicates
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username_release", (q) =>
        q.eq("discogs_username", args.discogs_username).eq("release_id", args.release_id)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("wantlist", {
      discogs_username: args.discogs_username,
      release_id: args.release_id,
      master_id: args.master_id,
      title: args.title,
      artist: args.artist,
      year: args.year,
      cover: args.cover,
      thumb: args.thumb,
      label: args.label,
      priority: args.priority,
    });
  },
});

export const removeItem = mutation({
  args: {
    discogs_username: v.string(),
    release_id: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username_release", (q) =>
        q.eq("discogs_username", args.discogs_username).eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
