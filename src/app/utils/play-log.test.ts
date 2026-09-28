import { describe, expect, it } from "vitest";
import { lastPlayedAfterRemoval } from "./play-log";

describe("lastPlayedAfterRemoval", () => {
  it("falls back to the next-most-recent remaining play for that release", () => {
    const remaining = [
      { albumId: "1", playedAt: 1000 },
      { albumId: "1", playedAt: 3000 },
      { albumId: "2", playedAt: 9000 },
    ];
    expect(lastPlayedAfterRemoval(remaining, "1")).toBe(new Date(3000).toISOString());
  });

  it("returns undefined when no plays remain for the release", () => {
    const remaining = [{ albumId: "2", playedAt: 9000 }];
    expect(lastPlayedAfterRemoval(remaining, "1")).toBeUndefined();
  });

  it("returns undefined for an empty log", () => {
    expect(lastPlayedAfterRemoval([], "1")).toBeUndefined();
  });

  it("ignores other releases' plays entirely", () => {
    const remaining = [
      { albumId: "2", playedAt: 500 },
      { albumId: "3", playedAt: 999999 },
    ];
    expect(lastPlayedAfterRemoval(remaining, "1")).toBeUndefined();
  });

  it("picks the max, not the last-in-array, entry", () => {
    const remaining = [
      { albumId: "1", playedAt: 5000 },
      { albumId: "1", playedAt: 2000 },
      { albumId: "1", playedAt: 4000 },
    ];
    expect(lastPlayedAfterRemoval(remaining, "1")).toBe(new Date(5000).toISOString());
  });

  it("treats two plays of the same release at the same instant as one max", () => {
    const remaining = [
      { albumId: "1", playedAt: 7000 },
      { albumId: "1", playedAt: 7000 },
    ];
    expect(lastPlayedAfterRemoval(remaining, "1")).toBe(new Date(7000).toISOString());
  });
});
