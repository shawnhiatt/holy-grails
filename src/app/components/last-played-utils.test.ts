import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { formatDateShort, playCountLabel, playMonthLabel } from "./last-played-utils";

const NOW = new Date("2026-06-20T12:00:00").getTime();
const at = (iso: string) => new Date(iso).getTime();

describe("playCountLabel", () => {
  it("falls back to a bare count when the first play is unknown", () => {
    expect(playCountLabel(10, undefined, NOW)).toBe("10 plays");
    expect(playCountLabel(1, undefined, NOW)).toBe("1 play");
  });

  it("says 'this month' when the first play is in the current month", () => {
    expect(playCountLabel(3, at("2026-06-02T09:00:00"), NOW)).toBe("3 plays this month");
  });

  it("omits the year when the first play is earlier in the current year", () => {
    expect(playCountLabel(10, at("2026-05-09T15:15:00"), NOW)).toBe("10 plays since May");
  });

  it("includes the year when the first play is in a prior year", () => {
    expect(playCountLabel(42, at("2024-11-03T20:00:00"), NOW)).toBe("42 plays since November 2024");
  });

  it("spells the month out rather than abbreviating it", () => {
    expect(playCountLabel(10, at("2026-04-09T15:15:00"), NOW)).toBe("10 plays since April");
  });

  it("handles the empty case", () => {
    expect(playCountLabel(0, undefined, NOW)).toBe("No plays");
  });
});

describe("playCountLabel — a single play gets the same treatment as many", () => {
  it("reads relatively for a recent play", () => {
    expect(playCountLabel(1, at("2026-06-20T08:00:00"), NOW)).toBe("1 play today");
    expect(playCountLabel(1, at("2026-06-19T08:00:00"), NOW)).toBe("1 play yesterday");
    expect(playCountLabel(1, at("2026-06-16T12:00:00"), NOW)).toBe("1 play this week");
    expect(playCountLabel(1, at("2026-06-09T12:00:00"), NOW)).toBe("1 play last week");
  });

  it("falls back to 'this month' past the two-week window", () => {
    expect(playCountLabel(1, at("2026-06-02T09:00:00"), NOW)).toBe("1 play this month");
  });

  it("says 'in March', never 'since March' — one play has no span", () => {
    expect(playCountLabel(1, at("2026-03-14T20:00:00"), NOW)).toBe("1 play in March");
  });

  it("includes the year for a play in a prior year", () => {
    expect(playCountLabel(1, at("2024-11-03T20:00:00"), NOW)).toBe("1 play in November 2024");
  });

  it("prefers the relative tier when it crosses a month boundary", () => {
    // 5 days back but in May — recency is more useful than the calendar here
    expect(playCountLabel(1, at("2026-05-30T12:00:00"), new Date("2026-06-04T12:00:00").getTime()))
      .toBe("1 play this week");
  });
});

describe("playMonthLabel", () => {
  it("formats a timestamp as month + year, spelled out", () => {
    expect(playMonthLabel(at("2026-06-20T08:44:00"))).toBe("June 2026");
  });
});

describe("formatDateShort", () => {
  /* Called with both shapes: a play log's full ISO timestamp and a collection
     row's bare "YYYY-MM-DD". Pinned west of UTC, where a UTC-parsed date-only
     string renders as the previous day. */
  const REAL_TZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = "America/New_York"; });
  afterAll(() => { process.env.TZ = REAL_TZ; });

  it("renders a date-only dateAdded as the day it names", () => {
    expect(formatDateShort("2026-08-04")).toBe("Aug 4, 2026");
    expect(formatDateShort("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("still converts a real timestamp to local time", () => {
    // 03:00 UTC is the previous evening in New York — that shift is correct,
    // because a timestamp names a moment.
    expect(formatDateShort("2026-08-04T03:00:00Z")).toBe("Aug 3, 2026");
  });
});
