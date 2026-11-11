// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  albumSignature,
  stickyCopies,
  syncCacheInChunks,
  toCollectionRow,
  toWantRow,
  wantSignature,
  type SyncedAlbum,
  type SyncedWant,
} from "./cacheRows";

const modules = import.meta.glob("./**/*.ts");

/**
 * The chunked sync write (bug hunt H5). The collection and wantlist used to be
 * reconciled inside one applyDiff mutation carrying the whole collection;
 * these drive the replacement end to end — the paged signature read, the
 * planner, and the chunked writes — through the real internal functions.
 */

const USER = "collector";
const OTHER = "someone_else";

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
  dateAdded: "2024-01-01",
  ...overrides,
});

const want = (releaseId: number, overrides: Partial<SyncedWant> = {}): SyncedWant => ({
  release_id: releaseId,
  title: `Want ${releaseId}`,
  artist: `Artist ${releaseId}`,
  year: 1990,
  thumb: "",
  cover: `cover-${releaseId}`,
  label: "Label",
  format: "Vinyl, LP",
  priority: false,
  ...overrides,
});

type T = TestConvex<typeof schema>;

// Mirrors syncSelf, sticky dedupe included (DW-04).
function syncCollection(t: T, username: string, albums: SyncedAlbum[]) {
  return syncCacheInChunks<Id<"collection">, ReturnType<typeof toCollectionRow>>({
    incoming: albums.map(toCollectionRow),
    keyOf: (row) => row.releaseId,
    signatureOf: albumSignature,
    prepare: stickyCopies,
    readPage: (cursor) => t.query(internal.collection.syncSignaturesPage, { username, cursor }),
    writeChunk: (chunk) => t.mutation(internal.collection.applySyncChunk, { username, ...chunk }),
  });
}

function syncWantlist(t: T, username: string, wants: SyncedWant[]) {
  return syncCacheInChunks({
    incoming: wants.map(toWantRow),
    keyOf: (row) => row.release_id,
    signatureOf: wantSignature,
    readPage: (cursor) => t.query(internal.wantlist.syncSignaturesPage, { username, cursor }),
    writeChunk: (chunk) => t.mutation(internal.wantlist.applySyncChunk, { username, ...chunk }),
  });
}

const collectionRows = (t: T, username: string) =>
  t.run((ctx) =>
    ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", username))
      .collect()
  );

describe("chunked collection sync", () => {
  it("writes a collection larger than one page and one chunk", async () => {
    const t = convexTest(schema, modules);
    const albums = Array.from({ length: 1234 }, (_, i) => album(i + 1));
    expect(await syncCollection(t, USER, albums)).toEqual({ added: 1234, removed: 0, updated: 0 });
    expect(await collectionRows(t, USER)).toHaveLength(1234);
  });

  it("a second identical sync writes nothing", async () => {
    const t = convexTest(schema, modules);
    const albums = Array.from({ length: 600 }, (_, i) => album(i + 1));
    await syncCollection(t, USER, albums);
    expect(await syncCollection(t, USER, albums)).toEqual({ added: 0, removed: 0, updated: 0 });
  });

  it("rows with custom fields and free data compare equal after a round trip", async () => {
    const t = convexTest(schema, modules);
    const rich = [
      album(1, {
        customFields: [
          { name: "Shelf", value: "A3", fieldId: 4, type: "textarea" },
          { name: "Grade", value: "", fieldId: 5, type: "dropdown", options: ["Good", "Bad"] },
        ],
        genres: ["Jazz"],
        styles: ["Modal"],
        rating: 3,
        discCount: 2,
        artistIds: [5, 9],
        master_id: 77,
        thumb: "t.jpg",
      }),
    ];
    await syncCollection(t, USER, rich);
    expect(await syncCollection(t, USER, rich)).toEqual({ added: 0, removed: 0, updated: 0 });
  });

  it("patches changed rows, adds new ones, removes missing ones", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, USER, [album(1), album(2), album(3)]);
    const diff = await syncCollection(t, USER, [
      album(1),
      album(2, { rating: 4, genres: ["Jazz"] }),
      album(4),
    ]);
    expect(diff).toEqual({ added: 1, removed: 1, updated: 1 });
    const rows = await collectionRows(t, USER);
    expect(rows.map((r) => r.releaseId).sort()).toEqual([1, 2, 4]);
    const two = rows.find((r) => r.releaseId === 2)!;
    expect(two.rating).toBe(4);
    expect(two.genres).toEqual(["Jazz"]);
  });

  it("backfills free data onto rows cached before it was forwarded (C1)", async () => {
    const t = convexTest(schema, modules);
    // What every existing cache row looks like: synced with the fields dropped.
    await syncCollection(t, USER, [album(7)]);
    await syncCollection(t, USER, [album(7, { genres: ["Soul"], styles: ["Funk"], rating: 5 })]);
    const [row] = await collectionRows(t, USER);
    expect(row.genres).toEqual(["Soul"]);
    expect(row.rating).toBe(5);
  });

  it("removes duplicate cache rows left by a past race", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, USER, [album(1)]);
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", { discogsUsername: USER, ...toCollectionRow(album(1)) });
    });
    expect(await collectionRows(t, USER)).toHaveLength(2);
    await syncCollection(t, USER, [album(1)]);
    expect(await collectionRows(t, USER)).toHaveLength(1);
  });

  it("never touches another user's rows", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, OTHER, [album(1), album(2)]);
    await syncCollection(t, USER, [album(1)]);
    await syncCollection(t, USER, []);
    expect(await collectionRows(t, OTHER)).toHaveLength(2);
  });

  it("applySyncChunk refuses to patch or delete a row owned by someone else", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, OTHER, [album(1)]);
    const [theirs] = await collectionRows(t, OTHER);
    await t.mutation(internal.collection.applySyncChunk, {
      username: USER,
      inserts: [],
      patches: [{ id: theirs._id, row: toCollectionRow(album(1, { title: "hijacked" })) }],
      deletes: [theirs._id],
    });
    const [after] = await collectionRows(t, OTHER);
    expect(after.title).toBe("Title 1");
    // The stray patch became an upsert for the caller's own cache instead.
    const mine = await collectionRows(t, USER);
    expect(mine.map((r) => r.title)).toEqual(["hijacked"]);
  });

  it("an insert for a release another sync already cached patches it instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, USER, [album(1)]);
    await t.mutation(internal.collection.applySyncChunk, {
      username: USER,
      inserts: [toCollectionRow(album(1, { notes: "second sync" }))],
      patches: [],
      deletes: [],
    });
    const rows = await collectionRows(t, USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe("second sync");
  });
});

