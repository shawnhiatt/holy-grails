import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  evaluateStackRule,
  matchesRule,
  rotationBucket,
  seededShuffle,
  ROTATION_OFFSET_MS,
  type RuleAlbum,
  type StackRule,
} from "./stackRules";

let seq = 0;
function album(overrides: Partial<RuleAlbum> = {}): RuleAlbum {
  seq += 1;
  return {
    releaseId: 1000 + seq,
    artist: `Artist ${seq}`,
    title: `Title ${seq}`,
    label: "Blue Note",
    year: 1975,
    format: "Vinyl, LP, Album",
    folder: "Uncategorized",
    mediaCondition: "Very Good Plus (VG+)",
    dateAdded: "2024-01-01",
    purgeTag: null,
    ...overrides,
  };
}

function rule(overrides: Partial<StackRule> = {}): StackRule {
  return {
    match: "all",
    conditions: [],
    sort: "artist-az",
    rotation: "off",
    ...overrides,
  };
}

const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);
const DAY = 86_400_000;

describe("evaluateCondition — fields and operators", () => {
  it("matches artist by exact value and substring, case-insensitively", () => {
    const a = album({ artist: "Miles Davis" });
    expect(evaluateCondition(a, { field: "artist", op: "is", value: "miles davis" }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "artist", op: "contains", value: "DAVIS" }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "artist", op: "is", value: "Davis" }, NOW)).toBe(false);
  });

  it("matches artistId exactly, which is the point of storing ids", () => {
    const a = album({ artist: "Nirvana (2)", artistIds: [125246] });
    expect(evaluateCondition(a, { field: "artistId", op: "is", value: 125246 }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "artistId", op: "is", value: 999 }, NOW)).toBe(false);
  });

  it("treats year 0 as missing data, not as a year", () => {
    const a = album({ year: 0 });
    // Every year comparison must fail — a record with no release date is not
    // "before 1980", it is unknown.
    expect(evaluateCondition(a, { field: "year", op: "before", value: 1980 }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "year", op: "after", value: 1800 }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "year", op: "is", value: 0 }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "decade", op: "is", value: 0 }, NOW)).toBe(false);
  });

  it("handles year before/after/between/is", () => {
    const a = album({ year: 1975 });
    expect(evaluateCondition(a, { field: "year", op: "before", value: 1980 }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "year", op: "after", value: 1980 }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "year", op: "between", value: [1970, 1979] }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "year", op: "between", value: [1980, 1989] }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "year", op: "is", value: 1975 }, NOW)).toBe(true);
  });

  it("derives decade from year", () => {
    expect(evaluateCondition(album({ year: 1975 }), { field: "decade", op: "is", value: 1970 }, NOW)).toBe(true);
    expect(evaluateCondition(album({ year: 1980 }), { field: "decade", op: "is", value: 1970 }, NOW)).toBe(false);
  });

  it("searches genres and styles as one namespace", () => {
    // Discogs files the same word as a genre on one release and a style on
    // another, so "jazz" has to find both.
    const g = album({ genres: ["Jazz"], styles: [] });
    const s = album({ genres: [], styles: ["Hard Bop"] });
    expect(evaluateCondition(g, { field: "genre", op: "includesAny", value: ["jazz"] }, NOW)).toBe(true);
    expect(evaluateCondition(s, { field: "style", op: "includesAny", value: ["hard bop"] }, NOW)).toBe(true);
    expect(evaluateCondition(g, { field: "genre", op: "includesAny", value: ["rock"] }, NOW)).toBe(false);
  });

  it("excludesAll passes a record carrying none of the listed tags", () => {
    const a = album({ genres: ["Jazz"] });
    expect(evaluateCondition(a, { field: "genre", op: "excludesAll", value: ["rock", "pop"] }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "genre", op: "excludesAll", value: ["jazz"] }, NOW)).toBe(false);
  });

  it("classifies mediaType from the raw format string", () => {
    const cd = album({ format: "CD, Album, Reissue" });
    expect(evaluateCondition(cd, { field: "mediaType", op: "is", value: "CD" }, NOW)).toBe(true);
    expect(evaluateCondition(cd, { field: "mediaType", op: "isNot", value: "Vinyl" }, NOW)).toBe(true);
  });

  it("matches raw format descriptors that mediaType buckets away", () => {
    const a = album({ format: 'Vinyl, 7", 45 RPM, Picture Disc' });
    expect(evaluateCondition(a, { field: "format", op: "contains", value: "45 rpm" }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "format", op: "contains", value: "box set" }, NOW)).toBe(false);
  });

  it("ranks conditions so atLeast means 'this good or better'", () => {
    const vgPlus = album({ mediaCondition: "Very Good Plus (VG+)" });
    expect(evaluateCondition(vgPlus, { field: "mediaCondition", op: "atLeast", value: "Very Good (VG)" }, NOW)).toBe(true);
    expect(evaluateCondition(vgPlus, { field: "mediaCondition", op: "atLeast", value: "Mint (M)" }, NOW)).toBe(false);
    expect(evaluateCondition(vgPlus, { field: "mediaCondition", op: "is", value: "Very Good Plus (VG+)" }, NOW)).toBe(true);
  });

  it("fails an ungraded copy on atLeast rather than passing it by default", () => {
    const ungraded = album({ mediaCondition: "" });
    expect(evaluateCondition(ungraded, { field: "mediaCondition", op: "atLeast", value: "Very Good (VG)" }, NOW)).toBe(false);
  });

  it("treats an unrated record as unrated, never as zero stars", () => {
    const unrated = album({ rating: undefined });
    const zero = album({ rating: 0 });
    expect(evaluateCondition(unrated, { field: "rating", op: "unrated" }, NOW)).toBe(true);
    expect(evaluateCondition(zero, { field: "rating", op: "unrated" }, NOW)).toBe(true);
    // The trap this guards: a naive `rating < 1` would sweep every unrated
    // record into "one star or lower".
    expect(evaluateCondition(unrated, { field: "rating", op: "atMost", value: 2 }, NOW)).toBe(false);
    expect(evaluateCondition(unrated, { field: "rating", op: "atLeast", value: 1 }, NOW)).toBe(false);
  });

  it("compares real ratings", () => {
    const a = album({ rating: 4 });
    expect(evaluateCondition(a, { field: "rating", op: "atLeast", value: 4 }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "rating", op: "atLeast", value: 5 }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "rating", op: "is", value: 4 }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "rating", op: "unrated" }, NOW)).toBe(false);
  });

  it("handles purge tags including untagged", () => {
    const keep = album({ purgeTag: "keep" });
    const none = album({ purgeTag: null });
    expect(evaluateCondition(keep, { field: "purgeTag", op: "is", value: "keep" }, NOW)).toBe(true);
    expect(evaluateCondition(keep, { field: "purgeTag", op: "isNot", value: "cut" }, NOW)).toBe(true);
    expect(evaluateCondition(none, { field: "purgeTag", op: "untagged" }, NOW)).toBe(true);
    expect(evaluateCondition(keep, { field: "purgeTag", op: "untagged" }, NOW)).toBe(false);
  });

  it("counts never-played as not-within-N-days, and never as within", () => {
    const never = album({ lastPlayedAt: null });
    const recent = album({ lastPlayedAt: NOW - 3 * DAY });
    expect(evaluateCondition(never, { field: "lastPlayed", op: "never" }, NOW)).toBe(true);
    expect(evaluateCondition(never, { field: "lastPlayed", op: "withinDays", value: 30 }, NOW)).toBe(false);
    expect(evaluateCondition(never, { field: "lastPlayed", op: "notWithinDays", value: 30 }, NOW)).toBe(true);
    expect(evaluateCondition(recent, { field: "lastPlayed", op: "withinDays", value: 30 }, NOW)).toBe(true);
    expect(evaluateCondition(recent, { field: "lastPlayed", op: "notWithinDays", value: 30 }, NOW)).toBe(false);
  });

  it("treats a missing play count as zero", () => {
    expect(evaluateCondition(album(), { field: "playCount", op: "atLeast", value: 1 }, NOW)).toBe(false);
    expect(evaluateCondition(album({ playCount: 3 }), { field: "playCount", op: "atLeast", value: 2 }, NOW)).toBe(true);
  });

  it("compares dateAdded by window and by absolute date", () => {
    const a = album({ dateAdded: new Date(NOW - 10 * DAY).toISOString() });
    expect(evaluateCondition(a, { field: "dateAdded", op: "withinDays", value: 30 }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "dateAdded", op: "withinDays", value: 5 }, NOW)).toBe(false);
    expect(evaluateCondition(a, { field: "dateAdded", op: "after", value: "2020-01-01" }, NOW)).toBe(true);
    expect(evaluateCondition(a, { field: "dateAdded", op: "before", value: "2020-01-01" }, NOW)).toBe(false);
  });

  it("never treats an unpriced record as worth $0", () => {
    // null = priced, no listings. undefined = never priced. Neither is a
    // number, and both must fail rather than sorting in at zero.
    const nolistings = album({ marketValue: null });
    const unpriced = album({ marketValue: undefined });
    const priced = album({ marketValue: 40 });
    expect(evaluateCondition(nolistings, { field: "marketValue", op: "atMost", value: 10 }, NOW)).toBe(false);
    expect(evaluateCondition(unpriced, { field: "marketValue", op: "atMost", value: 10 }, NOW)).toBe(false);
    expect(evaluateCondition(priced, { field: "marketValue", op: "atLeast", value: 30 }, NOW)).toBe(true);
  });

  it("returns null — not false — for an unknown field or operator", () => {
    expect(evaluateCondition(album(), { field: "runtime", op: "atMost", value: 40 }, NOW)).toBeNull();
    expect(evaluateCondition(album(), { field: "artist", op: "soundsLike", value: "x" }, NOW)).toBeNull();
  });
});

