import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("purge_tags")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const getByRelease = query({
  args: { sessionToken: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
    tag: v.union(v.literal("keep"), v.literal("cut"), v.literal("maybe")),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
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
      discogs_username: user.discogs_username,
      release_id: args.release_id,
      tag: args.tag,
      tagged_at: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
