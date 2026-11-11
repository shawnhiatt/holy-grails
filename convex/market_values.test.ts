// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Shared per-release market value (Spec 6A.1):
 *   - seedFromCollection populates one row per owned release and migrates the
 *     legacy per-user values, without duplicating across owners
 *   - getDripBatch returns the stalest / never-fetched releases first
 *   - setValue advances fetchedAt always, writes value only when provided
 *   - getForUser returns priced releases for the caller's collection only
 *   - wantlists: the seed adds wanted releases and keeps `wanted` in sync,
 *     the batch re-prices wants weekly ahead of the monthly queue, and
 *     getForWantlist returns the caller's priced wants with numForSale
 */

const NOW = 1_780_000_000_000;

function newTest() {
  return convexTest(schema, modules);
}

const collectionRow = (
  username: string,
  releaseId: number,
  overrides: Record<string, unknown> = {}
) => ({
  discogsUsername: username,
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
  notes: "",
  dateAdded: "2024-01-01T00:00:00-08:00",
  ...overrides,
});

const wantRow = (username: string, releaseId: number) => ({
  discogs_username: username,
  release_id: releaseId,
  title: `Want ${releaseId}`,
  artist: `Artist ${releaseId}`,
  year: 1990,
  cover: `cover-${releaseId}`,
  label: "Label",
  priority: false,
});

const DAY = 24 * 60 * 60 * 1000;

const readValues = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => ctx.db.query("market_values").collect());

/**
 * Signs a user in with a LIVE session.
 *
 * `created_at` is deliberately `Date.now()` and not the fixed NOW these tests
 * use for market data: authenticateUser measures the 90-day session TTL against
 * the real clock, so a hardcoded timestamp silently ages out and the test starts
 * failing on a calendar date rather than on a code change. That is exactly what
 * happened here — NOW is 2026-05-28, so every getForUser test began throwing
 * "Unauthorized" on 2026-08-26 with nothing having changed. Seed sessions
 * through this helper; a test that wants an expired one should pin the clock
 * with fake timers the way authHelper.test.ts does.
 */
async function seedUser(
  t: ReturnType<typeof convexTest>,
  username: string,
  token: string
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "oauth-access-secret",
      token_secret: "oauth-token-secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: token,
      discogs_username: username,
      created_at: Date.now(),
    });
  });
}

describe("seedFromCollection", () => {
  it("adds one shared row per release across owners (deduped)", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      // Two users both own release 1; user A also owns 2.
      await ctx.db.insert("collection", collectionRow("a", 1));
      await ctx.db.insert("collection", collectionRow("b", 1));
      await ctx.db.insert("collection", collectionRow("a", 2));
    });
    const { added } = await t.mutation(internal.market_values.seedFromCollection, {});
    expect(added).toBe(2);
    const rows = await readValues(t);
    expect(rows.map((r) => r.releaseId).sort()).toEqual([1, 2]);
  });

  it("migrates a value already on the legacy per-user collection field", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", collectionRow("a", 1, {
        marketValue: 42,
        marketValueFetchedAt: NOW,
      }));
    });
    await t.mutation(internal.market_values.seedFromCollection, {});
    const [row] = await readValues(t);
    expect(row.value).toBe(42);
    expect(row.fetchedAt).toBe(NOW);
  });

  it("is idempotent — a second run adds nothing", async () => {
    const t = newTest();
    await t.run(async (ctx) => { await ctx.db.insert("collection", collectionRow("a", 1)); });
    await t.mutation(internal.market_values.seedFromCollection, {});
    const second = await t.mutation(internal.market_values.seedFromCollection, {});
    expect(second.added).toBe(0);
    expect(await readValues(t)).toHaveLength(1);
  });
});

