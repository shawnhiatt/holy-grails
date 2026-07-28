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

export interface Streaks {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Consecutive calendar days with at least one play.
 *
 * The current streak may start from today *or* yesterday — you haven't
 * necessarily played anything yet today, and zeroing a live streak at midnight
 * would be a lie about the data.
 */
export function deriveStreaks(allPlayTimestamps: number[], now: number = Date.now()): Streaks {
  if (allPlayTimestamps.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const daySet = new Set<string>();
  for (const ts of allPlayTimestamps) daySet.add(dayKey(ts));

  // Current — walk backward from today, or from yesterday if today is empty
  let current = 0;
  let cursor = now;
  if (!daySet.has(dayKey(cursor))) cursor -= DAY_MS;
  while (daySet.has(dayKey(cursor))) {
    current++;
    cursor -= DAY_MS;
  }

  // Longest — scan the sorted day list for the longest consecutive run
  const sortedDays = Array.from(daySet).sort();
  let longest = 0;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = Date.parse(sortedDays[i - 1]);
    const curr = Date.parse(sortedDays[i]);
    if (curr - prev === DAY_MS) run++;
    else {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  return { currentStreak: current, longestStreak: longest };
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
