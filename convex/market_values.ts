import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { authenticateUser } from "./authHelper";

/* Shared per-release market value (Spec 6A.1). One row per Discogs `releaseId`,
   shared across every user who owns that release. The daily marketValueDrip
   (convex/discogs.ts) seeds this set from collections and fills prices; the
   Insights UI (Session B) reads them via getForUser. See
   docs/market-value-drip.md. */

/**
 * Ensure a `market_values` row exists for every release any user owns, and
 * migrate any values already collected on the legacy per-user collection
 * fields. Internal-only; the drip calls this at the top of each run so the
 * shared set stays current (new releases from syncs get picked up) without
 * touching the sync write path.
 *
 * Cost is O(collection + market_values) rows in a single transaction — fine at
 * the current scale; see the scaling note in docs/market-value-drip.md for the
 * paginated version if the collection ever outgrows a mutation's limits.
 */
export const seedFromCollection = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("market_values").collect();
    const seen = new Set(existing.map((r) => r.releaseId));

    const collection = await ctx.db.query("collection").collect();
    let added = 0;
    for (const row of collection) {
      if (seen.has(row.releaseId)) continue;
      seen.add(row.releaseId);
      // Carry over a value already collected on the legacy per-user field so
      // the one-time migration doesn't re-fetch what we already have.
      await ctx.db.insert("market_values", {
        releaseId: row.releaseId,
        value: row.marketValue,
        fetchedAt: row.marketValueFetchedAt,
      });
      added++;
    }
    return { added };
  },
});

/**
 * A batch of releases due for a price fetch: rows whose value is missing or
 * older than `staleBefore`, ordered by `fetchedAt` ascending so never-fetched
 * (undefined sorts first) come before the stalest. No cursor — fetched rows get
 * a fresh `fetchedAt` and move to the back of the ordering naturally.
 */
export const getDripBatch = internalQuery({
  args: { staleBefore: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("market_values")
      .withIndex("by_fetchedAt")
      .order("asc")
      .filter((q) =>
        q.or(
          q.eq(q.field("fetchedAt"), undefined),
          q.lt(q.field("fetchedAt"), args.staleBefore)
        )
      )
      .take(args.limit);
    return rows.map((r) => ({ releaseId: r.releaseId }));
  },
});

/**
 * Record the outcome of a fetch attempt. `fetchedAt` is always advanced (so a
 * failing release moves to the back of the queue and doesn't clog the batch);
 * `value` is written only when provided (success), preserving any prior value
 * on a transient failure. `value` may be a number or null (no active listings).
 */
export const setValue = internalMutation({
  args: {
    releaseId: v.number(),
    fetchedAt: v.number(),
    value: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("market_values")
      .withIndex("by_release", (q) => q.eq("releaseId", args.releaseId))
      .first();
    if (!row) return;
    const patch: { fetchedAt: number; value?: number | null } = {
      fetchedAt: args.fetchedAt,
    };
    if (args.value !== undefined) patch.value = args.value;
    await ctx.db.patch(row._id, patch);
  },
});

/**
 * Market values for the authenticated user's collection, keyed by releaseId.
 * Public read for the Insights value sections (Session B). Values are public
 * marketplace reference data (release → lowest ask), not user data — but this
 * is still scoped to the caller's own releases and requires auth.
 *
 * Two table scans, joined in memory — deliberately NOT one indexed lookup per
 * owned release. This is a reactive subscription that re-runs on every
 * collection change, and the point-lookup version issued one index range per
 * row: a 3,000-release collection spent 3,001 of Convex's 4,096 index ranges
 * per execution, so a large enough collection would have stopped resolving
 * rather than merely running slow. The join reads the same rows in 2 ranges.
 * (Scan-vs-lookup on `market_values` trades M point reads for the whole shared
 * table; see the scaling note in docs/market-value-drip.md for when that flips.)
 */
export const getForUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const owned = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", user.discogs_username))
      .collect();

    // First row wins per releaseId, matching the `.first()` this replaced.
    const priced = new Map<number, { value: number | null; fetchedAt: number }>();
    for (const mv of await ctx.db.query("market_values").collect()) {
      if (mv.value === undefined || mv.fetchedAt === undefined) continue;
      if (priced.has(mv.releaseId)) continue;
      priced.set(mv.releaseId, { value: mv.value, fetchedAt: mv.fetchedAt });
    }

    const out: { releaseId: number; value: number | null; fetchedAt: number }[] = [];
    for (const row of owned) {
      const mv = priced.get(row.releaseId);
      if (mv) out.push({ releaseId: row.releaseId, value: mv.value, fetchedAt: mv.fetchedAt });
    }
    return out;
  },
});