describe("matchesRule", () => {
  it("all requires every condition; any requires one", () => {
    const a = album({ year: 1975, genres: ["Jazz"] });
    const conds = [
      { field: "year", op: "before", value: 1980 },
      { field: "genre", op: "includesAny", value: ["rock"] },
    ];
    expect(matchesRule(a, rule({ match: "all", conditions: conds }), NOW)).toBe(false);
    expect(matchesRule(a, rule({ match: "any", conditions: conds }), NOW)).toBe(true);
  });

  it("ignores an unrecognized condition rather than throwing on it", () => {
    // Forward compatibility: an older deployment reading a newer rule must
    // still return the records it does understand.
    const a = album({ year: 1975 });
    const r = rule({
      conditions: [
        { field: "year", op: "before", value: 1980 },
        { field: "runtime", op: "atMost", value: 40 },
      ],
    });
    expect(matchesRule(a, r, NOW)).toBe(true);
  });

  it("matches nothing when every condition is unrecognized", () => {
    // The fail-safe direction. An empty session is recoverable; a session that
    // silently swallowed the whole collection is not.
    const r = rule({ conditions: [{ field: "runtime", op: "atMost", value: 40 }] });
    expect(matchesRule(album(), r, NOW)).toBe(false);
  });

  it("matches nothing for a rule with no conditions at all", () => {
    expect(matchesRule(album(), rule({ conditions: [] }), NOW)).toBe(false);
  });
});

