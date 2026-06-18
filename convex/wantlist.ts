import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const replaceAll = mutation({
  args: {
    sessionToken: v.string(),
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
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const item of args.items) {
      await ctx.db.insert("wantlist", {
        discogs_username: user.discogs_username,
        ...item,
      });
    }
  },
});

type WantInput = {
  release_id: number;
  master_id?: number;
  title: string;
  artist: string;
  year: number;
  cover: string;
  thumb?: string;
  label: string;
  priority: boolean;
};

function wantSignature(w: WantInput | Record<string, unknown>): string {
  return JSON.stringify([
    (w as WantInput).master_id ?? null,
    (w as WantInput).title,
    (w as WantInput).artist,
    (w as WantInput).year,
    (w as WantInput).cover,
    (w as WantInput).thumb ?? null,
    (w as WantInput).label,
    (w as WantInput).priority,
  ]);
}

/**
 * Incremental wantlist sync write — same insert / patch / delete reconciliation
 * as collection.applyDiff, keyed on release_id. Avoids the empty-state flash and
 * write churn of replaceAll during a background sync.
 */
export const applyDiff = mutation({
  args: {
    sessionToken: v.string(),
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
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();

    const existingByRelease = new Map(existing.map((row) => [row.release_id, row]));
    const incomingIds = new Set<number>();

    for (const item of args.items) {
      incomingIds.add(item.release_id);
      const row = existingByRelease.get(item.release_id);
      if (!row) {
        await ctx.db.insert("wantlist", {
          discogs_username: user.discogs_username,
          ...item,
        });
      } else if (wantSignature(row as unknown as WantInput) !== wantSignature(item)) {
        await ctx.db.patch(row._id, item);
      }
    }

    for (const row of existing) {
      if (!incomingIds.has(row.release_id)) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

export const addItem = mutation({
  args: {
    sessionToken: v.string(),
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
    const user = await authenticateUser(ctx, args.sessionToken);
    // Check for existing item to avoid duplicates
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username_release", (q) =>
        q.eq("discogs_username", user.discogs_username).eq("release_id", args.release_id)
      )
      .first();

    if (existing) return;

    await ctx.db.insert("wantlist", {
      discogs_username: user.discogs_username,
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
    sessionToken: v.string(),
    release_id: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("wantlist")
      .withIndex("by_username_release", (q) =>
        q.eq("discogs_username", user.discogs_username).eq("release_id", args.release_id)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
