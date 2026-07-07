import type { Album } from "../components/discogs-api";

/* Pure derivations for the Insights screen's phase-1 sections (Spec 4).
   Kept out of reports-screen.tsx so they're unit-testable in the node
   environment without pulling in recharts/React. All derive from data
   already on collection rows — no new API calls. */

/**
 * Parse a free-text `pricePaid` string into a positive number, or null.
 * Discogs stores this as arbitrary user text, so parse defensively:
 * accepts US-style "$25.00", "25", "1,234.56"; rejects empty, non-numeric,
 * zero/negative, and ambiguous euro decimal-comma formats ("€1.200,50").
 */
export function parsePricePaid(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Strip everything that isn't a digit, dot, comma, or minus (currency
  // symbols, codes, whitespace).
  const core = s.replace(/[^\d.,-]/g, "");
  if (!core) return null;
  // Accept only clean US formatting: optional thousands commas + optional
  // dot decimal. Euro "1.200,50" (comma decimal) falls through to null.
  if (!/^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(core)) return null;
  const n = parseFloat(core.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

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

export interface SpendingSummary {
  total: number;
  average: number;
  count: number;
  priciest: { title: string; price: number } | null;
}

/**
 * Aggregate spend over albums with a parseable positive `pricePaid`.
 * `count` is how many albums contributed; callers gate on it (5+).
 */
export function deriveSpending(albums: Album[]): SpendingSummary {
  let total = 0;
  let count = 0;
  let priciest: { title: string; price: number } | null = null;
  for (const a of albums) {
    const price = parsePricePaid(a.pricePaid);
    if (price == null) continue;
    total += price;
    count += 1;
    if (!priciest || price > priciest.price) {
      priciest = { title: a.title, price };
    }
  }
  return {
    total,
    average: count > 0 ? total / count : 0,
    count,
    priciest,
  };
}