describe("seedFromCollection with wantlists", () => {
  it("adds wanted releases nobody owns, flagged wanted and never fetched", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", collectionRow("a", 1));
      await ctx.db.insert("wantlist", wantRow("a", 2));
      await ctx.db.insert("wantlist", wantRow("b", 2)); // wanted twice, one row
      await ctx.db.insert("wantlist", wantRow("b", 1)); // owned by a, wanted by b
    });
    const { added } = await t.mutation(internal.market_values.seedFromCollection, {});
    expect(added).toBe(2);
    const rows = (await readValues(t)).sort((x, y) => x.releaseId - y.releaseId);
    expect(rows.map((r) => [r.releaseId, r.wanted, r.fetchedAt])).toEqual([
      [1, true, undefined],
      [2, true, undefined],
    ]);
  });

  it("flags an existing row when it's wanted and clears it when nobody wants it", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", collectionRow("a", 1));
      await ctx.db.insert("market_values", { releaseId: 1, value: 10, fetchedAt: NOW });
    });
    const wantId = await t.run((ctx) => ctx.db.insert("wantlist", wantRow("b", 1)));

    let result = await t.mutation(internal.market_values.seedFromCollection, {});
    expect(result).toEqual({ added: 0, wantedChanged: 1 });
    let [row] = await readValues(t);
    expect(row.wanted).toBe(true);
    expect(row.value).toBe(10); // price untouched

    await t.run((ctx) => ctx.db.delete(wantId));
    result = await t.mutation(internal.market_values.seedFromCollection, {});
    expect(result).toEqual({ added: 0, wantedChanged: 1 });
    [row] = await readValues(t);
    expect(row.wanted).toBe(false);
  });

  it("is idempotent — a steady-state run adds and patches nothing", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", collectionRow("a", 1));
      await ctx.db.insert("wantlist", wantRow("a", 2));
    });
    await t.mutation(internal.market_values.seedFromCollection, {});
    const second = await t.mutation(internal.market_values.seedFromCollection, {});
    expect(second).toEqual({ added: 0, wantedChanged: 0 });
    expect(await readValues(t)).toHaveLength(2);
  });
});

describe("getDripBatch", () => {
  it("returns never-fetched and stale releases, stalest first, capped", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("market_values", { releaseId: 1, value: 5, fetchedAt: NOW });          // fresh
      await ctx.db.insert("market_values", { releaseId: 2 });                                     // never fetched
      await ctx.db.insert("market_values", { releaseId: 3, value: 9, fetchedAt: NOW - 5_000_000 }); // stale, oldest
      await ctx.db.insert("market_values", { releaseId: 4, value: 9, fetchedAt: NOW - 1_000_000 }); // stale, newer
    });
    const batch = await t.query(internal.market_values.getDripBatch, {
      staleBefore: NOW - 1,
      limit: 40,
    });
    // never-fetched (undefined sorts first), then oldest stale, then newer stale.
    // Fresh release 1 is excluded.
    expect(batch.map((r) => r.releaseId)).toEqual([2, 3, 4]);
  });

  it("caps at the limit", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("market_values", { releaseId: 2 });
      await ctx.db.insert("market_values", { releaseId: 3, fetchedAt: NOW - 5_000_000 });
    });
    const batch = await t.query(internal.market_values.getDripBatch, {
      staleBefore: NOW - 1,
      limit: 1,
    });
    expect(batch).toHaveLength(1);
    expect(batch[0].releaseId).toBe(2); // never-fetched first
  });
});

