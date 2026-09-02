/* Pure listening derivations, shared by the feed's Listening card and the
   Insights screen's Listening section. Split out of reports-screen.tsx so the
   two surfaces cannot disagree: two independently written streak counts that
   report different numbers for the same data is the failure mode worth a file
   to avoid. No React, no recharts — unit-testable in the node environment.

   Everything here reads the play log the app already keeps (`last_played`,
   one row per play). Nothing new is tracked. */

const DAY_MS = 86400000;

/** Local calendar day key for a timestamp — the unit a streak is counted in. */
function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Step a local calendar date back one day.
 *
 * Deliberately not `ts -= 86400000`: a DST day is 23 or 25 hours long, so
 * subtracting a fixed 24h near midnight skips a calendar day (spring forward)
 * or repeats one (fall back) — which silently truncated a live streak twice a
 * year. `setDate(getDate() - 1)` is defined in calendar terms and handles the
 * short/long day, month ends, and leap years alike.
 */
function prevDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setFullYear(y);
  date.setDate(date.getDate() - 1);
  return dayKey(date.getTime());
}

/** Inclusive span of a streak, as local day keys ("YYYY-MM-DD"). */
export interface StreakRange {
  start: string;
  end: string;
}

export interface Streaks {
  currentStreak: number;
  longestStreak: number;
  /** When the streaks ran. Null when the streak is 0. */
  currentRange: StreakRange | null;
  longestRange: StreakRange | null;
}

/**
 * Consecutive calendar days with at least one play.
 *
 * The current streak may start from today *or* yesterday — you haven't
 * necessarily played anything yet today, and zeroing a live streak at midnight
 * would be a lie about the data.
 */
export function deriveStreaks(allPlayTimestamps: number[], now: number = Date.now()): Streaks {
  const empty: Streaks = { currentStreak: 0, longestStreak: 0, currentRange: null, longestRange: null };
  if (allPlayTimestamps.length === 0) return empty;

  const daySet = new Set<string>();
  for (const ts of allPlayTimestamps) daySet.add(dayKey(ts));

  // Current — walk backward from today, or from yesterday if today is empty
  let current = 0;
  let cursor = dayKey(now);
  if (!daySet.has(cursor)) cursor = prevDayKey(cursor);
  // The first day the walk lands on is the streak's END; each further step
  // back moves its START, so the span falls out of the same loop.
  const currentEnd = daySet.has(cursor) ? cursor : null;
  let currentStart = cursor;
  while (daySet.has(cursor)) {
    current++;
    currentStart = cursor;
    cursor = prevDayKey(cursor);
  }

  // Longest — scan the sorted day list for the longest consecutive run
  const sortedDays = Array.from(daySet).sort();
  let longest = 0;
  let longestRange: StreakRange | null = null;
  let run = 1;
  let runStart = sortedDays[0];
  const closeRun = (endIndex: number) => {
    // >=, not >: on a tie the MOST RECENT run wins. Days are ascending, so the
    // later run overwrites — "26 days, ending last March" is worth more than
    // the same 26 days from four years ago.
    if (run >= longest) {
      longest = run;
      longestRange = { start: runStart, end: sortedDays[endIndex] };
    }
  };
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = Date.parse(sortedDays[i - 1]);
    const curr = Date.parse(sortedDays[i]);
    // Date.parse on a bare "YYYY-MM-DD" is UTC for both sides, so the fixed
    // DAY_MS holds here — the comparison never crosses a local DST boundary.
    if (curr - prev === DAY_MS) {
      run++;
    } else {
      closeRun(i - 1);
      run = 1;
      runStart = sortedDays[i];
    }
  }
  closeRun(sortedDays.length - 1);

  return {
    currentStreak: current,
    longestStreak: longest,
    currentRange: currentEnd ? { start: currentStart, end: currentEnd } : null,
    longestRange,
  };
}

/**
 * Whole days since the most recent play, or null when nothing has been logged.
 * Counted in calendar days, so a play last night reads "1", not "0.4".
 */
export function daysSinceLastPlay(
  allPlayTimestamps: number[],
  now: number = Date.now()
): number | null {
  if (allPlayTimestamps.length === 0) return null;
  const latest = Math.max(...allPlayTimestamps);
  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const last = new Date(latest);
  const lastStart = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
  return Math.max(0, Math.round((todayStart - lastStart) / DAY_MS));
}

/**
 * Releases *in the collection* whose most recent play falls in the current
 * calendar month.
 *
 * Counts releases, not play events, and scopes to the passed collection so a
 * release played and later removed stops counting. Both surfaces call this so
 * "Played this month" cannot mean two different things in two places.
 */
export function albumsPlayedThisMonth(
  albums: Array<{ id: string }>,
  lastPlayed: Record<string, string>,
  now: number = Date.now()
): number {
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  let count = 0;
  for (const a of albums) {
    const lp = lastPlayed[a.id];
    if (!lp) continue;
    const ms = Date.parse(lp);
    if (!Number.isNaN(ms) && ms >= monthStart) count++;
  }
  return count;
}
