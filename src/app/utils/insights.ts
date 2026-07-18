import type { Album } from "../components/discogs-api";

/* Pure derivations for the Insights screen's phase-1 sections (Spec 4).
   Kept out of reports-screen.tsx so they're unit-testable in the node
   environment without pulling in recharts/React. All derive from data
   already on collection rows — no new API calls.

   (A `pricePaid`-based spend aggregation lived here originally; it was removed
   with the Spending section — `pricePaid` is never populated by sync, so it
   was inert. See docs/market-value-drip.md.) */

/** Extract the four-digit year an album was added, or null if unparseable. */
export function parseAddedYear(dateAdded: string | null | undefined): number | null {
  if (!dateAdded) return null;
  const m = /^(\d{4})-/.exec(dateAdded.trim());
  if (!m) return null;
  const year = Number(m[1]);
  return year >= 1900 && year <= 3000 ? year : null;
}

export interface YearBucket {
  year: number;
  count: number;
}

/**
 * Records added per year (from `dateAdded`), sorted ascending, capped to the
 * most recent `maxYears` years present in the data.
 */
export function bucketAddsByYear(albums: Album[], maxYears = 10): YearBucket[] {
  const map = new Map<number, number>();
  for (const a of albums) {
    const year = parseAddedYear(a.dateAdded);
    if (year == null) continue;
    map.set(year, (map.get(year) ?? 0) + 1);
  }
  const sorted = [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({ year, count }));
  return sorted.slice(-maxYears);
}

export interface CumulativeYearBucket {
  year: number;
  total: number;
}

/**
 * Running total of records added, year by year — the all-time growth curve.
 * Covers every year from the first add to the last (gap years carry the
 * previous total forward so the curve holds flat instead of skipping them).
 */
export function cumulativeAddsByYear(albums: Album[]): CumulativeYearBucket[] {
  const buckets = bucketAddsByYear(albums, Infinity);
  if (buckets.length === 0) return [];
  const byYear = new Map(buckets.map((b) => [b.year, b.count]));
  const out: CumulativeYearBucket[] = [];
  let total = 0;
  for (let y = buckets[0].year; y <= buckets[buckets.length - 1].year; y++) {
    total += byYear.get(y) ?? 0;
    out.push({ year: y, total });
  }
  return out;
}
