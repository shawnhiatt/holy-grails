/**
 * Detects the one error class that means "this tab is running an older build
 * than the backend it is talking to."
 *
 * The failure mode this exists for: a Convex deploy lands while an installed
 * PWA is still serving its previous precache. The old client calls a function
 * whose validator or name has since changed, Convex rejects it, `useQuery`
 * throws the rejection during render, and the root ErrorBoundary catches it.
 * Nothing is actually broken — the client just needs the build that matches.
 * Force-closing the PWA fixed it only because that let the waiting service
 * worker take over; `recoverFromStaleBuild` in pwa-update.ts does the same
 * thing without the user having to know that.
 *
 * Matching is on message text because that is all the client gets: Convex
 * relays the server's `errorMessage` string (see QueryFailed handling in
 * convex/browser/sync/remote_query_set) with no machine-readable code for
 * "your client is out of date". The patterns below are therefore deliberately
 * narrow — a false positive costs a needless reload, so nothing generic like
 * "server error" belongs here.
 */

/** Substrings that only appear when client and server disagree about the API. */
const STALE_BUILD_PATTERNS = [
  // Convex: the client called a function this deployment no longer publishes.
  "could not find public function",
  "could not find function",
  // Convex: the function exists, but its argument validator has moved on.
  "argumentvalidationerror",
  "is not in the validator",
  "missing the required field",
  // Vite: a lazy chunk (Insights, album detail, Look It Up) whose hashed
  // filename is gone from the deploy. The last two are what a browser says
  // when it gets index.html back in place of the missing .js.
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "expected a javascript module script",
];

/**
 * True when `err` says the running build no longer matches the backend, and a
 * reload onto the current build should therefore fix it.
 */
export function isStaleBuildError(err: unknown): boolean {
  const message = staleErrorMessage(err);
  if (!message) return false;
  const haystack = message.toLowerCase();
  return STALE_BUILD_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/** Pulls a message out of the several shapes a thrown value arrives in. */
function staleErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return `${err.message}\n${err.stack ?? ""}`;
  if (err && typeof err === "object" && "message" in err) {
    const { message } = err as { message: unknown };
    return typeof message === "string" ? message : "";
  }
  return "";
}
