// How old our copy of the user's own Discogs data may get before we refetch it.
//
// Discogs' API Terms of Use forbid displaying data more than 6 hours older than
// discogs.com. The background probe only compares collection/wantlist COUNTS, so
// an edit made on discogs.com (a rating, a note, a folder move) never moved the
// counts and never arrived — hence the age check alongside it.
//
// Shared by the change-detection probe (`maybeBackgroundSync`) and the
// collection-value refresh on launch, so the two cannot drift apart. The
// following-feed cache keeps its own 24h TTL; this is for the user's own data.
export const OWN_DATA_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** True when `syncedAt` (ms epoch) is missing or at least `maxAgeMs` before `now`. */
export function isOlderThan(
  syncedAt: number | null | undefined,
  now: number,
  maxAgeMs: number = OWN_DATA_MAX_AGE_MS,
): boolean {
  return !syncedAt || now - syncedAt >= maxAgeMs;
}

/**
 * Should the background probe run a full sync? Yes when the last full sync is
 * over 6 hours old, or when Discogs' counts differ from the ones recorded at the
 * last sync (or none were ever recorded).
 */
export function shouldFullSync(args: {
  lastSyncedAt: number | null | undefined;
  now: number;
  prevCollectionCount: number | null | undefined;
  prevWantlistCount: number | null | undefined;
  collectionCount: number;
  wantlistCount: number;
}): boolean {
  if (isOlderThan(args.lastSyncedAt, args.now)) return true;
  return (
    args.prevCollectionCount == null ||
    args.prevWantlistCount == null ||
    args.collectionCount !== args.prevCollectionCount ||
    args.wantlistCount !== args.prevWantlistCount
  );
}
