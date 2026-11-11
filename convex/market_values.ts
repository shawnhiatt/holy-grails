import { v } from "convex/values";
import { query, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { authenticateUser } from "./authHelper";

/* Shared per-release market value (Spec 6A.1). One row per Discogs `releaseId`,
   shared across every user who owns that release. The daily marketValueDrip
   (convex/discogs.ts) seeds this set from collections and fills prices; the
   Insights UI (Session B) reads them via getForUser. See
   docs/market-value-drip.md. */

/**
 * Above this many distinct releases a read stops using one `by_release` lookup
 * each and falls back to a single scan of the table. Each lookup is an index
 * range and a query execution is capped at 4,096 of them (the session and user
 * reads take a few more), so the lookup path has to stop well short. A
 * wantlist almost never gets near it; a collection of a few thousand can.
 */
const LOOKUP_LIMIT = 1000;

type PricedRow = { value: number | null; fetchedAt: number; numForSale?: number };

/**
 * Priced `market_values` rows for the given releases. Priced means both
 * `value` and `fetchedAt` are set (`value: null` = fetched, no listings;
 * never-fetched rows are left out). First row wins per releaseId, as the scan
 * it replaced did.
 *
 * Normal path: one `by_release` lookup per distinct release, so a read touches
 * only the rows it needs however large the shared table grows (it holds every
 * user's releases, and the drip keeps adding to it). Lookups are the fix for
 * the whole-table `.collect()` this used to do on every wantlist and
 * collection change, for every connected user.
 *
 * Past LOOKUP_LIMIT releases it scans the table once instead: one index range
 * rather than thousands. That is the old shape, kept only for the largest
 * collections, where the user's own releases are a big share of the table
 * anyway. Capping the list instead would silently drop prices.
 */
async function pricedByRelease(
  ctx: QueryCtx,
  releaseIds: Iterable<number>
): Promise<Map<number, PricedRow>> {
  const ids = [...new Set(releaseIds)];
  const priced = new Map<number, PricedRow>();
  const keep = (mv: Doc<"market_values">) => {
    if (mv.value === undefined || mv.fetchedAt === undefined) return;
    if (priced.has(mv.releaseId)) return;
    priced.set(mv.releaseId, {
      value: mv.value,
      fetchedAt: mv.fetchedAt,
      ...(mv.numForSale !== undefined ? { numForSale: mv.numForSale } : {}),
    });
  };

  if (ids.length <= LOOKUP_LIMIT) {
    const rows = await Promise.all(
      ids.map((releaseId) =>
        ctx.db
          .query("market_values")
          .withIndex("by_release", (q) => q.eq("releaseId", releaseId))
          .first()
      )
    );
    for (const mv of rows) if (mv) keep(mv);
  } else {
    for (const mv of await ctx.db.query("market_values").collect()) keep(mv);
  }
  return priced;
}

/**
 * Ensure a `market_values` row exists for every release any user owns or
 * wants, keep each row's `wanted` flag in sync with the wantlists, and migrate
 * any values already collected on the legacy per-user collection fields.
 * Internal-only; the drip calls this at the top of each run so the shared set
 * stays current (new releases from syncs get picked up) without touching the
 * sync write path. (The name predates wantlists; kept so nothing renames.)
 *
 * `wanted` is patched only on rows whose flag changes, so a steady-state run
 * writes nothing. A release nobody wants any more gets `wanted: false` and
 * falls back to the monthly cycle; its row stays (rows are never deleted).
 *
 * Cost is O(collection + wantlist + market_values) rows in a single
 * transaction — fine at the current scale; see the scaling note in
 * docs/market-value-drip.md for the paginated version if the set ever
 * outgrows a mutation's limits.
 */
export const seedFromCollection = internalMutation({
  args: {},
  handler: async (ctx) => {
    const wantedIds = new Set(
      (await ctx.db.query("wantlist").collect()).map((w) => w.release_id)
    );

    const existing = await ctx.db.query("market_values").collect();
    const seen = new Set<number>();
    let wantedChanged = 0;
    for (const row of existing) {
      seen.add(row.releaseId);
      const shouldBe = wantedIds.has(row.releaseId);
      if ((row.wanted === true) !== shouldBe) {
        await ctx.db.patch(row._id, { wanted: shouldBe });
        wantedChanged++;
      }
    }

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
        ...(wantedIds.has(row.releaseId) ? { wanted: true } : {}),
      });
      added++;
    }

    // Wanted releases nobody owns: never fetched, so first in line.
    for (const releaseId of wantedIds) {
      if (seen.has(releaseId)) continue;
      seen.add(releaseId);
      await ctx.db.insert("market_values", { releaseId, wanted: true });
      added++;
    }
    return { added, wantedChanged };
  },
});

