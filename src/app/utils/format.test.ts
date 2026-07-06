import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatActivityDate, formatCollectionSince, formatSyncedAgo, getInitial } from "./format";

describe("formatActivityDate", () => {
  it("formats month and day", () => {
    expect(formatActivityDate("2026-01-15T12:00:00")).toBe("Jan 15");
  });

  it("prepends the weekday when includeDay is set", () => {
    // 2026-01-15 is a Thursday
    expect(formatActivityDate("2026-01-15T12:00:00", true)).toBe("Thursday, Jan 15");
  });
});

describe("formatCollectionSince", () => {
  it("formats short month + year", () => {
    expect(formatCollectionSince("2024-03-10T12:00:00")).toBe("Mar 2024");
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