describe("chunked wantlist sync", () => {
  it("adds, patches and removes across more than one page", async () => {
    const t = convexTest(schema, modules);
    const wants = Array.from({ length: 700 }, (_, i) => want(i + 1));
    expect(await syncWantlist(t, USER, wants)).toEqual({ added: 700, removed: 0, updated: 0 });
    const next = [...wants.slice(1), want(9999)];
    next[0] = want(2, { genres: ["Jazz"] });
    expect(await syncWantlist(t, USER, next)).toEqual({ added: 1, removed: 1, updated: 1 });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("wantlist")
        .withIndex("by_username", (q) => q.eq("discogs_username", USER))
        .collect()
    );
    expect(rows).toHaveLength(700);
    expect(rows.find((r) => r.release_id === 2)?.genres).toEqual(["Jazz"]);
  });
});

describe("sticky dedupe: one copy per release, never a swap (DW-04)", () => {
  // Two copies of release 1: instance 10 and instance 11, in different folders.
  const copyLow = album(1, { instance_id: 10, folder_id: 2, folder: "Jazz" });
  const copyHigh = album(1, { instance_id: 11, folder_id: 3, folder: "Shelf" });

  it("with nothing cached, keeps the lowest instance id whatever the fetch order", async () => {
    for (const order of [[copyLow, copyHigh], [copyHigh, copyLow]]) {
      const t = convexTest(schema, modules);
      await syncCollection(t, USER, order);
      const rows = await collectionRows(t, USER);
      expect(rows.map((r) => r.instanceId)).toEqual([10]);
    }
  });

  it("keeps the copy already cached when the fetch order flips", async () => {
    const t = convexTest(schema, modules);
    // The app has been showing the higher copy (e.g. cached before the
    // lower one was fetched first).
    await syncCollection(t, USER, [copyHigh]);
    expect(await syncCollection(t, USER, [copyLow, copyHigh])).toEqual({ added: 0, removed: 0, updated: 0 });
    expect(await syncCollection(t, USER, [copyHigh, copyLow])).toEqual({ added: 0, removed: 0, updated: 0 });
    const rows = await collectionRows(t, USER);
    expect(rows.map((r) => [r.instanceId, r.folder])).toEqual([[11, "Shelf"]]);
  });

  it("moves to the other copy only when the cached copy is really gone", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, USER, [copyHigh]);
    expect(await syncCollection(t, USER, [copyLow])).toEqual({ added: 0, removed: 0, updated: 1 });
    expect((await collectionRows(t, USER)).map((r) => r.instanceId)).toEqual([10]);
  });

  it("a cache holding two copies keeps the lowest and deletes the other, not the reverse", async () => {
    const t = convexTest(schema, modules);
    // An app add cached the higher copy first, then a sync cached the lower.
    await t.run(async (ctx) => {
      await ctx.db.insert("collection", { discogsUsername: USER, ...toCollectionRow(copyHigh) });
      await ctx.db.insert("collection", { discogsUsername: USER, ...toCollectionRow(copyLow) });
    });
    const [highRow, lowRow] = await collectionRows(t, USER);
    expect(await syncCollection(t, USER, [copyHigh, copyLow])).toEqual({ added: 0, removed: 1, updated: 0 });
    const rows = await collectionRows(t, USER);
    // The lower copy's own row survives untouched; the higher one's is gone.
    expect(rows.map((r) => r._id)).toEqual([lowRow._id]);
    expect(rows[0].instanceId).toBe(10);
    expect(rows.some((r) => r._id === highRow._id)).toBe(false);
  });

  it("releases with one copy sync exactly as before", async () => {
    const t = convexTest(schema, modules);
    await syncCollection(t, USER, [album(1), album(2), album(3)]);
    expect(await syncCollection(t, USER, [album(3), album(2), album(1)])).toEqual({ added: 0, removed: 0, updated: 0 });
  });

  it("stickyCopies keeps each release at its first position", () => {
    const rows = [album(5), copyHigh, album(6), copyLow].map(toCollectionRow);
    const out = stickyCopies([], rows);
    expect(out.incoming.map((r) => [r.releaseId, r.instanceId])).toEqual([[5, 50], [1, 10], [6, 60]]);
  });
});

