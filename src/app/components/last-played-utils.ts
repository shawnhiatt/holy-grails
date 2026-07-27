/**
 * Shared helpers for Last Played timestamps.
 */

/** Returns a human-friendly relative date string */
export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "last week";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return "last month";
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  if (diffDays < 730) return "last year";
  return `${Math.floor(diffDays / 365)} years ago`;
}

/** Returns "Last played X ago" or "No plays logged" */
export function lastPlayedLabel(isoDate: string | undefined): string {
  if (!isoDate) return "No plays logged";
  const rel = formatRelativeDate(isoDate);
  if (rel === "today") return "Played today";
  if (rel === "yesterday") return "Last played yesterday";
  return `Last played ${rel}`;
}

/** Format a date as "Jan 14, 2026" */
export function formatDateShort(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Label for the play-history disclosure row: "1 play last week", "1 play in
 * March", "3 plays this month", "10 plays since May", "10 plays since May
 * 2025". Falls back to a bare count when the first play is unknown (history
 * still loading).
 *
 * A single play gets its own ladder rather than dead-ending at "1 play". It
 * says "in March", never "since March" — "since" implies a span, and one play
 * has none. Recent plays read relatively ("last week"), older ones absolutely
 * ("in March"), which is where a bare relative string stops being useful.
 */
export function playCountLabel(
  count: number,
  firstPlayedAt?: number,
  now: number = Date.now()
): string {
  if (count <= 0) return "No plays";
  if (!firstPlayedAt) return count === 1 ? "1 play" : `${count} plays`;

  const first = new Date(firstPlayedAt);
  const today = new Date(now);
  const sameYear = first.getFullYear() === today.getFullYear();
  const sameMonth = sameYear && first.getMonth() === today.getMonth();
  const month = first.toLocaleDateString("en-US", { month: "long" });

  if (count === 1) {
    const days = Math.floor((now - firstPlayedAt) / 86400000);
    if (days <= 0) return "1 play today";
    if (days === 1) return "1 play yesterday";
    if (days < 7) return "1 play this week";
    if (days < 14) return "1 play last week";
    if (sameMonth) return "1 play this month";
    return sameYear ? `1 play in ${month}` : `1 play in ${month} ${first.getFullYear()}`;
  }

  if (sameMonth) return `${count} plays this month`;
  return sameYear
    ? `${count} plays since ${month}`
    : `${count} plays since ${month} ${first.getFullYear()}`;
}

/** Format a timestamp as "June 2026" — month grouping header for play history.
 *  Spelled out to match the disclosure row it sits under. */
export function playMonthLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Check if a date ISO string is today */
export function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}