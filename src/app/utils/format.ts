/**
 * Shared formatting utilities used across screens.
 */

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Format an ISO date string for activity feeds.
 * Without `includeDay`: "Jan 15"
 * With `includeDay`:    "Monday, Jan 15"
 */
export function formatActivityDate(iso: string, includeDay = false): string {
  const d = new Date(iso);
  const base = `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  return includeDay ? `${DAY_NAMES[d.getDay()]}, ${base}` : base;
}

/**
 * Format an ISO date string as short month + year (e.g. "Jan 2024").
 */
export function formatCollectionSince(iso: string): string {
  const d = new Date(iso);
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