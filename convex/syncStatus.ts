import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { authenticateUser } from "./authHelper";

/**
 * Live sync progress, written by the server-side sync loop in
 * convex/discogs.ts (syncSelf) and subscribed to by the client so the
 * loading screen / background chip can show per-page progress again.
 */

export const get = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("sync_status")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .first();
  },
});

export const set = internalMutation({
  args: {
    username: v.string(),
    phase: v.string(),
    current: v.optional(v.number()),
    total: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sync_status")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.username)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        phase: args.phase,
        current: args.current,
        total: args.total,
        updated_at: Date.now(),
      });
    } else {
      await ctx.db.insert("sync_status", {
        discogs_username: args.username,
        phase: args.phase,
        current: args.current,
        total: args.total,
        updated_at: Date.now(),
      });
    }
  },
});
