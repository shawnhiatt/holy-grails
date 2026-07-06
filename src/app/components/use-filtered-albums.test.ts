import { describe, expect, it } from "vitest";
import { filterAndSortAlbums, type FilterAlbumsOptions } from "./use-filtered-albums";
import { makeAlbum } from "../../test/factories";

function run(overrides: Partial<FilterAlbumsOptions>) {
  return filterAndSortAlbums({
    albums: [],
    activeFolder: "All",
    searchQuery: "",
    neverPlayedFilter: false,
    playsRecordedFilter: false,
    lastPlayed: {},
    effectiveSortOption: "artist-az",
    ...overrides,
  });
}

describe("filterAndSortAlbums", () => {
  it("does not mutate the input array", () => {
    const albums = [
      makeAlbum({ artist: "Zebra" }),
      makeAlbum({ artist: "Aerosmith" }),
    ];
    const before = [...albums];
    run({ albums, effectiveSortOption: "artist-az" });
    expect(albums).toEqual(before);
  });

  it("filters by folder, passing everything through for 'All'", () => {
    const albums = [
      makeAlbum({ folder: "Jazz" }),
      makeAlbum({ folder: "Rock" }),
      makeAlbum({ folder: "Jazz" }),
    ];
    expect(run({ albums, activeFolder: "Jazz" })).toHaveLength(2);
    expect(run({ albums, activeFolder: "All" })).toHaveLength(3);
  });

  it("searches artist, title, and label case-insensitively", () => {
    const albums = [
      makeAlbum({ artist: "Talking Heads", title: "Remain in Light", label: "Sire" }),
      makeAlbum({ artist: "Neu!", title: "Neu! 75", label: "Brain" }),
      makeAlbum({ artist: "Can", title: "Ege Bamyasi", label: "United Artists" }),
    ];
    expect(run({ albums, searchQuery: "TALKING" })).toHaveLength(1);
    expect(run({ albums, searchQuery: "bamyasi" })).toHaveLength(1);
    expect(run({ albums, searchQuery: "brain" })).toHaveLength(1);
    expect(run({ albums, searchQuery: "zzz-no-match" })).toHaveLength(0);
  });

  it("whitespace-only search matches everything", () => {
    const albums = [makeAlbum(), makeAlbum()];
    expect(run({ albums, searchQuery: "   " })).toHaveLength(2);
  });

  it("neverPlayed and playsRecorded filters partition on lastPlayed", () => {
    const played = makeAlbum();
    const unplayed = makeAlbum();
    const lastPlayed = { [played.id]: "2024-06-01T00:00:00Z" };
    const albums = [played, unplayed];

    const never = run({ albums, lastPlayed, neverPlayedFilter: true });
    expect(never.map((a) => a.id)).toEqual([unplayed.id]);

    const recorded = run({ albums, lastPlayed, playsRecordedFilter: true });
    expect(recorded.map((a) => a.id)).toEqual([played.id]);
  });

  it("sorts by artist A→Z and Z→A", () => {
    const albums = [
      makeAlbum({ artist: "Wire" }),
      makeAlbum({ artist: "Broadcast" }),
      makeAlbum({ artist: "Stereolab" }),
    ];
    expect(run({ albums, effectiveSortOption: "artist-az" }).map((a) => a.artist))
      .toEqual(["Broadcast", "Stereolab", "Wire"]);
    expect(run({ albums, effectiveSortOption: "artist-za" }).map((a) => a.artist))
      .toEqual(["Wire", "Stereolab", "Broadcast"]);
  });

  it("sorts by year in both directions", () => {
    const albums = [
      makeAlbum({ year: 1991 }),
      makeAlbum({ year: 1969 }),
      makeAlbum({ year: 2020 }),
    ];
    expect(run({ albums, effectiveSortOption: "year-new" }).map((a) => a.year))
      .toEqual([2020, 1991, 1969]);
    expect(run({ albums, effectiveSortOption: "year-old" }).map((a) => a.year))
      .toEqual([1969, 1991, 2020]);
  });

  it("sorts by date added in both directions", () => {
    const oldest = makeAlbum({ dateAdded: "2020-03-01T00:00:00-08:00" });
    const newest = makeAlbum({ dateAdded: "2025-11-20T00:00:00-08:00" });
    const middle = makeAlbum({ dateAdded: "2023-07-15T00:00:00-08:00" });
    const albums = [oldest, newest, middle];

    expect(run({ albums, effectiveSortOption: "added-new" }).map((a) => a.id))
      .toEqual([newest.id, middle.id, oldest.id]);
    expect(run({ albums, effectiveSortOption: "added-old" }).map((a) => a.id))
      .toEqual([oldest.id, middle.id, newest.id]);
  });

  it("last-played-oldest puts never-played albums first", () => {
    const playedRecently = makeAlbum();
    const playedLongAgo = makeAlbum();
    const neverPlayed = makeAlbum();
    const lastPlayed = {
      [playedRecently.id]: "2026-06-01T00:00:00Z",
      [playedLongAgo.id]: "2022-01-01T00:00:00Z",
    };
    const result = run({
      albums: [playedRecently, playedLongAgo, neverPlayed],
      lastPlayed,
      effectiveSortOption: "last-played-oldest",
    });
    expect(result.map((a) => a.id)).toEqual([
      neverPlayed.id,
      playedLongAgo.id,
      playedRecently.id,
    ]);
  });

  it("applies filters before sort — folder + search combine", () => {
    const albums = [
      makeAlbum({ folder: "Jazz", artist: "Alice Coltrane" }),
      makeAlbum({ folder: "Jazz", artist: "Sun Ra" }),
      makeAlbum({ folder: "Rock", artist: "Alice Cooper" }),
    ];
    const result = run({ albums, activeFolder: "Jazz", searchQuery: "alice" });
    expect(result.map((a) => a.artist)).toEqual(["Alice Coltrane"]);
  });
});
