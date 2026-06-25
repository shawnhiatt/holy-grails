import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const now = Date.now();
    return await ctx.db.insert("stacks", {
      discogs_username: user.discogs_username,
      stack_id: args.stack_id,
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
    stack_id: v.string(),
    name: v.optional(v.string()),
    album_ids: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (!existing) {
      throw new Error(`Stack ${args.stack_id} not found`);
    }

    const updates: Record<string, unknown> = { last_modified: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.album_ids !== undefined) updates.album_ids = args.album_ids;

    await ctx.db.patch(existing._id, updates);
    return existing._id;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * One-time migration: copies every row from the legacy `sessions` table into
 * `stacks` (mapping session_id → stack_id) and remaps the `default_screen`
 * preference value "sessions" → "stacks".
 *
 * Copy-only by design — it does NOT delete the legacy rows, so any client still
 * running the pre-rename build keeps reading its data during the rollout. The
 * legacy rows are removed later, in the cleanup step that drops the `sessions`
 * table from the schema.
 *
 * Idempotent: skips any session whose stack_id already exists in `stacks`, so
 * it is safe to run more than once (re-run after the client deploy to catch any
 * last-minute edits made by old clients). Run from the Convex dashboard
 * (Functions → stacks:migrateFromSessions → Run) on dev first, then prod.
 */
export const migrateFromSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oldRows = await ctx.db.query("sessions").collect();

    let migrated = 0;
    let skipped = 0;
    for (const row of oldRows) {
      const already = await ctx.db
        .query("stacks")
        .withIndex("by_username", (q) =>
          q.eq("discogs_username", row.discogs_username)
        )
        .filter((q) => q.eq(q.field("stack_id"), row.session_id))
        .first();

      if (already) {
        skipped++;
      } else {
        await ctx.db.insert("stacks", {
          discogs_username: row.discogs_username,
          stack_id: row.session_id,
          name: row.name,
          album_ids: row.album_ids,
          created_at: row.created_at,
          last_modified: row.last_modified,
        });
        migrated++;
      }
    }

    // Remap any stored default_screen preference from the old route key.
    let prefsRemapped = 0;
    const prefs = await ctx.db.query("preferences").collect();
    for (const p of prefs) {
      if (p.default_screen === "sessions") {
        await ctx.db.patch(p._id, { default_screen: "stacks" });
        prefsRemapped++;
      }
    }

    return { migrated, skipped, prefsRemapped, total: oldRows.length };
  },
});