describe("getDripBatch with wanted releases", () => {
  const batchArgs = (limit = 40) => ({
    staleBefore: NOW - 30 * DAY,
    wantedStaleBefore: NOW - 7 * DAY,
    limit,
  });

  it("puts week-old wants ahead of month-old releases, with no duplicates", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("market_values", { releaseId: 1, fetchedAt: NOW - 60 * DAY });              // owned, a month+ stale
      await ctx.db.insert("market_values", { releaseId: 2, fetchedAt: NOW - 10 * DAY, wanted: true }); // want, a week+ stale
      await ctx.db.insert("market_values", { releaseId: 3, fetchedAt: NOW - 2 * DAY, wanted: true });  // want, fresh
      await ctx.db.insert("market_values", { releaseId: 4, wanted: true });                            // want, never fetched
      await ctx.db.insert("market_values", { releaseId: 5, fetchedAt: NOW - 90 * DAY, wanted: true }); // want, stale in both queues
      await ctx.db.insert("market_values", { releaseId: 6, fetchedAt: NOW - 10 * DAY });              // owned, fresh for monthly
      await ctx.db.insert("market_values", { releaseId: 7, fetchedAt: NOW - 20 * DAY, wanted: false });// no longer wanted: monthly
    });
    const batch = await t.query(internal.market_values.getDripBatch, batchArgs());
    // Wants first (never fetched, then stalest), then the monthly queue minus
    // release 5, already picked.
    expect(batch.map((r) => r.releaseId)).toEqual([4, 5, 2, 1]);
  });

  it("fills the limit from the monthly queue after the wants", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("market_values", { releaseId: 1, fetchedAt: NOW - 90 * DAY, wanted: true });
      await ctx.db.insert("market_values", { releaseId: 2, fetchedAt: NOW - 80 * DAY });
      await ctx.db.insert("market_values", { releaseId: 3, fetchedAt: NOW - 70 * DAY });
    });
    const batch = await t.query(internal.market_values.getDripBatch, batchArgs(2));
    // Release 1 is the stalest overall, picked as a want; it isn't counted
    // twice, so the second slot goes to 2.
    expect(batch.map((r) => r.releaseId)).toEqual([1, 2]);
  });

  it("caps the wants at the limit", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      for (let id = 1; id <= 5; id++) {
        await ctx.db.insert("market_values", { releaseId: id, wanted: true });
      }
      await ctx.db.insert("market_values", { releaseId: 9, fetchedAt: NOW - 90 * DAY });
    });
    const batch = await t.query(internal.market_values.getDripBatch, batchArgs(3));
    expect(batch).toHaveLength(3);
    expect(batch.every((r) => r.releaseId <= 5)).toBe(true);
  });
});

describe("setValue", () => {
  it("writes value + fetchedAt on success (incl. null for no listings)", async () => {
    const t = newTest();
    await t.run(async (ctx) => { await ctx.db.insert("market_values", { releaseId: 1 }); });
    await t.mutation(internal.market_values.setValue, { releaseId: 1, fetchedAt: NOW, value: 33 });
    let [row] = await readValues(t);
    expect(row.value).toBe(33);
    expect(row.fetchedAt).toBe(NOW);

    await t.mutation(internal.market_values.setValue, { releaseId: 1, fetchedAt: NOW + 1, value: null });
    [row] = await readValues(t);
    expect(row.value).toBeNull();
    expect(row.fetchedAt).toBe(NOW + 1);
  });

  it("advances fetchedAt but preserves value when value is omitted (failure path)", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("market_values", { releaseId: 1, value: 33, fetchedAt: NOW });
    });
    await t.mutation(internal.market_values.setValue, { releaseId: 1, fetchedAt: NOW + 5 });
    const [row] = await readValues(t);
    expect(row.value).toBe(33); // preserved
    expect(row.fetchedAt).toBe(NOW + 5); // advanced (won't re-hit for 30d)
  });

  it("writes numForSale with the value, and keeps it on the failure path", async () => {
    const t = newTest();
    await t.run(async (ctx) => { await ctx.db.insert("market_values", { releaseId: 1 }); });
    await t.mutation(internal.market_values.setValue, { releaseId: 1, fetchedAt: NOW, value: 18, numForSale: 6 });
    let [row] = await readValues(t);
    expect(row.numForSale).toBe(6);

    await t.mutation(internal.market_values.setValue, { releaseId: 1, fetchedAt: NOW + 5 });
    [row] = await readValues(t);
    expect(row.value).toBe(18);
    expect(row.numForSale).toBe(6);
  });

  it("no-ops for an unknown release", async () => {
    const t = newTest();
    await expect(
      t.mutation(internal.market_values.setValue, { releaseId: 999, fetchedAt: NOW, value: 1 })
    ).resolves.toBeNull();
  });
});

