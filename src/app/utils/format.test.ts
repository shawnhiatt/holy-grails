import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dateAddedBucket,
  formatDayRange,
  formatActivityDate,
  formatCollectionSince,
  formatSyncedAgo,
  getInitial,
  parseDisplayDate,
} from "./format";

describe("parseDisplayDate", () => {
  /* The sync stores `date_added` as a bare "YYYY-MM-DD". `new Date()` reads
     that as UTC midnight, so every local getter downstream reported the
     previous day west of UTC. These assertions are on the local calendar
     fields, so they hold in any runner timezone. */
  it("reads a date-only string as that local calendar date", () => {
    const d = parseDisplayDate("2026-08-04");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 4]);
  });

  it("keeps the first of the month on the first of the month", () => {
    const d = parseDisplayDate("2026-08-01");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 1]);
  });

  it("leaves a real instant alone", () => {
    // A full ISO timestamp names a moment, not a calendar date — it must still
    // convert to local time normally.
    expect(parseDisplayDate("2026-08-04T12:30:00Z").getTime()).toBe(
      new Date("2026-08-04T12:30:00Z").getTime()
    );
  });
});

describe("date-only rendering west of UTC", () => {
  /* Pinned to a negative-offset zone: in UTC the bug is invisible, so an
     unpinned test would pass on a broken implementation. */
  const REAL_TZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = "America/New_York"; });
  afterAll(() => { process.env.TZ = REAL_TZ; });

  it("does not shift a date-only string back a day", () => {
    expect(formatActivityDate("2026-08-04")).toBe("Aug 4");
    expect(formatCollectionSince("2026-08-01")).toBe("Aug 2026");
  });
});

describe("formatActivityDate", () => {
  it("formats month and day", () => {
    expect(formatActivityDate("2026-01-15T12:00:00")).toBe("Jan 15");
  });

  it("prepends the weekday when includeDay is set", () => {
    // 2026-01-15 is a Thursday
    expect(formatActivityDate("2026-01-15T12:00:00", true)).toBe("Thursday, Jan 15");
  });

  it("formats a date-only string as the day it names", () => {
    expect(formatActivityDate("2026-01-15")).toBe("Jan 15");
    expect(formatActivityDate("2026-01-15", true)).toBe("Thursday, Jan 15");
  });
});

describe("formatCollectionSince", () => {
  it("formats short month + year", () => {
    expect(formatCollectionSince("2024-03-10T12:00:00")).toBe("Mar 2024");
  });

  it("formats a date-only string without slipping to the prior month", () => {
    expect(formatCollectionSince("2024-03-01")).toBe("Mar 2024");
  });
});

describe("getInitial", () => {
  it("uppercases the first character", () => {
    expect(getInitial("shawn")).toBe("S");
  });
});

describe("formatSyncedAgo", () => {
  const NOW = new Date("2026-07-06T12:00:00").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for missing timestamps", () => {
    expect(formatSyncedAgo(null)).toBeNull();
    expect(formatSyncedAgo(undefined)).toBeNull();
  });

  it("clamps future timestamps to 'just now'", () => {
    expect(formatSyncedAgo(NOW + 5000)).toBe("just now");
  });

  it("walks the ladder: just now → minutes → hours → days", () => {
    expect(formatSyncedAgo(NOW - 30 * 1000)).toBe("just now");
    expect(formatSyncedAgo(NOW - 3 * 60 * 1000)).toBe("3m ago");
    expect(formatSyncedAgo(NOW - 59 * 60 * 1000)).toBe("59m ago");
    expect(formatSyncedAgo(NOW - 60 * 60 * 1000)).toBe("1h ago");
    expect(formatSyncedAgo(NOW - 23 * 60 * 60 * 1000)).toBe("23h ago");
    expect(formatSyncedAgo(NOW - 24 * 60 * 60 * 1000)).toBe("1d ago");
    expect(formatSyncedAgo(NOW - 6 * 24 * 60 * 60 * 1000)).toBe("6d ago");
  });

  it("falls back to a short date at a week and beyond", () => {
    expect(formatSyncedAgo(NOW - 7 * 24 * 60 * 60 * 1000)).toBe("Jun 29");
  });
});


