/* Constants for the per-album market-value drip (Spec 6A.1). Kept in their own
   plain module (no Convex runtime deps) so the "use node" drip action and the
   convex-test suite can both import them. */

/** 30 days before a fetched value is considered stale and re-fetched. */
export const MARKET_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** Max releases priced per daily run — a deliberate slow drip. */
export const MARKET_BATCH_SIZE = 40;

/**
 * The currency all shared prices are fetched in (`curr_abbr` on the Discogs
 * marketplace stats request). A shared per-release value must be one currency
 * regardless of which user's token fetched it — Discogs otherwise localizes to
 * the token owner's currency. USD is the default; change here if the audience
 * shifts. Must be one of Discogs' supported codes (USD/GBP/EUR/CAD/AUD/JPY/…).
 */
export const MARKET_CURRENCY = "USD";
