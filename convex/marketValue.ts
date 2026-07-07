/* Pure helpers for the per-album market-value drip (Spec 6, Session A).
   No Convex runtime deps — the daily action imports these and the
   convex-test suite exercises them directly (the row-selection and
   cursor advance/wrap logic is the part worth unit-testing). */

/** 30 days before a fetched value is considered stale and re-fetched. */
export const MARKET_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** Max releases fetched per user per daily run — a deliberate slow drip. */
export const MARKET_BATCH_SIZE = 40;

/**
 * The next cursor after processing a batch. If the batch came back short of
 * `limit`, the stale rows above the old cursor are exhausted — wrap to 0 so
 * the next run re-scans from the start (picking up whatever has since gone
 * stale). Otherwise advance to the last releaseId processed.
 */
export function nextMarketCursor(
  batchLength: number,
  lastReleaseId: number | undefined,
  limit: number,
): number {
  if (batchLength < limit || lastReleaseId == null) return 0;
  return lastReleaseId;
}
