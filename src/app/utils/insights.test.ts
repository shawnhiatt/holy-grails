import { describe, expect, it } from "vitest";
import {
  parseAddedYear,
  bucketAddsByYear,
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
