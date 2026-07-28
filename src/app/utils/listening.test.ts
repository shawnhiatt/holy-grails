import { describe, expect, it } from "vitest";
import { deriveStreaks, daysSinceLastPlay, albumsPlayedThisMonth } from "./listening";

/* These derivations feed two surfaces — the feed's Listening card and the
   Insights screen's Listening section. The point of the shared module is that
   they can't disagree, so the tests pin the definitions rather than the
   rendering. */

// Local midnight of a given offset from a fixed "now", so the tests read in
// the same calendar-day units the functions count in.
const NOW = new Date(2026, 6, 28, 20, 0, 0).getTime(); // 28 Jul 2026, 20:00 local
const DAY = 86400000;
const daysAgo = (n: number) => NOW - n * DAY;

describe("deriveStreaks", () => {
  it("returns zeroes when nothing has been played", () => {
    expect(deriveStreaks([], NOW)).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it("counts consecutive days ending today", () => {
    const { currentStreak } = deriveStreaks([daysAgo(0), daysAgo(1), daysAgo(2)], NOW);
    expect(currentStreak).toBe(3);
  });

  it("keeps a live streak that ends yesterday", () => {
    // You haven't necessarily played anything yet today — zeroing the streak
    // at midnight would misreport the data.
    const { currentStreak } = deriveStreaks([daysAgo(1), daysAgo(2)], NOW);
    expect(currentStreak).toBe(2);
  });

  it("breaks the current streak once a day is skipped", () => {
    const { currentStreak } = deriveStreaks([daysAgo(2), daysAgo(3)], NOW);
    expect(currentStreak).toBe(0);
  });

  it("counts several plays on one day as a single streak day", () => {
    const { currentStreak } = deriveStreaks([daysAgo(0), daysAgo(0), daysAgo(0)], NOW);
    expect(currentStreak).toBe(1);
  });

  it("finds the longest historical run independent of the current one", () => {
    const { currentStreak, longestStreak } = deriveStreaks(
      [daysAgo(0), daysAgo(10), daysAgo(11), daysAgo(12), daysAgo(13)],
      NOW
    );
    expect(currentStreak).toBe(1);
    expect(longestStreak).toBe(4);
  });
});

describe("daysSinceLastPlay", () => {
  it("returns null when nothing has been played", () => {
    expect(daysSinceLastPlay([], NOW)).toBeNull();
  });

  it("counts whole calendar days, not elapsed hours", () => {
    // A play last night is "1 day", never "0.4"
    expect(daysSinceLastPlay([daysAgo(1)], NOW)).toBe(1);
    expect(daysSinceLastPlay([daysAgo(0)], NOW)).toBe(0);
  });

  it("reads from the most recent play", () => {
    expect(daysSinceLastPlay([daysAgo(30), daysAgo(4), daysAgo(12)], NOW)).toBe(4);
  });
});

describe("albumsPlayedThisMonth", () => {
  const iso = (ms: number) => new Date(ms).toISOString();

  it("counts releases whose last play falls in the current calendar month", () => {
    const albums = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const lastPlayed = {
      a: iso(daysAgo(1)),
      b: iso(daysAgo(2)),
      c: iso(new Date(2026, 5, 15).getTime()), // June — previous month
    };
    expect(albumsPlayedThisMonth(albums, lastPlayed, NOW)).toBe(2);
  });

  it("counts releases, not play events", () => {
    // lastPlayed holds one entry per release by construction; this pins the
    // definition so the feed and Insights can't diverge into "plays".
    const albums = [{ id: "a" }];
    expect(albumsPlayedThisMonth(albums, { a: iso(daysAgo(1)) }, NOW)).toBe(1);
  });

  it("ignores plays for releases no longer in the collection", () => {
    const lastPlayed = { gone: iso(daysAgo(1)) };
    expect(albumsPlayedThisMonth([], lastPlayed, NOW)).toBe(0);
  });

  it("skips unparseable timestamps", () => {
    expect(albumsPlayedThisMonth([{ id: "a" }], { a: "nonsense" }, NOW)).toBe(0);
  });
});
