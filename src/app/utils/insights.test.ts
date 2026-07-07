import { describe, expect, it } from "vitest";
import {
  parsePricePaid,
  parseAddedYear,
  bucketAddsByYear,
  deriveSpending,
} from "./insights";
import { makeAlbum } from "../../test/factories";

describe("parsePricePaid", () => {
  it("parses US-formatted prices", () => {
    expect(parsePricePaid("$25.00")).toBe(25);
    expect(parsePricePaid("25")).toBe(25);
    expect(parsePricePaid("  $12.50 ")).toBe(12.5);
    expect(parsePricePaid("$1,234.56")).toBe(1234.56);
    expect(parsePricePaid("USD 40")).toBe(40);
  });

  it("skips empty, junk, and ambiguous formats", () => {
    expect(parsePricePaid("")).toBeNull();
    expect(parsePricePaid("   ")).toBeNull();
    expect(parsePricePaid(null)).toBeNull();
    expect(parsePricePaid(undefined)).toBeNull();
    expect(parsePricePaid("free")).toBeNull();
    expect(parsePricePaid("€1.200,50")).toBeNull(); // euro decimal-comma
  });

  it("skips zero and negative", () => {
    expect(parsePricePaid("0")).toBeNull();
    expect(parsePricePaid("0.00")).toBeNull();
    expect(parsePricePaid("-5.00")).toBeNull();
  });
});

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

describe("deriveSpending", () => {
  it("aggregates total, average, count, and priciest over parseable prices", () => {
    const albums = [
      makeAlbum({ title: "Cheap", pricePaid: "10.00" }),
      makeAlbum({ title: "Grail", pricePaid: "$90.00" }),
      makeAlbum({ title: "No price", pricePaid: "" }),
    ];
    const s = deriveSpending(albums);
    expect(s.count).toBe(2);
    expect(s.total).toBe(100);
    expect(s.average).toBe(50);
    expect(s.priciest).toEqual({ title: "Grail", price: 90 });
  });

  it("returns zeroes and null priciest when nothing has a price", () => {
    const albums = [makeAlbum({ pricePaid: "" }), makeAlbum({ pricePaid: "junk" })];
    expect(deriveSpending(albums)).toEqual({
      total: 0,
      average: 0,
      count: 0,
      priciest: null,
    });
  });
});