describe("seededShuffle", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it("is deterministic for a given seed", () => {
    expect(seededShuffle(items, "abc")).toEqual(seededShuffle(items, "abc"));
  });

  it("gives a different order for a different seed", () => {
    expect(seededShuffle(items, "abc")).not.toEqual(seededShuffle(items, "abd"));
  });

  it("does not mutate the input and keeps every element", () => {
    const before = [...items];
    const out = seededShuffle(items, "seed");
    expect(items).toEqual(before);
    expect([...out].sort((a, b) => a - b)).toEqual(before);
  });
});

describe("rotationBucket", () => {
  it("holds steady within a period and advances to the next", () => {
    const t = Date.UTC(2026, 6, 25, 12, 0, 0);
    expect(rotationBucket("daily", t)).toBe(rotationBucket("daily", t + 60_000));
    expect(rotationBucket("daily", t + DAY)).toBe(rotationBucket("daily", t) + 1);
    expect(rotationBucket("weekly", t + 7 * DAY)).toBe(rotationBucket("weekly", t) + 1);
  });

  it("flips in the early morning US time, not mid-evening", () => {
    // The whole point of the offset: a naive UTC bucket rolls over at 00:00
    // UTC, which is late afternoon in the US — the worst possible moment for
    // a session to change under someone.
    const justBefore = Date.UTC(2026, 6, 25, 0, 0, 0) + ROTATION_OFFSET_MS - 1000;
    const justAfter = justBefore + 2000;
    expect(rotationBucket("daily", justAfter)).toBe(rotationBucket("daily", justBefore) + 1);
    // Sanity: the flip lands at 10:00 UTC, i.e. before dawn on the US west coast.
    expect(new Date(justAfter).getUTCHours()).toBe(10);
  });
});

