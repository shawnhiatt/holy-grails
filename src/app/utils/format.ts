/**
 * Shared formatting utilities used across screens.
 */

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a stored date string for *display*.
 *
 * The sync normalizes `date_added` to a bare "YYYY-MM-DD" (see
 * `convex/discogs.ts`), and `new Date("2026-08-04")` is specified to parse as
 * UTC midnight. Read back through the local getters every formatter uses, that
 * lands on the previous day for anyone west of UTC — a record added Aug 4 read
 * "Aug 3", and one added on the 1st grouped under the previous month.
 *
 * A date-only string is a calendar date, not an instant, so it is built in
 * local time and renders as the day it says. Anything carrying a time (a full
 * ISO timestamp — play logs, followed users' raw `date_added`) is a real
 * instant and still parses normally.
 *
 * Display only. Comparisons and sorts stay on the raw strings, which are
 * lexicographically ordered already.
 */
export function parseDisplayDate(iso: string): Date {
  const m = DATE_ONLY.exec(iso.trim());
  if (!m) return new Date(iso);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Two-digit-year remap (new Date(26, …) → 1926) can't bite a 4-digit match,
  // but setting it explicitly keeps that true regardless of the input.
  d.setFullYear(Number(m[1]));
  return d;
}

/**
 * Format an ISO date string for activity feeds.
 * Without `includeDay`: "Jan 15"
 * With `includeDay`:    "Monday, Jan 15"
 */
export function formatActivityDate(iso: string, includeDay = false): string {
  const d = parseDisplayDate(iso);
  const base = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  return includeDay ? `${DAY_NAMES[d.getDay()]}, ${base}` : base;
}

/**
 * Format an ISO date string as short month + year (e.g. "Jan 2024").
 */
export function formatCollectionSince(iso: string): string {
  const d = parseDisplayDate(iso);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Return the uppercase first character of a username (for avatar fallbacks).
 */
export function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}

/**
 * Compact relative time for sync status — "just now", "3m ago", "5h ago",
 * "2d ago". Falls back to a short date for anything older than a week.
 */
export function formatSyncedAgo(ts: number | null | undefined): string | null {
  if (ts == null) return null;
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const d = new Date(ts);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}