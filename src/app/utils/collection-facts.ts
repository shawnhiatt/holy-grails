import type { Album } from "../components/discogs-api";

/* Rotating collection facts — real data doing the personality work.
   Rendered in the feed identity block ticker as an eyebrow label ("TOP
   ARTIST") beside its value ("Talking Heads"), so facts are structured
   pairs rather than prose lines. Every fact is threshold-gated so sparse
   collections never produce weak lines, and the derivation rules mirror
   reports-screen (artist exclusions, disambiguation-suffix stripping,
   decade minimums). */

export interface CollectionFact {
  label: string;
  value: string;
}

const EXCLUDED_ARTISTS = new Set([
  "various",
  "various artists",
  "unknown artist",
  "unknown",
]);

export function deriveCollectionFacts(
  albums: Album[],
  playCounts?: Record<string, number>,
): CollectionFact[] {
  const facts: CollectionFact[] = [];
  if (albums.length === 0) return facts;

  // Most rotated — highest play count, presented first. 2+ plays required
  // (a single play isn't a rotation pattern). Derived from existing
  // last_played rows via the context playCounts map (keyed by album id) —
  // no new tracking. First-wins on ties.
  if (playCounts) {
    let mostRotated: Album | null = null;
    let mostRotatedN = 0;
    for (const a of albums) {
      const n = playCounts[a.id] ?? 0;
      if (n > mostRotatedN) { mostRotated = a; mostRotatedN = n; }
    }
    if (mostRotated && mostRotatedN >= 2) {
      const artist = mostRotated.artist.replace(/\s*\(\d+\)\s*$/, "").trim();
      facts.push({
        label: "Most rotated",
        value: artist ? `${artist} – ${mostRotated.title}` : mostRotated.title,
      });
    }
  }

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
  if (topDecade && topDecadeN >= 5) facts.push({ label: "Top decade", value: `The ${topDecade}` });

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
  if (topArtist && topArtistN >= 3) facts.push({ label: "Top artist", value: topArtist });

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
  if (topLabel && topLabelN >= 3) facts.push({ label: "Top label", value: topLabel });

  // Oldest pressing
  let oldest = Infinity;
  for (const a of albums) {
    if (a.year && a.year >= 1900 && a.year < oldest) oldest = a.year;
  }
  if (Number.isFinite(oldest)) facts.push({ label: "Oldest pressing", value: String(oldest) });

  // Latest pickup — ISO date strings compare lexicographically. Include the
  // artist so the line reads as a record, not a bare title.
  let latest: Album | null = null;
  for (const a of albums) {
    if (!a.dateAdded) continue;
    if (!latest || a.dateAdded > latest.dateAdded) latest = a;
  }
  if (latest) {
    const artist = latest.artist.replace(/\s*\(\d+\)\s*$/, "").trim();
    facts.push({
      label: "Latest pickup",
      value: artist ? `${artist} – ${latest.title}` : latest.title,
    });
  }

  return facts;
}
