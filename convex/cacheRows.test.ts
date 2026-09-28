import { describe, expect, it } from "vitest";
import {
  collectionRowFields,
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
