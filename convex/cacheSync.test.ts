// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  albumSignature,
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

type T = ReturnType<typeof convexTest>;

function syncCollection(t: T, username: string, albums: SyncedAlbum[]) {
  return syncCacheInChunks({
    incoming: albums.map(toCollectionRow),
    keyOf: (row) => row.releaseId,
    signatureOf: albumSignature,
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
