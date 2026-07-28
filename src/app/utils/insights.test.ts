import { describe, expect, it } from "vitest";
import {
  parseAddedYear,
  bucketAddsByYear,
  cumulativeAddsByYear,
  countAddedWithin,
} from "./insights";
import { makeAlbum } from "../../test/factories";

describe("parseAddedYear", () => {
  it("extracts the year from an ISO date", () => {
    expect(parseAddedYear("2024-01-01T00:00:00-08:00")).toBe(2024);
    expect(parseAddedYear("2019-12-31")).toBe(2019);
  });

  it("returns null for missing or unparseable dates", () => {
    expect(parseAddedYear("")).toBeNull();
    expect(parseAddedYear(null)).toBeNull();
    expect(parseAddedYear("not a date")).toBeNull();
    expect(parseAddedYear("1899-01-01")).toBeNull(); // pre-1900 guard
  });
});

describe("bucketAddsByYear", () => {
  it("counts adds per year, sorted ascending", () => {
    const albums = [
      makeAlbum({ dateAdded: "2022-01-01T00:00:00-08:00" }),
      makeAlbum({ dateAdded: "2024-05-01T00:00:00-08:00" }),
      makeAlbum({ dateAdded: "2022-08-01T00:00:00-08:00" }),
    ];
    expect(bucketAddsByYear(albums)).toEqual([
      { year: 2022, count: 2 },
      { year: 2024, count: 1 },
    ]);
  });

  it("skips albums with unparseable dateAdded", () => {
    const albums = [
      makeAlbum({ dateAdded: "2023-01-01" }),
      makeAlbum({ dateAdded: "" }),
    ];
    expect(bucketAddsByYear(albums)).toEqual([{ year: 2023, count: 1 }]);
  });

  it("caps to the most recent N years", () => {
    const albums = Array.from({ length: 12 }, (_, i) =>
      makeAlbum({ dateAdded: `${2010 + i}-01-01` })
    );
    const buckets = bucketAddsByYear(albums, 10);
    expect(buckets).toHaveLength(10);
    expect(buckets[0].year).toBe(2012); // 2010, 2011 dropped
    expect(buckets[buckets.length - 1].year).toBe(2021);
  });
});

describe("cumulativeAddsByYear", () => {
  it("accumulates totals across all years, uncapped", () => {
    const albums = [
      makeAlbum({ dateAdded: "2010-01-01" }),
      makeAlbum({ dateAdded: "2010-06-01" }),
      ...Array.from({ length: 11 }, (_, i) =>
        makeAlbum({ dateAdded: `${2011 + i}-01-01` })
      ),
    ];
    const curve = cumulativeAddsByYear(albums);
    expect(curve[0]).toEqual({ year: 2010, total: 2 }); // not capped to 10 years
    expect(curve[curve.length - 1]).toEqual({ year: 2021, total: 13 });
  });

  it("carries the total flat through gap years", () => {
    const albums = [
      makeAlbum({ dateAdded: "2018-01-01" }),
      makeAlbum({ dateAdded: "2018-03-01" }),
      makeAlbum({ dateAdded: "2021-01-01" }),
    ];
    expect(cumulativeAddsByYear(albums)).toEqual([
      { year: 2018, total: 2 },
      { year: 2019, total: 2 },
      { year: 2020, total: 2 },
      { year: 2021, total: 3 },
    ]);
  });

  it("returns empty for albums with no parseable dates", () => {
    expect(cumulativeAddsByYear([makeAlbum({ dateAdded: "" })])).toEqual([]);
    expect(cumulativeAddsByYear([])).toEqual([]);
  });
});

describe("countAddedWithin", () => {
  // Fixed "now" so the window boundaries are exact rather than clock-dependent
  const now = Date.parse("2026-07-28T12:00:00Z");

  it("counts items added inside the window", () => {
    const items = [
      { dateAdded: "2026-07-20" },
      { dateAdded: "2026-07-01" },
      { dateAdded: "2026-05-01" },
    ];
    expect(countAddedWithin(items, 30, now)).toBe(2);
  });

  it("reads both stored shapes — date-only and full ISO", () => {
    const items = [
      { dateAdded: "2026-07-27" },
      { dateAdded: "2026-07-26T18:30:00-07:00" },
    ];
    expect(countAddedWithin(items, 30, now)).toBe(2);
  });

  it("skips empty and unparseable dates rather than counting them", () => {
    // This is what makes the wantlist backfill graceful: rows cached before
    // dateAdded existed read undefined and simply don't count yet.
    const items = [
      { dateAdded: "" },
      { dateAdded: null },
      { dateAdded: undefined },
      { dateAdded: "not a date" },
      { dateAdded: "2026-07-27" },
    ];
    expect(countAddedWithin(items, 30, now)).toBe(1);
  });

  it("returns 0 for an empty collection", () => {
    expect(countAddedWithin([], 30, now)).toBe(0);
  });

  it("excludes an item exactly outside the window and includes one on the edge", () => {
    const inside = new Date(now - 30 * 86400000 + 1000).toISOString();
    const outside = new Date(now - 30 * 86400000 - 1000).toISOString();
    expect(countAddedWithin([{ dateAdded: inside }], 30, now)).toBe(1);
    expect(countAddedWithin([{ dateAdded: outside }], 30, now)).toBe(0);
  });

  it("honours the window length", () => {
    const items = [{ dateAdded: "2026-06-01" }];
    expect(countAddedWithin(items, 30, now)).toBe(0);
    expect(countAddedWithin(items, 90, now)).toBe(1);
  });
});
