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

export interface MonthBucket {
  /** "YYYY-MM" — sortable, and the key the chart labels from. */
  key: string;
  /** Short month label, with the year appended each January so a 12-month
   *  window reading Nov, Dec, Jan is anchored without labelling all twelve. */
  label: string;
  plays: number;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Play EVENTS per calendar month over a trailing window, oldest first.
 *
 * Counts plays, not releases: the play log stores one row per play, and it is
 * the only shape of the listening data nobody could see — "50 played in
 * August" says nothing about whether 50 is a lot for you.
 *
 * Empty months are emitted as zero rather than skipped. A gap in the log IS
 * the finding, and dropping the month would slide the bars together and draw
 * a flat run of listening that never happened.
 *
 * Deliberately not derived from `lastPlayed`: that holds one date per release,
 * so a release played in three different months would only ever land in the
 * most recent one.
 */
export function playsByMonth(
  allPlayTimestamps: number[],
  months = 12,
  now: number = Date.now()
): MonthBucket[] {
  const counts = new Map<string, number>();
  for (const ts of allPlayTimestamps) {
    const d = new Date(ts);
    counts.set(monthKey(d), (counts.get(monthKey(d)) ?? 0) + 1);
  }

  const out: MonthBucket[] = [];
  const cursor = new Date(now);
  cursor.setDate(1); // before stepping months back, or the 31st lands short
  cursor.setMonth(cursor.getMonth() - (months - 1));
  for (let i = 0; i < months; i++) {
    const key = monthKey(cursor);
    const month = cursor.getMonth();
    out.push({
      key,
      label: month === 0 ? `${MONTH_ABBR[month]} ${cursor.getFullYear()}` : MONTH_ABBR[month],
      plays: counts.get(key) ?? 0,
    });
    cursor.setMonth(month + 1);
  }
  return out;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
 * Distinct releases *in the collection* played in a trailing window.
 *
 * Replaces the calendar-month count, which cratered on the 1st: the day after
 * "50 played in August" the tile read "1 played in September", a drop with no
 * behaviour behind it. A trailing window is steady across the boundary and is
 * still the same question — how much of the collection did I actually touch.
 *
 * Counts releases, not play events (the plays-per-month chart counts events),
 * and scopes to the passed collection so a release played and later removed
 * stops counting. The feed's Listening card and Insights both call this, so
 * the number cannot mean two things in two places — which is the reason this
 * file exists, and why moving one surface to a rolling window meant moving
 * both. It replaced `albumsPlayedThisMonth`, now deleted.
 *
 * `playLog` — not `lastPlayed`. For the CURRENT window the two agree, since a
 * release played inside a window ending now necessarily has its last play
 * inside it. For any EARLIER window they do not: a release played 45 days ago
 * and again 10 days ago carries a last-play of 10 days, so `lastPlayed` would
 * omit it from the 31–60 day window entirely. That systematically undercounts
 * the older side of a comparison and inflates every delta drawn from it.
 */
export function releasesPlayedInWindow(
  albums: Array<{ id: string }>,
  playLog: Array<{ albumId: string; playedAt: number }>,
  windowStart: number,
  windowEnd: number
): number {
  const inCollection = new Set(albums.map((a) => a.id));
  const seen = new Set<string>();
  for (const play of playLog) {
    if (play.playedAt < windowStart || play.playedAt >= windowEnd) continue;
    if (inCollection.has(play.albumId)) seen.add(play.albumId);
  }
  return seen.size;
}

/** Start of the trailing `days`-day window ending at `now`, in calendar days. */
export function windowStartMs(days: number, now: number = Date.now()): number {
  const d = new Date(now);
  const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  todayStart.setDate(todayStart.getDate() - (days - 1));
  return todayStart.getTime();
}
