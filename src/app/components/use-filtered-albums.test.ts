import { describe, expect, it } from "vitest";
import { filterAndSortAlbums, type FilterAlbumsOptions } from "./use-filtered-albums";
import { makeAlbum } from "../../test/factories";

function run(overrides: Partial<FilterAlbumsOptions>) {
  return filterAndSortAlbums({
    albums: [],
    activeFolders: [],
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

  it("filters by folder, passing everything through when none are selected", () => {
    const albums = [
      makeAlbum({ folder: "Jazz" }),
      makeAlbum({ folder: "Rock" }),
      makeAlbum({ folder: "Jazz" }),
    ];
    expect(run({ albums, activeFolders: ["Jazz"] })).toHaveLength(2);
    expect(run({ albums, activeFolders: [] })).toHaveLength(3);
  });

  // A release lives in exactly one folder, so folders OR together — AND would
  // always match nothing, which is the trap this test exists to pin down.
  it("ORs multiple folders together", () => {
    const albums = [
      makeAlbum({ folder: "Jazz" }),
      makeAlbum({ folder: "Rock" }),
      makeAlbum({ folder: "Folk" }),
    ];
    expect(run({ albums, activeFolders: ["Jazz", "Folk"] })).toHaveLength(2);
    expect(run({ albums, activeFolders: ["Jazz", "Rock", "Folk"] })).toHaveLength(3);
  });

  it("ignores a selected folder no album lives in", () => {
    const albums = [makeAlbum({ folder: "Jazz" })];
    expect(run({ albums, activeFolders: ["Jazz", "Deleted"] })).toHaveLength(1);
    expect(run({ albums, activeFolders: ["Deleted"] })).toHaveLength(0);
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

  it("trims the search query before matching", () => {
    // iOS autocorrect appends a space after a completed word. Matching the raw
    // string made that return nothing, which reads as an empty collection.
    const albums = [
      makeAlbum({ artist: "Miles Davis", title: "Kind of Blue", label: "Columbia" }),
      makeAlbum({ artist: "Neu!", title: "Neu! 75", label: "Brain" }),
    ];
    expect(run({ albums, searchQuery: "davis " })).toHaveLength(1);
    expect(run({ albums, searchQuery: " miles" })).toHaveLength(1);
    expect(run({ albums, searchQuery: "  kind of blue  " })).toHaveLength(1);
  });

  it("treats a whitespace-only query as no search at all", () => {
    const albums = [makeAlbum(), makeAlbum()];
    expect(run({ albums, searchQuery: "   " })).toHaveLength(2);
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

  it("returns nothing when both play filters are set", () => {
    // The two are complements, so together they ask for releases that both
    // have a play and have none. The filter is right to return nothing; it is
    // the STATE that must never get here, which is why app-context makes the
    // two setters mutually exclusive. Pinned so that stays deliberate — an
    // empty crate with two contradictory chips reads as lost data.
    const played = makeAlbum();
    const unplayed = makeAlbum();
    const lastPlayed = { [played.id]: "2024-06-01T00:00:00Z" };
    expect(
      run({
        albums: [played, unplayed],
        lastPlayed,
        neverPlayedFilter: true,
        playsRecordedFilter: true,
      })
    ).toEqual([]);
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

  it("sinks unknown years to the bottom of 'oldest first'", () => {
    // Discogs sends year 0 for "no release date". It is missing data, not the
    // year zero, so it must not lead the oldest-first list — same convention
    // as the year-old rule in convex/stackRules.ts.
    const albums = [
      makeAlbum({ year: 0 }),
      makeAlbum({ year: 1972 }),
      makeAlbum({ year: 0 }),
      makeAlbum({ year: 1965 }),
    ];
    expect(run({ albums, effectiveSortOption: "year-old" }).map((a) => a.year))
      .toEqual([1965, 1972, 0, 0]);
    // Newest-first already sank them; check it stayed that way.
    expect(run({ albums, effectiveSortOption: "year-new" }).map((a) => a.year))
      .toEqual([1972, 1965, 0, 0]);
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

  it("sinks rows with no dateAdded in both add-order sorts", () => {
    // The sync writes "" when Discogs omits date_added. `new Date("")` is NaN,
    // and a comparator returning NaN leaves the whole order undefined.
    const undated = makeAlbum({ dateAdded: "" });
    const oldest = makeAlbum({ dateAdded: "2020-03-01" });
    const newest = makeAlbum({ dateAdded: "2025-11-20" });
    const albums = [oldest, undated, newest];

    expect(run({ albums, effectiveSortOption: "added-new" }).map((a) => a.id))
      .toEqual([newest.id, oldest.id, undated.id]);
    expect(run({ albums, effectiveSortOption: "added-old" }).map((a) => a.id))
      .toEqual([oldest.id, newest.id, undated.id]);
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

  it("filters by media type via formatFilter, passing everything through when null", () => {
    const albums = [
      makeAlbum({ format: "Vinyl, LP, Album" }),
      makeAlbum({ format: "CD, Album" }),
      makeAlbum({ format: "Box Set, Cassette; Cassette" }),
      makeAlbum({ format: "Vinyl, 12\"" }),
    ];
    expect(run({ albums, formatFilter: "Vinyl" })).toHaveLength(2);
    expect(run({ albums, formatFilter: "CD" })).toHaveLength(1);
    expect(run({ albums, formatFilter: "Cassette" })).toHaveLength(1);
    expect(run({ albums, formatFilter: null })).toHaveLength(4);
    expect(run({ albums })).toHaveLength(4);
  });

  it("combines formatFilter with folder and search", () => {
    const albums = [
      makeAlbum({ folder: "Jazz", artist: "Miles Davis", format: "Vinyl, LP" }),
      makeAlbum({ folder: "Jazz", artist: "Miles Davis", format: "CD" }),
      makeAlbum({ folder: "Rock", artist: "Miles Davis", format: "CD" }),
    ];
    const result = run({ albums, activeFolders: ["Jazz"], formatFilter: "CD", searchQuery: "miles" });
    expect(result).toHaveLength(1);
    expect(result[0].folder).toBe("Jazz");
  });

  it("applies filters before sort — folder + search combine", () => {
    const albums = [
      makeAlbum({ folder: "Jazz", artist: "Alice Coltrane" }),
      makeAlbum({ folder: "Jazz", artist: "Sun Ra" }),
      makeAlbum({ folder: "Rock", artist: "Alice Cooper" }),
    ];
    const result = run({ albums, activeFolders: ["Jazz"], searchQuery: "alice" });
    expect(result.map((a) => a.artist)).toEqual(["Alice Coltrane"]);
  });
});

describe("rating filter and sort", () => {
  // Discogs sends `rating: 0` for unrated. The mapper strips it, but the
  // filter must not reintroduce the trap by testing `rating < 1`.
  it("unratedFilter keeps only records with no rating", () => {
    const albums = [
      makeAlbum({ artist: "Rated", rating: 3 }),
      makeAlbum({ artist: "Unrated" }),
      makeAlbum({ artist: "One star", rating: 1 }),
    ];
    const out = run({ albums, unratedFilter: true });
    expect(out.map((a) => a.artist)).toEqual(["Unrated"]);
  });

  it("unratedFilter treats a stray 0 as unrated, not as a rating", () => {
    const albums = [makeAlbum({ artist: "Zero", rating: 0 })];
    expect(run({ albums, unratedFilter: true })).toHaveLength(1);
  });

  it("unratedFilter off leaves ratings alone", () => {
    const albums = [makeAlbum({ rating: 4 }), makeAlbum()];
    expect(run({ albums })).toHaveLength(2);
  });

  it("rating-high sorts highest first", () => {
    const albums = [
      makeAlbum({ artist: "Two", rating: 2 }),
      makeAlbum({ artist: "Five", rating: 5 }),
      makeAlbum({ artist: "Four", rating: 4 }),
    ];
    const out = run({ albums, effectiveSortOption: "rating-high" });
    expect(out.map((a) => a.artist)).toEqual(["Five", "Four", "Two"]);
  });

  it("rating-high sinks unrated below one-star — unrated is not zero stars", () => {
    const albums = [
      makeAlbum({ artist: "Unrated" }),
      makeAlbum({ artist: "One", rating: 1 }),
    ];
    const out = run({ albums, effectiveSortOption: "rating-high" });
    expect(out.map((a) => a.artist)).toEqual(["One", "Unrated"]);
  });

  it("combines the unrated filter with a folder filter", () => {
    const albums = [
      makeAlbum({ artist: "A", folder: "Jazz" }),
      makeAlbum({ artist: "B", folder: "Jazz", rating: 5 }),
      makeAlbum({ artist: "C", folder: "Rock" }),
    ];
    const out = run({ albums, unratedFilter: true, activeFolders: ["Jazz"] });
    expect(out.map((a) => a.artist)).toEqual(["A"]);
  });
});
