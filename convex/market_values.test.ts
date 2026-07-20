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

const readValues = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => ctx.db.query("market_values").collect());

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
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        discogs_username: "a", access_token: "x", token_secret: "y", created_at: NOW,
      });
      await ctx.db.insert("auth_sessions", {
        session_token: "tok-a", discogs_username: "a", created_at: NOW,
      });
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
});
