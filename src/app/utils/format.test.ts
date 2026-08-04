import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
