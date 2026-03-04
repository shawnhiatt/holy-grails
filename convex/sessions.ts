import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("sessions")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    session_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const now = Date.now();
    return await ctx.db.insert("sessions", {
      discogs_username: user.discogs_username,
      session_id: args.session_id,
      name: args.name,
      album_ids: args.album_ids,
      created_at: now,
      last_modified: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    session_id: v.string(),
    name: v.optional(v.string()),
    album_ids: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("session_id"), args.session_id))
      .first();

    if (!existing) {
      throw new Error(`Session ${args.session_id} not found`);
    }

    const updates: Record<string, unknown> = { last_modified: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.album_ids !== undefined) updates.album_ids = args.album_ids;

    await ctx.db.patch(existing._id, updates);
    return existing._id;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), session_id: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("session_id"), args.session_id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