describe("evaluateStackRule", () => {
  const jazz = (n: number, year: number) =>
    album({ releaseId: n, artist: `A${String(n).padStart(3, "0")}`, year, genres: ["Jazz"] });

  it("filters, then caps, then sorts", () => {
    const albums = [jazz(1, 1975), jazz(2, 1965), jazz(3, 1985), album({ genres: ["Rock"], year: 1975 })];
    const r = rule({
      conditions: [
        { field: "genre", op: "includesAny", value: ["jazz"] },
        { field: "year", op: "before", value: 1980 },
      ],
      sort: "year-old",
    });
    const out = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    expect(out.albums.map((a) => a.year)).toEqual([1965, 1975]);
    expect(out.poolSize).toBe(2);
    expect(out.rotating).toBe(false);
  });

  it("removes excluded records before the cap is applied", () => {
    const albums = [jazz(1, 1970), jazz(2, 1971), jazz(3, 1972)];
    const r = rule({ conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }] });
    const out = evaluateStackRule(albums, r, { stackId: "s1", excludedIds: [2], now: NOW });
    expect(out.albums.map((a) => a.releaseId)).toEqual([1, 3]);
    expect(out.poolSize).toBe(2);
  });

  it("does not rotate when the pool barely exceeds the cap", () => {
    // Below 1.5x, a reshuffle returns nearly the same records and reads as
    // noise rather than freshness.
    const albums = Array.from({ length: 12 }, (_, i) => jazz(i + 1, 1970 + i));
    const r = rule({
      conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }],
      limit: 10,
      rotation: "daily",
    });
    const out = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    expect(out.rotating).toBe(false);
    expect(out.albums).toHaveLength(10);
  });

  it("rotates once the pool clears 1.5x the cap", () => {
    const albums = Array.from({ length: 30 }, (_, i) => jazz(i + 1, 1970 + i));
    const r = rule({
      conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }],
      limit: 10,
      rotation: "daily",
    });
    const today = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    const laterToday = evaluateStackRule(albums, r, { stackId: "s1", now: NOW + 60_000 });
    const tomorrow = evaluateStackRule(albums, r, { stackId: "s1", now: NOW + DAY });

    expect(today.rotating).toBe(true);
    expect(today.albums).toHaveLength(10);
    // Same set all period...
    expect(laterToday.albums.map((a) => a.releaseId)).toEqual(today.albums.map((a) => a.releaseId));
    // ...a different one next period.
    expect(tomorrow.albums.map((a) => a.releaseId)).not.toEqual(today.albums.map((a) => a.releaseId));
  });

  it("gives two sessions different rolls from the same pool", () => {
    const albums = Array.from({ length: 30 }, (_, i) => jazz(i + 1, 1970 + i));
    const r = rule({
      conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }],
      limit: 10,
      rotation: "daily",
    });
    const a = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    const b = evaluateStackRule(albums, r, { stackId: "s2", now: NOW });
    expect(a.albums.map((x) => x.releaseId)).not.toEqual(b.albums.map((x) => x.releaseId));
  });

  it("still honors the sort while rotating — rotation picks, sort orders", () => {
    const albums = Array.from({ length: 30 }, (_, i) => jazz(i + 1, 1970 + i));
    const r = rule({
      conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }],
      limit: 10,
      rotation: "daily",
      sort: "year-old",
    });
    const out = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    const years = out.albums.map((a) => a.year);
    expect(years).toEqual([...years].sort((x, y) => x - y));
  });

  it("reports the full pool size even when capped, for the 'N of M' line", () => {
    const albums = Array.from({ length: 148 }, (_, i) => jazz(i + 1, 1970));
    const r = rule({
      conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }],
      limit: 25,
      rotation: "daily",
    });
    const out = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    expect(out.albums).toHaveLength(25);
    expect(out.poolSize).toBe(148);
  });

  it("returns everything when there is no cap", () => {
    const albums = Array.from({ length: 40 }, (_, i) => jazz(i + 1, 1970));
    const r = rule({
      conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }],
      rotation: "daily",
    });
    const out = evaluateStackRule(albums, r, { stackId: "s1", now: NOW });
    expect(out.albums).toHaveLength(40);
    // Rotation is meaningless without a cap — there is nothing to choose.
    expect(out.rotating).toBe(false);
  });

  it("returns an empty set for a rule it cannot understand at all", () => {
    const albums = [jazz(1, 1975)];
    const r = rule({ conditions: [{ field: "runtime", op: "atMost", value: 40 }] });
    expect(evaluateStackRule(albums, r, { stackId: "s1", now: NOW }).albums).toHaveLength(0);
  });

  it("picks up a newly added record with no write path — the whole design", () => {
    const r = rule({ conditions: [{ field: "genre", op: "includesAny", value: ["jazz"] }] });
    const before = [jazz(1, 1975)];
    const after = [...before, jazz(2, 1961)];
    expect(evaluateStackRule(before, r, { stackId: "s1", now: NOW }).albums).toHaveLength(1);
    expect(evaluateStackRule(after, r, { stackId: "s1", now: NOW }).albums).toHaveLength(2);
  });
});