describe("getForUser", () => {
  it("returns priced releases for the caller's collection only", async () => {
    const t = newTest();
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", collectionRow("a", 1));
      await ctx.db.insert("collection", collectionRow("a", 2)); // owned but unpriced
      await ctx.db.insert("collection", collectionRow("b", 3)); // someone else's
      await ctx.db.insert("market_values", { releaseId: 1, value: 12, fetchedAt: NOW });
      await ctx.db.insert("market_values", { releaseId: 2 }); // no value yet
      await ctx.db.insert("market_values", { releaseId: 3, value: 99, fetchedAt: NOW });
    });
    const result = await t.query(api.market_values.getForUser, { sessionToken: "tok-a" });
    // Only release 1: owned + priced. 2 owned-but-unpriced, 3 not owned.
    expect(result).toEqual([{ releaseId: 1, value: 12, fetchedAt: NOW }]);
  });

  it("rejects an unauthenticated caller", async () => {
    const t = newTest();
    await expect(
      t.query(api.market_values.getForUser, { sessionToken: "bogus" })
    ).rejects.toThrow("Unauthorized");
  });

  it("reads only the caller's releases, not the rest of the shared table", async () => {
    // market_values holds every user's releases and only grows. Capping
    // documentsRead far below the table size fails loudly if the whole-table
    // scan ever comes back: the lookups need the session, the user, the
    // collection rows and one price row per owned release, however many rows
    // belong to other people.
    const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 30 } });
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      for (const releaseId of [1, 2, 3]) {
        await ctx.db.insert("collection", collectionRow("a", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: releaseId * 10, fetchedAt: NOW });
      }
      for (let releaseId = 1000; releaseId < 1200; releaseId++) {
        await ctx.db.insert("collection", collectionRow("b", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: 99, fetchedAt: NOW });
      }
    });
    const result = await t.query(api.market_values.getForUser, { sessionToken: "tok-a" });
    expect(result.map((r) => r.releaseId).sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it("looks releases up by index, within Convex's index-range limit", async () => {
    // One by_release range per distinct release plus the session, user and
    // collection reads. Capping databaseQueries just above that proves the
    // lookup path is the one in use for a mid-sized collection.
    const SIZE = 300;
    const t = convexTest({ schema, modules, transactionLimits: { databaseQueries: SIZE + 10 } });
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      for (let releaseId = 1; releaseId <= SIZE; releaseId++) {
        await ctx.db.insert("collection", collectionRow("a", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: releaseId, fetchedAt: NOW });
      }
    });
    const result = await t.query(api.market_values.getForUser, { sessionToken: "tok-a" });
    expect(result).toHaveLength(SIZE);
  });

  it("falls back to one scan for a collection past the lookup limit", async () => {
    // 1,001 distinct releases would spend 1,001 index ranges; capping the
    // ranges at a handful fails if the fallback ever stops being a single
    // scan, and every price must still come back.
    const SIZE = 1001;
    const t = convexTest({ schema, modules, transactionLimits: { databaseQueries: 8 } });
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      for (let releaseId = 1; releaseId <= SIZE; releaseId++) {
        await ctx.db.insert("collection", collectionRow("a", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: releaseId, fetchedAt: NOW });
      }
    });
    const result = await t.query(api.market_values.getForUser, { sessionToken: "tok-a" });
    expect(result).toHaveLength(SIZE);
  });

  it("passes through a priced-but-no-listings null value", async () => {
    const t = newTest();
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", collectionRow("a", 1));
      await ctx.db.insert("market_values", { releaseId: 1, value: null, fetchedAt: NOW });
    });
    const result = await t.query(api.market_values.getForUser, { sessionToken: "tok-a" });
    // null = fetched, no active listings. Distinct from undefined (never
    // fetched), which is excluded — the client's hasMarketValue guard needs
    // both to arrive as themselves.
    expect(result).toEqual([{ releaseId: 1, value: null, fetchedAt: NOW }]);
  });
});

