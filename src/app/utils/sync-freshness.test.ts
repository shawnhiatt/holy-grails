import { describe, it, expect } from "vitest";
import { OWN_DATA_MAX_AGE_MS, isOlderThan, shouldFullSync } from "./sync-freshness";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);

const equalCounts = {
  now: NOW,
  prevCollectionCount: 100,
  prevWantlistCount: 20,
  collectionCount: 100,
  wantlistCount: 20,
};

describe("shouldFullSync", () => {
  it("syncs when counts are equal but the last sync was 7h ago", () => {
    expect(shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - 7 * HOUR })).toBe(true);
  });

  it("does not sync when counts are equal and the last sync was 1h ago", () => {
    expect(shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - HOUR })).toBe(false);
  });

  it("syncs when the collection count differs, even right after a sync", () => {
    expect(
      shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - HOUR, collectionCount: 101 }),
    ).toBe(true);
  });

  it("syncs when the wantlist count differs", () => {
    expect(
      shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - HOUR, wantlistCount: 19 }),
    ).toBe(true);
  });

  it("syncs when counts were never recorded", () => {
    expect(
      shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - HOUR, prevCollectionCount: null }),
    ).toBe(true);
    expect(
      shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - HOUR, prevWantlistCount: undefined }),
    ).toBe(true);
  });

  it("syncs when there is no last-sync time on record", () => {
    expect(shouldFullSync({ ...equalCounts, lastSyncedAt: null })).toBe(true);
    expect(shouldFullSync({ ...equalCounts, lastSyncedAt: undefined })).toBe(true);
  });

  it("treats exactly 6h as due and just under as fresh", () => {
    expect(shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - OWN_DATA_MAX_AGE_MS })).toBe(true);
    expect(shouldFullSync({ ...equalCounts, lastSyncedAt: NOW - OWN_DATA_MAX_AGE_MS + 1 })).toBe(false);
  });
});

describe("isOlderThan", () => {
  it("uses the 6h window by default", () => {
    expect(OWN_DATA_MAX_AGE_MS).toBe(6 * HOUR);
    expect(isOlderThan(NOW - 5 * HOUR, NOW)).toBe(false);
    expect(isOlderThan(NOW - 7 * HOUR, NOW)).toBe(true);
  });

  it("treats a missing timestamp as stale", () => {
    expect(isOlderThan(undefined, NOW)).toBe(true);
    expect(isOlderThan(null, NOW)).toBe(true);
  });
});