describe("syncSelf end to end: the sticky copy survives a folder reorder (DW-04)", () => {
  const TOKEN = "tok-collector";
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": "60" },
    });
  const release = (id: number, instance: number) => ({
    id,
    instance_id: instance,
    rating: 0,
    date_added: "2024-01-01T00:00:00-08:00",
    basic_information: {
      id,
      title: `Title ${id}`,
      year: 1990,
      artists: [{ name: `Artist ${id}`, anv: "" }],
      labels: [{ name: "Label", catno: "CAT" }],
      formats: [{ name: "Vinyl", qty: "1" }],
      cover_image: `cover-${id}`,
      thumb: "",
    },
  });

  /** Folders 2 and 3 each hold a copy of release 1; `order` is the folder
   *  list order Discogs returns, which decides which copy is met first. */
  function stubDiscogs(order: number[]) {
    const byFolder: Record<number, unknown[]> = { 2: [release(1, 10), release(2, 20)], 3: [release(1, 11)] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.endsWith("/collection/folders")) {
          return json({
            folders: [
              { id: 0, name: "All", count: 3 },
              ...order.map((id) => ({ id, name: `F${id}`, count: byFolder[id].length })),
            ],
          });
        }
        if (url.includes("/collection/fields")) return json({ fields: [] });
        const m = url.match(/\/collection\/folders\/(\d+)\/releases/);
        if (m) {
          const items = byFolder[Number(m[1])] ?? [];
          return json({ pagination: { pages: 1, page: 1, items: items.length }, releases: items });
        }
        if (url.includes("/wants")) return json({ pagination: { pages: 1, page: 1, items: 0 }, wants: [] });
        if (url.includes("/collection/value")) return json({ minimum: "$1", median: "$2", maximum: "$3" });
        if (url.endsWith(`/users/${USER}`)) return json({ username: USER, num_collection: 3, num_wantlist: 0 });
        return json({ message: "unexpected" }, 404);
      })
    );
  }

  beforeEach(() => {
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

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

  it("keeps the cached copy (11) when the folder holding the other copy comes first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stubDiscogs([3, 2]);
    const first = await t.action(api.discogs.syncSelf, { sessionToken: TOKEN });
    expect(first.albumCount).toBe(2);
    // Nothing cached yet: the lowest copy wins, not the first one met.
    expect((await collectionRows(t, USER)).find((r) => r.releaseId === 1)?.instanceId).toBe(10);

    // Pretend the app had been showing copy 11 (cached before the sticky rule).
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("collection").collect()).find((r) => r.releaseId === 1)!;
      await ctx.db.patch(row._id, { instanceId: 11, folderId: 3, folder: "F3" });
    });
    for (const order of [[2, 3], [3, 2]]) {
      stubDiscogs(order);
      await t.action(api.discogs.syncSelf, { sessionToken: TOKEN });
      const rows = await collectionRows(t, USER);
      expect(rows.filter((r) => r.releaseId === 1).map((r) => r.instanceId)).toEqual([11]);
      expect(rows).toHaveLength(2);
    }
  });
});