describe("getForWantlist", () => {
  it("returns priced releases for the caller's wantlist only, with numForSale", async () => {
    const t = newTest();
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("wantlist", wantRow("a", 1));
      await ctx.db.insert("wantlist", wantRow("a", 2)); // wanted but never fetched
      await ctx.db.insert("wantlist", wantRow("a", 4)); // priced before numForSale existed
      await ctx.db.insert("wantlist", wantRow("b", 3)); // someone else's want
      await ctx.db.insert("collection", collectionRow("a", 5)); // owned, not wanted
      await ctx.db.insert("market_values", { releaseId: 1, value: 18, fetchedAt: NOW, numForSale: 6, wanted: true });
      await ctx.db.insert("market_values", { releaseId: 2, wanted: true });
      await ctx.db.insert("market_values", { releaseId: 3, value: 99, fetchedAt: NOW, numForSale: 2, wanted: true });
      await ctx.db.insert("market_values", { releaseId: 4, value: 7, fetchedAt: NOW, wanted: true });
      await ctx.db.insert("market_values", { releaseId: 5, value: 50, fetchedAt: NOW, numForSale: 1 });
    });
    const result = await t.query(api.market_values.getForWantlist, { sessionToken: "tok-a" });
    expect(result.sort((x, y) => x.releaseId - y.releaseId)).toEqual([
      { releaseId: 1, value: 18, fetchedAt: NOW, numForSale: 6 },
      { releaseId: 4, value: 7, fetchedAt: NOW },
    ]);
  });

  it("passes through a no-listings null value with its zero count", async () => {
    const t = newTest();
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("wantlist", wantRow("a", 1));
      await ctx.db.insert("market_values", { releaseId: 1, value: null, fetchedAt: NOW, numForSale: 0, wanted: true });
    });
    const result = await t.query(api.market_values.getForWantlist, { sessionToken: "tok-a" });
    expect(result).toEqual([{ releaseId: 1, value: null, fetchedAt: NOW, numForSale: 0 }]);
  });

  it("rejects an unauthenticated caller", async () => {
    const t = newTest();
    await expect(
      t.query(api.market_values.getForWantlist, { sessionToken: "bogus" })
    ).rejects.toThrow("Unauthorized");
  });

  it("reads only the caller's wants, not the rest of the shared table", async () => {
    // Same guard as getForUser's: other users' releases (and their wants) sit
    // in market_values but must not be read to answer this caller.
    const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 30 } });
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      for (const releaseId of [1, 2, 3]) {
        await ctx.db.insert("wantlist", wantRow("a", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: releaseId * 10, fetchedAt: NOW, numForSale: 2, wanted: true });
      }
      for (let releaseId = 1000; releaseId < 1200; releaseId++) {
        await ctx.db.insert("wantlist", wantRow("b", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: 99, fetchedAt: NOW, numForSale: 5, wanted: true });
      }
    });
    const result = await t.query(api.market_values.getForWantlist, { sessionToken: "tok-a" });
    expect(result.map((r) => r.releaseId).sort((x, y) => x - y)).toEqual([1, 2, 3]);
    expect(result.every((r) => r.numForSale === 2)).toBe(true);
  });

  it("returns the first row when a release has duplicate price rows", async () => {
    // The scan kept the first row per release; the index lookup must too.
    const t = newTest();
    await seedUser(t, "a", "tok-a");
    await t.run(async (ctx) => {
      await ctx.db.insert("wantlist", wantRow("a", 1));
      await ctx.db.insert("market_values", { releaseId: 1, value: 10, fetchedAt: NOW, numForSale: 1, wanted: true });
      await ctx.db.insert("market_values", { releaseId: 1, value: 20, fetchedAt: NOW, numForSale: 2, wanted: true });
    });
    const result = await t.query(api.market_values.getForWantlist, { sessionToken: "tok-a" });
    expect(result).toEqual([{ releaseId: 1, value: 10, fetchedAt: NOW, numForSale: 1 }]);
  });

  it("looks wants up by index, and falls back to one scan past the lookup limit", async () => {
    const SIZE = 300;
    const t1 = convexTest({ schema, modules, transactionLimits: { databaseQueries: SIZE + 10 } });
    await seedUser(t1, "a", "tok-a");
    await t1.run(async (ctx) => {
      for (let releaseId = 1; releaseId <= SIZE; releaseId++) {
        await ctx.db.insert("wantlist", wantRow("a", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: releaseId, fetchedAt: NOW, wanted: true });
      }
    });
    expect(await t1.query(api.market_values.getForWantlist, { sessionToken: "tok-a" })).toHaveLength(SIZE);

    const BIG = 1001;
    const t2 = convexTest({ schema, modules, transactionLimits: { databaseQueries: 8 } });
    await seedUser(t2, "a", "tok-a");
    await t2.run(async (ctx) => {
      for (let releaseId = 1; releaseId <= BIG; releaseId++) {
        await ctx.db.insert("wantlist", wantRow("a", releaseId));
        await ctx.db.insert("market_values", { releaseId, value: releaseId, fetchedAt: NOW, wanted: true });
      }
    });
    expect(await t2.query(api.market_values.getForWantlist, { sessionToken: "tok-a" })).toHaveLength(BIG);
  });
});
