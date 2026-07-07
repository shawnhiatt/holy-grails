// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { nextMarketCursor, MARKET_BATCH_SIZE } from "./marketValue";

const modules = import.meta.glob("./**/*.ts");

/**
 * Per-album market-value drip (Spec 6, Session A):
 *   - nextMarketCursor advance/wraparound (pure)
 *   - getMarketDripBatch staleness + cursor-range selection (internal query)
 *   - setMarketValue writes/no-ops (internal mutation)
 *   - applyDiff MUST preserve marketValue on rows it patches — the one
 *     genuinely fiddly integration point the spec flagged.
 */

const NOW = 1_780_000_000_000;

function newTest() {
  return convexTest(schema, modules);
}

const albumFields = (releaseId: number, overrides: Record<string, unknown> = {}) => ({
  discogsUsername: "dj",
  releaseId,
  instanceId: releaseId * 10,
  artist: `Artist ${releaseId}`,
  title: `Title ${releaseId}`,
  year: 1990,
  cover: `cover-${releaseId}`,
  folder: "Uncategorized",
  label: "Label",
  catalogNumber: "CAT",
  format: "Vinyl, LP",
  mediaCondition: "VG+",
  sleeveCondition: "VG",
  pricePaid: "",
  notes: "",
  dateAdded: "2024-01-01T00:00:00-08:00",
  ...overrides,
});

// The subset applyDiff accepts (no marketValue — that's the point).
const diffAlbum = (releaseId: number, overrides: Record<string, unknown> = {}) => {
  const { discogsUsername: _u, ...rest } = albumFields(releaseId, overrides);
  return rest;
};

describe("nextMarketCursor", () => {
  it("advances to the last releaseId on a full batch", () => {
    expect(nextMarketCursor(MARKET_BATCH_SIZE, 512, MARKET_BATCH_SIZE)).toBe(512);
  });
  it("wraps to 0 on a short batch (stale rows exhausted)", () => {
    expect(nextMarketCursor(5, 512, MARKET_BATCH_SIZE)).toBe(0);
  });
  it("wraps to 0 on an empty batch", () => {
    expect(nextMarketCursor(0, undefined, MARKET_BATCH_SIZE)).toBe(0);
  });
});

describe("getMarketDripBatch", () => {
  async function seed(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
      // 1 fresh, 2 never fetched, 3 stale, 4 fresh, 5 never fetched
      await ctx.db.insert("collection", albumFields(1, { marketValueFetchedAt: NOW }));
      await ctx.db.insert("collection", albumFields(2));
      await ctx.db.insert("collection", albumFields(3, { marketValueFetchedAt: NOW - 1_000_000 }));
      await ctx.db.insert("collection", albumFields(4, { marketValueFetchedAt: NOW }));
      await ctx.db.insert("collection", albumFields(5));
    });
  }

  it("returns never-fetched and stale rows above the cursor, ascending", async () => {
    const t = newTest();
    await seed(t);
    const batch = await t.query(internal.collection.getMarketDripBatch, {
      discogsUsername: "dj",
      cursor: 0,
      staleBefore: NOW - 1,
      limit: MARKET_BATCH_SIZE,
    });
    expect(batch.map((r) => r.releaseId)).toEqual([2, 3, 5]);
  });

  it("honors the cursor watermark", async () => {
    const t = newTest();
    await seed(t);
    const batch = await t.query(internal.collection.getMarketDripBatch, {
      discogsUsername: "dj",
      cursor: 2,
      staleBefore: NOW - 1,
      limit: MARKET_BATCH_SIZE,
    });
    expect(batch.map((r) => r.releaseId)).toEqual([3, 5]);
  });

  it("caps at the limit", async () => {
    const t = newTest();
    await seed(t);
    const batch = await t.query(internal.collection.getMarketDripBatch, {
      discogsUsername: "dj",
      cursor: 0,
      staleBefore: NOW - 1,
      limit: 2,
    });
    expect(batch.map((r) => r.releaseId)).toEqual([2, 3]);
  });
});

describe("setMarketValue", () => {
  it("writes a value and timestamp onto the row", async () => {
    const t = newTest();
    await t.run(async (ctx) => { await ctx.db.insert("collection", albumFields(1)); });
    await t.mutation(internal.collection.setMarketValue, {
      discogsUsername: "dj",
      releaseId: 1,
      marketValue: 42,
      fetchedAt: NOW,
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("collection").withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", "dj").eq("releaseId", 1)).first());
    expect(row!.marketValue).toBe(42);
    expect(row!.marketValueFetchedAt).toBe(NOW);
  });

  it("stores null (no listings) distinctly from never-fetched", async () => {
    const t = newTest();
    await t.run(async (ctx) => { await ctx.db.insert("collection", albumFields(1)); });
    await t.mutation(internal.collection.setMarketValue, {
      discogsUsername: "dj",
      releaseId: 1,
      marketValue: null,
      fetchedAt: NOW,
    });
    const row = await t.run(async (ctx) =>
      ctx.db.query("collection").withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", "dj").eq("releaseId", 1)).first());
    expect(row!.marketValue).toBeNull();
    expect(row!.marketValueFetchedAt).toBe(NOW);
  });

  it("no-ops when the row has left the collection", async () => {
    const t = newTest();
    await expect(
      t.mutation(internal.collection.setMarketValue, {
        discogsUsername: "dj",
        releaseId: 999,
        marketValue: 10,
        fetchedAt: NOW,
      })
    ).resolves.toBeNull(); // Convex serializes a void return as null
  });
});

describe("applyDiff preserves market fields", () => {
  async function seedUserAndValuedRow(t: ReturnType<typeof convexTest>) {
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        discogs_username: "dj",
        access_token: "a",
        token_secret: "s",
        created_at: NOW,
      });
      await ctx.db.insert("auth_sessions", {
        session_token: "tok-dj",
        discogs_username: "dj",
        created_at: NOW,
      });
      await ctx.db.insert("collection", albumFields(1));
    });
    await t.mutation(internal.collection.setMarketValue, {
      discogsUsername: "dj",
      releaseId: 1,
      marketValue: 88,
      fetchedAt: NOW,
    });
  }

  const readValue = (t: ReturnType<typeof convexTest>) =>
    t.run(async (ctx) =>
      ctx.db.query("collection").withIndex("by_username_and_release", (q) =>
        q.eq("discogsUsername", "dj").eq("releaseId", 1)).first());

  it("keeps marketValue when the row is unchanged (no patch)", async () => {
    const t = newTest();
    await seedUserAndValuedRow(t);
    await t.mutation(api.collection.applyDiff, {
      sessionToken: "tok-dj",
      albums: [diffAlbum(1)],
    });
    const row = await readValue(t);
    expect(row!.marketValue).toBe(88);
    expect(row!.marketValueFetchedAt).toBe(NOW);
  });

  it("keeps marketValue when the row IS patched (a field changed)", async () => {
    const t = newTest();
    await seedUserAndValuedRow(t);
    await t.mutation(api.collection.applyDiff, {
      sessionToken: "tok-dj",
      albums: [diffAlbum(1, { mediaCondition: "NM" })], // triggers a patch
    });
    const row = await readValue(t);
    expect(row!.mediaCondition).toBe("NM"); // patch landed
    expect(row!.marketValue).toBe(88); // and market value survived it
    expect(row!.marketValueFetchedAt).toBe(NOW);
  });
});