describe("dateAddedBucket", () => {
  // Mid-year, so all four rungs of the ladder are reachable at once.
  const SEP_2026 = new Date(2026, 8, 2);

  it("names the current and previous calendar months", () => {
    expect(dateAddedBucket("2026-09-30", SEP_2026)).toBe("This Month");
    expect(dateAddedBucket("2026-09-01", SEP_2026)).toBe("This Month");
    expect(dateAddedBucket("2026-08-31", SEP_2026)).toBe("Last Month");
    expect(dateAddedBucket("2026-08-01", SEP_2026)).toBe("Last Month");
  });

  it("collects the rest of the current year under one header", () => {
    expect(dateAddedBucket("2026-07-31", SEP_2026)).toBe("Earlier This Year");
    expect(dateAddedBucket("2026-01-01", SEP_2026)).toBe("Earlier This Year");
  });

  it("falls back to the calendar year for anything older", () => {
    expect(dateAddedBucket("2025-12-31", SEP_2026)).toBe("2025");
    expect(dateAddedBucket("2025-01-01", SEP_2026)).toBe("2025");
    expect(dateAddedBucket("2019-06-04", SEP_2026)).toBe("2019");
  });

  /* The reason months are tracked as a single running number rather than a
     month-minus-one comparison: in January the previous month is in the
     previous YEAR, and a naive check either mislabels it or throws it into
     the year bucket, putting December below November. */
  it("crosses the turn of the year without special-casing", () => {
    const JAN_2026 = new Date(2026, 0, 15);
    expect(dateAddedBucket("2026-01-02", JAN_2026)).toBe("This Month");
    expect(dateAddedBucket("2025-12-20", JAN_2026)).toBe("Last Month");
    // December is now absent from its own year's bucket — deliberate, and it
    // still reads in order: This Month, Last Month, then the rest of 2025.
    expect(dateAddedBucket("2025-11-30", JAN_2026)).toBe("2025");
  });

  it("self-collapses in February, where 'earlier this year' is empty", () => {
    const FEB_2026 = new Date(2026, 1, 10);
    expect(dateAddedBucket("2026-02-01", FEB_2026)).toBe("This Month");
    expect(dateAddedBucket("2026-01-31", FEB_2026)).toBe("Last Month");
    expect(dateAddedBucket("2025-12-31", FEB_2026)).toBe("2025");
  });

  /* Same reason parseDisplayDate exists: "YYYY-MM-DD" through new Date() is
     UTC midnight, which lands on the previous day — and for the 1st, the
     previous MONTH — for every user west of UTC. */
  it("reads the 1st of the month as that month, not the one before", () => {
    expect(dateAddedBucket("2026-09-01", SEP_2026)).toBe("This Month");
    expect(dateAddedBucket("2026-01-01", SEP_2026)).toBe("Earlier This Year");
  });

  it("gives a release with no stored date its own header", () => {
    // The sync writes "" when Discogs omits date_added.
    expect(dateAddedBucket("", SEP_2026)).toBe("—");
    expect(dateAddedBucket("not a date", SEP_2026)).toBe("—");
  });

  it("defaults to the current clock when no instant is passed", () => {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    expect(dateAddedBucket(iso)).toBe("This Month");
  });
});


describe("formatDayRange", () => {
  const NOW = new Date(2026, 8, 2);

  it("renders an inclusive span", () => {
    expect(formatDayRange("2026-08-26", "2026-09-02", NOW)).toBe("Aug 26 – Sep 2");
  });

  it("renders a one-day span as the single day", () => {
    expect(formatDayRange("2026-09-02", "2026-09-02", NOW)).toBe("Sep 2");
  });

  /* A streak from last week does not need telling you it happened this year;
     an all-time longest from four years ago does. */
  it("appends the year only when the span ended in another one", () => {
    expect(formatDayRange("2026-03-04", "2026-03-07", NOW)).toBe("Mar 4 – Mar 7");
    expect(formatDayRange("2022-01-01", "2022-01-03", NOW)).toBe("Jan 1 – Jan 3, 2022");
    // A span that crosses into the current year is named by its END year.
    expect(formatDayRange("2025-12-30", "2026-01-02", NOW)).toBe("Dec 30 – Jan 2");
  });

  it("returns an empty string rather than 'Invalid Date' for junk", () => {
    expect(formatDayRange("", "", NOW)).toBe("");
    expect(formatDayRange("nope", "2026-09-02", NOW)).toBe("");
  });
});
