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
 * Return the uppercase first character of a username (for avatar fallbacks).
 */
export function getInitial(username: string): string {
  return username.charAt(0).toUpperCase();
}
