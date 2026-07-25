import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";
import { evaluateStackRule, type RuleAlbum, type StackRule } from "./stackRules";

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

/**
 * A session's saved query. Loose `field`/`op` strings so a new operator ships
 * without a schema deploy — the pure evaluator in stackRules.ts ignores what
 * it doesn't recognize.
 */
const ruleValidator = v.object({
  match: v.union(v.literal("all"), v.literal("any")),
  conditions: v.array(
    v.object({
      field: v.string(),
      op: v.string(),
      value: v.optional(v.any()),
    })
  ),
  sort: v.string(),
  limit: v.optional(v.number()),
  rotation: v.union(v.literal("off"), v.literal("daily"), v.literal("weekly")),
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
    // Session Builder. Omitted entirely for a hand-filled session, which is
    // why `kind` is optional rather than defaulted — undefined reads manual.
    kind: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
    rule: v.optional(ruleValidator),
    name_generated: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const now = Date.now();
    return await ctx.db.insert("stacks", {
      discogs_username: user.discogs_username,
      stack_id: args.stack_id,
      name: args.name,
      // An auto session stores no ids: membership is derived from the rule at
      // read time, so a cached copy here would be a second source of truth
      // that drifts the moment the collection changes.
      album_ids: args.kind === "auto" ? [] : args.album_ids,
      created_at: now,
      last_modified: now,
      ...(args.kind && { kind: args.kind }),
      ...(args.rule && { rule: args.rule }),
      ...(args.name_generated && { name_generated: args.name_generated }),
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.optional(v.string()),
    album_ids: v.optional(v.array(v.number())),
    rule: v.optional(ruleValidator),
    excluded_ids: v.optional(v.array(v.number())),
    name_generated: v.optional(v.string()),
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
    if (args.rule !== undefined) updates.rule = args.rule;
    if (args.excluded_ids !== undefined) updates.excluded_ids = args.excluded_ids;
    if (args.name_generated !== undefined) updates.name_generated = args.name_generated;

    await ctx.db.patch(existing._id, updates);
    return existing._id;
  },
});

/**
 * Freeze an auto session: materialize the records it currently plays into
 * `album_ids` and drop the rule, leaving an ordinary hand-filled session.
 *
 * The caller passes the ids because it has already evaluated the rule for
 * display — re-deriving them here would mean duplicating the client's purge
 * tags and play history server-side, and could disagree with what the user is
 * looking at. This is the "I love today's roll — keep it" escape hatch from
 * rotation, and it is deliberately one-way: unfreezing is just building a new
 * rule.
 */
export const freeze = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    album_ids: v.array(v.number()),
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

    await ctx.db.patch(existing._id, {
      album_ids: args.album_ids,
      kind: "manual",
      rule: undefined,
      excluded_ids: undefined,
      name_generated: undefined,
      last_modified: Date.now(),
    });
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

// ── Session sharing (capability-token share links) ──
// See the Sessions naming note in CLAUDE.md: internal identifiers stay
// stack*/share*; user-facing copy says "Session".

/**
 * Turn on a public share link for a session. Idempotent — returns the
 * existing share_id if one is already set. The share_id is unguessable
 * (128-bit, crypto-random) and IS the capability that grants read access.
 */
export const enableShare = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args): Promise<string> => {
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
    if (existing.share_id) {
      return existing.share_id;
    }

    // 32 hex chars = 128 bits of entropy — unguessable.
    const shareId = crypto.randomUUID().replace(/-/g, "");
    await ctx.db.patch(existing._id, { share_id: shareId });
    return shareId;
  },
});

/** Revoke a session's share link. */
export const disableShare = mutation({
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

    if (existing && existing.share_id) {
      await ctx.db.patch(existing._id, { share_id: undefined });
    }
  },
});

/**
 * Public read of a shared session. Deliberately UNAUTHENTICATED — the
 * unguessable share_id is the capability. Mirrors the Cross-User Data
 * Pattern's "null for not-found and not-shared alike": returns null for an
 * unknown/revoked share_id.
 *
 * Returns ONLY the whitelisted display fields. Never exposes
 * discogs_username, release ids, purge tags, notes, conditions, price paid,
 * or any token. Albums that have left the collection since sharing are
 * silently skipped.
 */
