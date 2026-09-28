/* Pure status → outcome decision for proxyFetchUserProfile (Bug H2 fix). Kept
   in its own plain module (no Convex deps) so it is unit-testable without
   mocking fetch — same pattern as coverIdentity.ts / marketValue.ts.

   The bug this exists to prevent: proxyFetchUserProfile used to wrap the
   whole request (status handling included) in one try/catch that treated any
   error whose message contained "Failed to fetch" as a network blip and
   returned a fake success. That swallowed real Discogs errors (500/503/403/
   exhausted rate limit) — which HAD that substring in their own thrown
   message — while a genuine network TypeError ("fetch failed") did NOT match
   and was rethrown, the inverse of the intent. A caller (the Follow flow)
   used the fake success as an existence check, so a Discogs hiccup "followed"
   a mistyped username.

   The fix: only a thrown exception from the fetch call itself (a real network
   failure) may produce a degraded result. Every HTTP response — including
   404 and any other non-2xx status — must be classified by THIS function and
   thrown by the caller. It takes no body, so it can only decide whether to
   throw, never construct the success payload. */

export type UserProfileFetchOutcome =
  | { kind: "ok" }
  | { kind: "not_found"; message: string }
  | { kind: "http_error"; message: string };

export function resolveUserProfileFetch(
  status: number,
  ok: boolean,
  username: string
): UserProfileFetchOutcome {
  if (status === 404) {
    return {
      kind: "not_found",
      message: `User "${username}" not found on Discogs.`,
    };
  }
  if (!ok) {
    return {
      kind: "http_error",
      message: `Failed to fetch user profile (${status})`,
    };
  }
  return { kind: "ok" };
}