/**
 * A batch of releases due for a price fetch, two queues in one:
 *   1. wanted releases never fetched or older than `wantedStaleBefore`
 *      (weekly), stalest first;
 *   2. then any release never fetched or older than `staleBefore` (monthly),
 *      stalest first, filling the rest of `limit`.
 * No duplicates. No cursor — fetched rows get a fresh `fetchedAt` and move to
 * the back of both orderings naturally. Without `wantedStaleBefore` it's the
 * single monthly queue.
 */
export const getDripBatch = internalQuery({
  args: {
    staleBefore: v.number(),
    limit: v.number(),
    wantedStaleBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const picked: number[] = [];
    const seen = new Set<number>();

    if (args.wantedStaleBefore !== undefined) {
      const cutoff = args.wantedStaleBefore;
      // undefined (never fetched) sorts before every number in an index, so
      // the `lt` range covers it too.
      const wanted = await ctx.db
        .query("market_values")
        .withIndex("by_wanted_fetchedAt", (q) => q.eq("wanted", true).lt("fetchedAt", cutoff))
        .order("asc")
        .take(args.limit);
      for (const r of wanted) {
        picked.push(r.releaseId);
        seen.add(r.releaseId);
      }
    }

    const remaining = args.limit - picked.length;
    if (remaining > 0) {
      // Over-fetch by what's already picked, so skipping duplicates can't
      // leave the batch short.
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
        .take(remaining + picked.length);
      for (const r of rows) {
        if (picked.length >= args.limit) break;
        if (seen.has(r.releaseId)) continue;
        picked.push(r.releaseId);
        seen.add(r.releaseId);
      }
    }
    return picked.map((releaseId) => ({ releaseId }));
  },
});

/**
 * Record the outcome of a fetch attempt. `fetchedAt` is always advanced (so a
 * failing release moves to the back of the queue and doesn't clog the batch);
 * `value` is written only when provided (success), preserving any prior value
 * on a transient failure. `value` may be a number or null (no active listings).
 * `numForSale` follows `value`: written with it on success, kept on failure.
 */
export const setValue = internalMutation({
  args: {
    releaseId: v.number(),
    fetchedAt: v.number(),
    value: v.optional(v.union(v.number(), v.null())),
    numForSale: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("market_values")
      .withIndex("by_release", (q) => q.eq("releaseId", args.releaseId))
      .first();
    if (!row) return;
    const patch: { fetchedAt: number; value?: number | null; numForSale?: number } = {
      fetchedAt: args.fetchedAt,
    };
    if (args.value !== undefined) patch.value = args.value;
    if (args.numForSale !== undefined) patch.numForSale = args.numForSale;
    await ctx.db.patch(row._id, patch);
  },
});

/**
 * Market values for the authenticated user's collection, keyed by releaseId.
 * Public read for the Insights value sections (Session B). Values are public
 * marketplace reference data (release → lowest ask), not user data — but this
 * is still scoped to the caller's own releases and requires auth.
 *
 * Looks the caller's releases up through `by_release` (see pricedByRelease),
 * so the read scales with the collection, not with the shared table. Past
 * LOOKUP_LIMIT releases it falls back to one table scan; this is a reactive
 * subscription that re-runs on every collection change, and a lookup per
 * release of a 3,000-release collection would spend most of Convex's 4,096
 * index ranges per execution.
 */
export const getForUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const owned = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", user.discogs_username))
      .collect();

    const priced = await pricedByRelease(
      ctx,
      owned.map((row) => row.releaseId)
    );

    const out: { releaseId: number; value: number | null; fetchedAt: number }[] = [];
    for (const row of owned) {
      const mv = priced.get(row.releaseId);
      if (mv) out.push({ releaseId: row.releaseId, value: mv.value, fetchedAt: mv.fetchedAt });
    }
    return out;
  },
});

/**
 * Market values for the authenticated user's wantlist, for the native
 * Wantlist's "~$18 · 6 for sale". Same lookup strategy as getForUser, keyed off
 * the caller's wantlist instead of their collection. Only priced rows:
 * never-fetched wants are left out; `value: null` means fetched with no
 * listings. `numForSale` is absent on rows priced before it was stored.
 */
export const getForWantlist = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const wants = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) => q.eq("discogs_username", user.discogs_username))
      .collect();

    const priced = await pricedByRelease(
      ctx,
      wants.map((want) => want.release_id)
    );

    const out: ({ releaseId: number } & PricedRow)[] = [];
    const seen = new Set<number>();
    for (const want of wants) {
      if (seen.has(want.release_id)) continue;
      seen.add(want.release_id);
      const mv = priced.get(want.release_id);
      if (mv) out.push({ releaseId: want.release_id, ...mv });
    }
    return out;
  },
});