export const getShared = query({
  args: { share_id: v.string() },
  handler: async (ctx, args) => {
    if (!args.share_id) return null;

    const stack = await ctx.db
      .query("stacks")
      .withIndex("by_share_id", (q) => q.eq("share_id", args.share_id))
      .first();

    if (!stack) return null;

    /** The whitelist. Adding a field here widens what a link exposes. */
    const display = (row: {
      title: string;
      artist: string;
      year: number;
      cover: string;
      thumb?: string;
    }) => ({
      title: row.title,
      artist: row.artist,
      year: row.year,
      cover: row.cover,
      thumb: row.thumb ?? null,
    });

    // ── An auto session has no stored ids: evaluate its rule server-side ──
    //
    // This is the reason the free-data pass wrote genres and rating into the
    // Convex table rather than only onto the client `Album` type. The pure
    // evaluator runs over both shapes, so a shared link shows exactly what
    // the owner sees — including the same rotation roll, since the seeded
    // bucket is a function of the session id and the clock, not of state.
    if (stack.kind === "auto" && stack.rule) {
      const rows = await ctx.db
        .query("collection")
        .withIndex("by_username", (q) =>
          q.eq("discogsUsername", stack.discogs_username)
        )
        .collect();

      // Purge tags and play history live in their own tables; a rule can key
      // on either, so they are folded in the same way the client does.
      const tags = await ctx.db
        .query("purge_tags")
        .withIndex("by_username", (q) =>
          q.eq("discogs_username", stack.discogs_username)
        )
        .collect();
      const tagByRelease = new Map(tags.map((t) => [t.release_id, t.tag]));

      const plays = await ctx.db
        .query("last_played")
        .withIndex("by_username", (q) =>
          q.eq("discogs_username", stack.discogs_username)
        )
        .collect();
      const playCount = new Map<number, number>();
      const lastPlayedAt = new Map<number, number>();
      for (const p of plays) {
        playCount.set(p.release_id, (playCount.get(p.release_id) ?? 0) + 1);
        lastPlayedAt.set(
          p.release_id,
          Math.max(lastPlayedAt.get(p.release_id) ?? 0, p.played_at)
        );
      }

      // Market values are only loaded when the rule actually asks for them —
      // it is the one input that needs a whole-table read, and almost no
      // session is built on price.
      const usesMarketValue = stack.rule.conditions.some(
        (c) => c.field === "marketValue"
      );
      const marketByRelease = new Map<number, number | null>();
      if (usesMarketValue) {
        for (const mv of await ctx.db.query("market_values").collect()) {
          if (mv.value !== undefined) marketByRelease.set(mv.releaseId, mv.value);
        }
      }

      const ruleAlbums: RuleAlbum[] = rows.map((row) => ({
        releaseId: row.releaseId,
        artist: row.artist,
        artistIds: row.artistIds,
        title: row.title,
        label: row.label,
        year: row.year,
        genres: row.genres,
        styles: row.styles,
        format: row.format,
        folder: row.folder,
        mediaCondition: row.mediaCondition,
        rating: row.rating,
        dateAdded: row.dateAdded,
        purgeTag: tagByRelease.get(row.releaseId) ?? null,
        lastPlayedAt: lastPlayedAt.get(row.releaseId) ?? null,
        playCount: playCount.get(row.releaseId) ?? 0,
        marketValue: marketByRelease.get(row.releaseId),
      }));

      const result = evaluateStackRule(ruleAlbums, stack.rule as StackRule, {
        stackId: stack.stack_id,
        excludedIds: stack.excluded_ids,
      });

      const byRelease = new Map(rows.map((r) => [r.releaseId, r]));
      return {
        name: stack.name,
        last_modified: stack.last_modified,
        albums: result.albums
          .map((a) => byRelease.get(a.releaseId))
          .filter((r): r is NonNullable<typeof r> => !!r)
          .map(display),
      };
    }

    const albums: ReturnType<typeof display>[] = [];

    for (const releaseId of stack.album_ids) {
      const row = await ctx.db
        .query("collection")
        .withIndex("by_username_and_release", (q) =>
          q
            .eq("discogsUsername", stack.discogs_username)
            .eq("releaseId", releaseId)
        )
        .first();
      // Silently skip albums that have left the collection since sharing.
      if (!row) continue;
      albums.push(display(row));
    }

    return {
      name: stack.name,
      last_modified: stack.last_modified,
      albums,
    };
  },
});
