import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveStreaks, daysSinceLastPlay, playsByMonth, releasesPlayedInWindow, windowStartMs } from "./listening";

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
    expect(deriveStreaks([], NOW)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      currentRange: null,
      longestRange: null,
    });
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

  describe("across a daylight-saving change", () => {
    /* A DST day is 23 or 25 hours long. Walking the streak backward by a fixed
       86,400,000 ms skipped a calendar day each spring and repeated one each
       autumn, silently truncating a live streak twice a year. Pinned to a zone
       that observes DST — in UTC there is nothing to catch. */
    const REAL_TZ = process.env.TZ;
    beforeAll(() => { process.env.TZ = "America/New_York"; });
    afterAll(() => { process.env.TZ = REAL_TZ; });

    // US DST starts 8 Mar 2026 (02:00 → 03:00) and ends 1 Nov 2026 (02:00 → 01:00).
    const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();

    it("counts through the spring-forward day just after midnight", () => {
      // Just past midnight is where a 24h step lands on the wrong side of the
      // 23-hour day and skips 8 Mar entirely.
      const justAfterMidnight = new Date(2026, 2, 9, 0, 30).getTime();
      const plays = [localNoon(2026, 3, 6), localNoon(2026, 3, 7), localNoon(2026, 3, 8)];
      expect(deriveStreaks(plays, justAfterMidnight).currentStreak).toBe(3);
    });

    it("counts through the fall-back day just after midnight", () => {
      const justAfterMidnight = new Date(2026, 10, 2, 0, 30).getTime();
      const plays = [localNoon(2026, 10, 30), localNoon(2026, 10, 31), localNoon(2026, 11, 1)];
      expect(deriveStreaks(plays, justAfterMidnight).currentStreak).toBe(3);
    });

    it("still breaks a streak that genuinely skips the DST day", () => {
      const justAfterMidnight = new Date(2026, 2, 9, 0, 30).getTime();
      // 8 Mar missing — the streak is the one day before it, and stops there.
      const plays = [localNoon(2026, 3, 6), localNoon(2026, 3, 7)];
      expect(deriveStreaks(plays, justAfterMidnight).currentStreak).toBe(0);
    });
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

describe("releasesPlayedInWindow", () => {
  const play = (albumId: string, ms: number) => ({ albumId, playedAt: ms });

  it("counts distinct releases, not play events", () => {
    const log = [play("a", daysAgo(1)), play("a", daysAgo(2)), play("b", daysAgo(3))];
    const start = windowStartMs(30, NOW);
    expect(releasesPlayedInWindow([{ id: "a" }, { id: "b" }], log, start, NOW + 1)).toBe(2);
  });

  /* The whole reason this takes a play LOG rather than lastPlayed. A release
     played in both windows carries a last-play in the newer one, so a
     lastPlayed-based count would omit it from the older window entirely,
     undercounting that side and inflating every delta drawn from it. */
  it("counts a release in an earlier window even when it was played again since", () => {
    const log = [play("a", daysAgo(45)), play("a", daysAgo(10))];
    const albums = [{ id: "a" }];
    const recentStart = windowStartMs(30, NOW);
    const priorStart = windowStartMs(60, NOW);
    expect(releasesPlayedInWindow(albums, log, recentStart, NOW + 1)).toBe(1);
    expect(releasesPlayedInWindow(albums, log, priorStart, recentStart)).toBe(1);
  });

  it("excludes plays outside the window on either side", () => {
    const log = [play("a", daysAgo(45)), play("b", daysAgo(5))];
    const start = windowStartMs(30, NOW);
    expect(releasesPlayedInWindow([{ id: "a" }, { id: "b" }], log, start, NOW + 1)).toBe(1);
  });

  it("ignores plays for releases no longer in the collection", () => {
    expect(releasesPlayedInWindow([], [play("gone", daysAgo(1))], windowStartMs(30, NOW), NOW + 1)).toBe(0);
  });

  it("returns zero for an empty log", () => {
    expect(releasesPlayedInWindow([{ id: "a" }], [], windowStartMs(30, NOW), NOW + 1)).toBe(0);
  });
});

describe("windowStartMs", () => {
  /* Counted in calendar days from the start of today, so the window does not
     drift by the time of day it happens to be read. */
  it("starts a 30-day window 29 calendar days before today's start", () => {
    const now = new Date(2026, 8, 2, 18, 30).getTime();
    const start = new Date(windowStartMs(30, now));
    expect([start.getFullYear(), start.getMonth() + 1, start.getDate()]).toEqual([2026, 8, 4]);
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
  });

  it("steps back across a month boundary by the calendar, not by 24h maths", () => {
    const now = new Date(2026, 2, 15, 9, 0).getTime(); // 15 Mar, spanning DST
    const start = new Date(windowStartMs(30, now));
    expect([start.getMonth() + 1, start.getDate()]).toEqual([2, 14]);
    expect(start.getHours()).toBe(0);
  });
});

describe("playsByMonth", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
  const NOW_SEP = at(2026, 9, 2);

  it("counts play EVENTS per month, oldest first, ending on the current month", () => {
    const plays = [at(2026, 9, 1), at(2026, 9, 2), at(2026, 8, 4)];
    const out = playsByMonth(plays, 3, NOW_SEP);
    expect(out.map((m) => m.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(out.map((m) => m.plays)).toEqual([0, 1, 2]);
  });

  /* A gap in the log IS the finding. Dropping empty months would slide the
     bars together and draw a run of listening that never happened. */
  it("emits empty months as zero rather than skipping them", () => {
    const out = playsByMonth([at(2026, 9, 1)], 4, NOW_SEP);
    expect(out).toHaveLength(4);
    expect(out.map((m) => m.plays)).toEqual([0, 0, 0, 1]);
  });

  it("labels January with its year so a window spanning one is anchored", () => {
    const out = playsByMonth([], 3, at(2026, 2, 10));
    expect(out.map((m) => m.label)).toEqual(["Dec", "Jan 2026", "Feb"]);
  });

  /* Stepping months back from the 31st lands short in a 30-day month, which
     would silently drop a month from the window — hence the setDate(1) first. */
  it("builds a full window when read on the 31st", () => {
    const out = playsByMonth([], 12, at(2026, 3, 31));
    expect(out).toHaveLength(12);
    expect(out[0].key).toBe("2025-04");
    expect(out[11].key).toBe("2026-03");
  });

  it("returns a window of zeroes for an empty log", () => {
    const out = playsByMonth([], 12, NOW_SEP);
    expect(out).toHaveLength(12);
    expect(out.every((m) => m.plays === 0)).toBe(true);
  });
});

describe("deriveStreaks — when the streaks ran", () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
  const NOW = at(2026, 9, 2);

  it("spans a live streak from its first day to its last", () => {
    const plays = [at(2026, 8, 31), at(2026, 9, 1), at(2026, 9, 2)];
    const { currentStreak, currentRange } = deriveStreaks(plays, NOW);
    expect(currentStreak).toBe(3);
    expect(currentRange).toEqual({ start: "2026-08-31", end: "2026-09-02" });
  });

  /* The streak may end yesterday — you have not necessarily played anything
     yet today — so the range's end has to be the last day WITH a play, not
     today. */
  it("ends a streak on its last played day, not on today", () => {
    const plays = [at(2026, 8, 30), at(2026, 8, 31), at(2026, 9, 1)];
    const { currentStreak, currentRange } = deriveStreaks(plays, NOW);
    expect(currentStreak).toBe(3);
    expect(currentRange).toEqual({ start: "2026-08-30", end: "2026-09-01" });
  });

  it("reports no current range once the streak is broken", () => {
    const plays = [at(2026, 8, 20), at(2026, 8, 21)];
    const { currentStreak, currentRange, longestStreak, longestRange } = deriveStreaks(plays, NOW);
    expect(currentStreak).toBe(0);
    expect(currentRange).toBeNull();
    // The longest is still reported — it just isn't running.
    expect(longestStreak).toBe(2);
    expect(longestRange).toEqual({ start: "2026-08-20", end: "2026-08-21" });
  });

  it("spans the longest run wherever it sits in the log", () => {
    const plays = [
      at(2026, 3, 4), at(2026, 3, 5), at(2026, 3, 6), at(2026, 3, 7), // 4 days
      at(2026, 8, 1),                                                 // 1 day
      at(2026, 9, 1), at(2026, 9, 2),                                 // 2 days, live
    ];
    const { longestStreak, longestRange, currentStreak } = deriveStreaks(plays, NOW);
    expect(longestStreak).toBe(4);
    expect(longestRange).toEqual({ start: "2026-03-04", end: "2026-03-07" });
    expect(currentStreak).toBe(2);
  });

  /* On a tie the most recent run wins: the same length from four years ago is
     worth less than the one from last month. */
  it("prefers the most recent run when two are equally long", () => {
    const plays = [
      at(2022, 1, 1), at(2022, 1, 2), at(2022, 1, 3),
      at(2026, 5, 10), at(2026, 5, 11), at(2026, 5, 12),
    ];
    const { longestStreak, longestRange } = deriveStreaks(plays, NOW);
    expect(longestStreak).toBe(3);
    expect(longestRange).toEqual({ start: "2026-05-10", end: "2026-05-12" });
  });

  it("gives a one-day streak a range of that single day", () => {
    const { currentStreak, currentRange } = deriveStreaks([at(2026, 9, 2)], NOW);
    expect(currentStreak).toBe(1);
    expect(currentRange).toEqual({ start: "2026-09-02", end: "2026-09-02" });
  });

  it("has no ranges at all with nothing logged", () => {
    expect(deriveStreaks([], NOW)).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      currentRange: null,
      longestRange: null,
    });
  });

  it("carries a run across a month boundary", () => {
    const plays = [at(2026, 7, 30), at(2026, 7, 31), at(2026, 8, 1), at(2026, 8, 2)];
    const { longestStreak, longestRange } = deriveStreaks(plays, NOW);
    expect(longestStreak).toBe(4);
    expect(longestRange).toEqual({ start: "2026-07-30", end: "2026-08-02" });
  });
});
