import { describe, expect, it } from "vitest";
import {
  chunkCacheDiff,
  collectionRowFields,
  planCacheDiff,
  toCollectionRow,
  toWantRow,
  wantRowFields,
  type SyncedAlbum,
  type SyncedWant,
} from "./cacheRows";

// Every optional field populated, so a field the projection forgets shows up
// as a missing key rather than hiding behind `undefined`.
const fullAlbum: SyncedAlbum = {
  release_id: 101,
  master_id: 55,
  instance_id: 9001,
  folder_id: 3,
  title: "Kind of Blue",
  artist: "Miles Davis",
  year: 1959,
  thumb: "t.jpg",
  cover: "c.jpg",
  folder: "Jazz",
  label: "Columbia",
  catalogNumber: "CL 1355",
  format: "Vinyl, LP, Album",
  mediaCondition: "Very Good Plus (VG+)",
  sleeveCondition: "Very Good (VG)",
  notes: "Six-eye",
  customFields: [{ name: "Shelf", value: "A3", fieldId: 4, type: "textarea" }],
  dateAdded: "2024-06-15",
  genres: ["Jazz"],
  styles: ["Modal", "Cool Jazz"],
  rating: 5,
  discCount: 1,
  artistIds: [23755],
};

const fullWant: SyncedWant = {
  release_id: 202,
  master_id: 66,
  title: "A Love Supreme",
  artist: "John Coltrane",
  year: 1965,
  thumb: "t.jpg",
  cover: "c.jpg",
  label: "Impulse!",
  format: "Vinyl, LP, Album",
  genres: ["Jazz"],
  styles: ["Hard Bop"],
  discCount: 1,
  artistIds: [97545],
  dateAdded: "2025-01-02",
  priority: false,
};

const definedKeys = (o: object) =>
  Object.entries(o)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();

describe("toCollectionRow", () => {
  it("forwards every field the collection cache accepts", () => {
    expect(definedKeys(toCollectionRow(fullAlbum))).toEqual(
      Object.keys(collectionRowFields).sort()
    );
  });

  it("carries the free-data fields through (the fields sync used to drop)", () => {
    const row = toCollectionRow(fullAlbum);
    expect(row.genres).toEqual(["Jazz"]);
    expect(row.styles).toEqual(["Modal", "Cool Jazz"]);
    expect(row.rating).toBe(5);
    expect(row.discCount).toBe(1);
    expect(row.artistIds).toEqual([23755]);
  });

  it("drops master id 0 (no master) rather than storing it", () => {
    expect(toCollectionRow({ ...fullAlbum, master_id: 0 }).masterId).toBeUndefined();
  });
});

describe("toWantRow", () => {
  it("forwards every field the wantlist cache accepts", () => {
    expect(definedKeys(toWantRow(fullWant))).toEqual(Object.keys(wantRowFields).sort());
  });

  it("stores empty thumb and format as absent, not empty strings", () => {
    const row = toWantRow({ ...fullWant, thumb: "", format: "" });
    expect(row.thumb).toBeUndefined();
    expect(row.format).toBeUndefined();
  });
});

describe("planCacheDiff", () => {
  type Row = { key: number; v: string };
  const keyOf = (r: Row) => r.key;
  const sigOf = (r: Row) => r.v;
  const cached = (id: string, key: number, signature: string) => ({ id, key, signature });

  it("inserts new keys, patches changed ones, skips unchanged, deletes missing", () => {
    const plan = planCacheDiff(
      [cached("a", 1, "same"), cached("b", 2, "old"), cached("c", 3, "gone")],
      [
        { key: 1, v: "same" },
        { key: 2, v: "new" },
        { key: 4, v: "fresh" },
      ],
      keyOf,
      sigOf
    );
    expect(plan.inserts).toEqual([{ key: 4, v: "fresh" }]);
    expect(plan.patches).toEqual([{ id: "b", row: { key: 2, v: "new" } }]);
    expect(plan.deletes).toEqual(["c"]);
  });

  it("deletes duplicate cached rows for one key, keeping the first", () => {
    const plan = planCacheDiff(
      [cached("a", 1, "x"), cached("dup", 1, "x")],
      [{ key: 1, v: "x" }],
      keyOf,
      sigOf
    );
    expect(plan).toEqual({ inserts: [], patches: [], deletes: ["dup"] });
  });

  it("keeps the first of two incoming rows with the same key", () => {
    const plan = planCacheDiff<string, Row>([], [{ key: 1, v: "first" }, { key: 1, v: "second" }], keyOf, sigOf);
    expect(plan.inserts).toEqual([{ key: 1, v: "first" }]);
  });

  it("an empty fetch plans deleting everything (callers must skip a failed fetch)", () => {
    const plan = planCacheDiff([cached("a", 1, "x")], [] as Row[], keyOf, sigOf);
    expect(plan.deletes).toEqual(["a"]);
  });
});

describe("chunkCacheDiff", () => {
  it("bounds every chunk and puts every upsert before any delete", () => {
    const plan = {
      inserts: Array.from({ length: 5 }, (_, i) => ({ n: i })),
      patches: Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, row: { n: 100 + i } })),
      deletes: ["d1", "d2", "d3"],
    };
    const chunks = chunkCacheDiff(plan, 3, 2);
    expect(chunks.map((c) => c.inserts.length + c.patches.length + c.deletes.length)).toEqual([3, 3, 2, 2, 1]);
    const firstDelete = chunks.findIndex((c) => c.deletes.length > 0);
    expect(chunks.slice(firstDelete).every((c) => c.inserts.length + c.patches.length === 0)).toBe(true);
    expect(chunks.flatMap((c) => c.inserts)).toEqual(plan.inserts);
    expect(chunks.flatMap((c) => c.patches)).toEqual(plan.patches);
    expect(chunks.flatMap((c) => c.deletes)).toEqual(plan.deletes);
  });

  it("an empty plan writes nothing", () => {
    expect(chunkCacheDiff({ inserts: [], patches: [], deletes: [] })).toEqual([]);
  });
});
