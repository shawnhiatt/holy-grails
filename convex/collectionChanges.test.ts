// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { albumSignature, syncCacheInChunks, toCollectionRow, type SyncedAlbum } from "./cacheRows";

const modules = import.meta.glob("./**/*.ts");

/**
 * The removal log behind collection.changeSummary (the native Feed's
 * "−2 in 30 days"). A removal is logged where a cached row is really deleted
 * — the sync's diff and removeItem — and never by replaceAll's full rewrite.
 */

const USER = "changer";
const TOKEN = "tok-changer";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-23T12:00:00Z");

type T = TestConvex<typeof schema>;

const album = (releaseId: number, overrides: Partial<SyncedAlbum> = {}): SyncedAlbum => ({
  release_id: releaseId,
  instance_id: releaseId * 10,
  folder_id: 1,
  title: `Title ${releaseId}`,
  artist: `Artist ${releaseId}`,
  year: 1990,
  thumb: "",
  cover: `cover-${releaseId}`,
  folder: "Uncategorized",
  label: "Label",
  catalogNumber: "CAT",
  format: "Vinyl, LP",
  mediaCondition: "",
  sleeveCondition: "",
  notes: "",
  dateAdded: "2024-01-01T00:00:00-08:00",
  ...overrides,
});

function sync(t: T, albums: SyncedAlbum[]) {
  return syncCacheInChunks({
    incoming: albums.map(toCollectionRow),
    keyOf: (row) => row.releaseId,
    signatureOf: albumSignature,
    readPage: (cursor) => t.query(internal.collection.syncSignaturesPage, { username: USER, cursor }),
    writeChunk: (chunk) => t.mutation(internal.collection.applySyncChunk, { username: USER, ...chunk }),
  });
}

async function seed(t: T) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: USER,
      access_token: "access",
      token_secret: "secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", { session_token: TOKEN, discogs_username: USER, created_at: Date.now() });
  });
}

const removals = (t: T) =>
  t.run((ctx) =>
    ctx.db
      .query("collection_removals")
      .withIndex("by_username_and_removedAt", (q) => q.eq("discogsUsername", USER))
      .collect()
  );

const summary = (t: T) => t.query(api.collection.changeSummary, { sessionToken: TOKEN });

describe("collection removal log", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("logs a release the sync removes", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2), album(3)]);
    await sync(t, [album(1), album(3)]);
    const logged = await removals(t);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ releaseId: 2, instanceId: 20, removedAt: NOW });
  });

  it("logs nothing when the sync only adds or updates", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1)]);
    await sync(t, [album(1, { notes: "changed" }), album(2)]);
    expect(await removals(t)).toHaveLength(0);
  });

  it("doesn't log the full replace", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2)]);
    await t.mutation(api.collection.replaceAll, {
      sessionToken: TOKEN,
      albums: [album(3)].map(toCollectionRow),
    });
    expect(await removals(t)).toHaveLength(0);
  });

  it("logs an app removal", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: 2 });
    expect(await removals(t)).toHaveLength(1);
  });

  it("counts an app removal once when the next sync confirms it", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: 2 });
    await sync(t, [album(1)]);
    expect(await removals(t)).toHaveLength(1);
  });

  it("counts a copy once even when a racing sync re-caches it before the confirming sync", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: 2 });
    // A sync that fetched before the Discogs delete puts the same copy back…
    await sync(t, [album(1), album(2)]);
    // …and the next one removes it again.
    await sync(t, [album(1)]);
    expect(await removals(t)).toHaveLength(1);
  });

  it("logs a re-added copy leaving again", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2)]);
    await sync(t, [album(1)]);
    await sync(t, [album(1), album(2, { instance_id: 99 })]);
    await sync(t, [album(1)]);
    expect((await removals(t)).map((r) => r.instanceId).sort()).toEqual([20, 99]);
  });

  it("prunes removals older than 90 days on the next write", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("collection_removals", { discogsUsername: USER, releaseId: 7, instanceId: 70, removedAt: NOW - 91 * DAY });
      await ctx.db.insert("collection_removals", { discogsUsername: USER, releaseId: 8, instanceId: 80, removedAt: NOW - 89 * DAY });
      await ctx.db.insert("collection_removals", { discogsUsername: "other", releaseId: 9, instanceId: 90, removedAt: NOW - 200 * DAY });
    });
    await sync(t, [album(1), album(2)]);
    await sync(t, [album(1)]);
    expect((await removals(t)).map((r) => r.releaseId).sort()).toEqual([2, 8]);
    // Another user's log is theirs to prune.
    const other = await t.run((ctx) =>
      ctx.db
        .query("collection_removals")
        .withIndex("by_username_and_removedAt", (q) => q.eq("discogsUsername", "other"))
        .collect()
    );
    expect(other).toHaveLength(1);
  });

  it("deleteAllUserData clears the log", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await sync(t, [album(1), album(2)]);
    await sync(t, [album(1)]);
    await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });
    expect(await removals(t)).toHaveLength(0);
  });
});

describe("changeSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  const iso = (ms: number) => new Date(ms).toISOString();

  it("counts adds and removals inside the 30-day window only", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(NOW);
    await seed(t);
    await sync(t, [
      album(1, { dateAdded: iso(NOW - 2 * DAY) }),
      album(2, { dateAdded: iso(NOW - 29 * DAY) }),
      album(3, { dateAdded: iso(NOW - 31 * DAY) }),
      album(4, { dateAdded: "" }),
      album(5),
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("collection_removals", { discogsUsername: USER, releaseId: 7, instanceId: 70, removedAt: NOW - 40 * DAY });
      await ctx.db.insert("collection_removals", { discogsUsername: USER, releaseId: 8, instanceId: 80, removedAt: NOW - 10 * DAY });
    });
    await sync(t, [
      album(1, { dateAdded: iso(NOW - 2 * DAY) }),
      album(2, { dateAdded: iso(NOW - 29 * DAY) }),
      album(3, { dateAdded: iso(NOW - 31 * DAY) }),
      album(4, { dateAdded: "" }),
    ]);
    expect(await summary(t)).toEqual({ added30: 2, removed30: 2, lastChangeAt: NOW });
  });

  it("returns the newest add as the last change when nothing was removed", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(NOW);
    await seed(t);
    await sync(t, [album(1, { dateAdded: iso(NOW - 60 * DAY) }), album(2)]);
    expect(await summary(t)).toEqual({ added30: 0, removed30: 0, lastChangeAt: NOW - 60 * DAY });
  });

  it("returns the newest removal when it's newer than any add", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(NOW - 45 * DAY);
    await seed(t);
    await sync(t, [album(1, { dateAdded: iso(NOW - 60 * DAY) }), album(2, { dateAdded: iso(NOW - 60 * DAY) })]);
    await sync(t, [album(1, { dateAdded: iso(NOW - 60 * DAY) })]);
    vi.setSystemTime(NOW);
    expect(await summary(t)).toEqual({ added30: 0, removed30: 0, lastChangeAt: NOW - 45 * DAY });
  });

  it("returns null with an empty collection and no log", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(NOW);
    await seed(t);
    expect(await summary(t)).toEqual({ added30: 0, removed30: 0, lastChangeAt: null });
  });

  it("requires a session", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.collection.changeSummary, { sessionToken: "nope" })).rejects.toThrow();
  });
});
