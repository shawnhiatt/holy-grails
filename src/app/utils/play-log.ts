/* Pure play-log helpers shared by app-context.tsx's removePlay. Split out so
   the "what's this release's lastPlayed after one row is gone" logic is
   testable without React or Convex. */

/** One logged play: which release, and when. Mirrors PlayLogEntry in app-context.tsx. */
export interface PlayLogRow {
  albumId: string;
  playedAt: number;
}

/**
 * The `lastPlayed` ISO value for one release given the play log AFTER a
 * specific row has already been removed from it — the max `playedAt` still
 * on record for that release, or `undefined` if none remain.
 *
 * Used by `removePlay` when the row being deleted was the release's most
 * recent play: falling back to the next-most-recent remaining play (rather
 * than deleting the release's `lastPlayed` entry outright) means a release
 * with two logged plays still reads as played after its later one is
 * removed, with no flash of "never played" before the server subscription
 * reconciles.
 */
export function lastPlayedAfterRemoval(playLog: PlayLogRow[], albumId: string): string | undefined {
  let maxMs: number | undefined;
  for (const entry of playLog) {
    if (entry.albumId !== albumId) continue;
    if (maxMs === undefined || entry.playedAt > maxMs) maxMs = entry.playedAt;
  }
  return maxMs === undefined ? undefined : new Date(maxMs).toISOString();
}
