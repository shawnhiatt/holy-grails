import type { Album } from "../components/discogs-api";

/* Rotating collection facts — real data doing the personality work.
   One fact is picked per app load for the feed identity block. Every fact
   is threshold-gated so sparse collections never produce weak lines, and
   the derivation rules mirror reports-screen (artist exclusions,
   disambiguation-suffix stripping, decade minimums). */

const EXCLUDED_ARTISTS = new Set([
  "various",
  "various artists",
  "unknown artist",
  "unknown",
]);

export function deriveCollectionFacts(albums: Album[]): string[] {
  const facts: string[] = [];
  if (albums.length === 0) return facts;

  // Most collected decade — 5+ records, matching the Decades section minimum
  const byDecade = new Map<string, number>();
  for (const a of albums) {
    if (a.year && a.year >= 1900) {
      const d = `${Math.floor(a.year / 10) * 10}s`;
      byDecade.set(d, (byDecade.get(d) ?? 0) + 1);
    }
  }
  let topDecade: string | null = null;
  let topDecadeN = 0;
  for (const [d, n] of byDecade) {
    if (n > topDecadeN) { topDecade = d; topDecadeN = n; }
  }
  if (topDecade && topDecadeN >= 5) facts.push(`Most collected: the ${topDecade}`);

  // Top artist — 3+ records, reports-screen exclusions
  const byArtist = new Map<string, number>();
  for (const a of albums) {
    const name = a.artist.replace(/\s*\(\d+\)\s*$/, "").trim();
    if (!name || EXCLUDED_ARTISTS.has(name.toLowerCase())) continue;
    byArtist.set(name, (byArtist.get(name) ?? 0) + 1);
  }
  let topArtist: string | null = null;
  let topArtistN = 0;
  for (const [name, n] of byArtist) {
    if (n > topArtistN) { topArtist = name; topArtistN = n; }
  }
  if (topArtist && topArtistN >= 3) facts.push(`Top artist: ${topArtist}`);

  // Top label — 3+ records
  const byLabel = new Map<string, number>();
  for (const a of albums) {
    const label = a.label?.trim();
    if (!label || label === "Unknown") continue;
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
  }
  let topLabel: string | null = null;
  let topLabelN = 0;
  for (const [name, n] of byLabel) {
    if (n > topLabelN) { topLabel = name; topLabelN = n; }
  }
  if (topLabel && topLabelN >= 3) facts.push(`Top label: ${topLabel}`);

  // Oldest pressing
  let oldest = Infinity;
  for (const a of albums) {
    if (a.year && a.year >= 1900 && a.year < oldest) oldest = a.year;
  }
  if (Number.isFinite(oldest)) facts.push(`Oldest pressing: ${oldest}`);

  // Latest pickup — ISO date strings compare lexicographically
  let latest: Album | null = null;
  for (const a of albums) {
    if (!a.dateAdded) continue;
    if (!latest || a.dateAdded > latest.dateAdded) latest = a;
  }
  if (latest) facts.push(`Latest pickup: ${latest.title}`);

  return facts;
}
