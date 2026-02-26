import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByUsername = query({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();
  },
});


export const upsert = mutation({
  args: {
    discogs_username: v.string(),
    discogs_avatar_url: v.optional(v.string()),
    access_token: v.string(),
    token_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        access_token: args.access_token,
        token_secret: args.token_secret,
        discogs_avatar_url: args.discogs_avatar_url,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      discogs_username: args.discogs_username,
      discogs_avatar_url: args.discogs_avatar_url,
      access_token: args.access_token,
      token_secret: args.token_secret,
      created_at: Date.now(),
    });
  },
});

export const updateLastSynced = mutation({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { last_synced_at: Date.now() });
    }
  },
});

export const clearSession = mutation({
  args: { discogs_username: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
