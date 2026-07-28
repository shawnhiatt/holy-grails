/**
 * Fisher–Yates shuffle — returns a new array, does not mutate the input.
 * Replaces the `.sort(() => Math.random() - 0.5)` pattern, which produces a
 * biased shuffle (comparison sorts assume a consistent comparator).
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Seeded Fisher–Yates, re-exported from the pure rule-engine module.
 *
 * It lives in `convex/stackRules.ts` rather than here because Convex cannot
 * import from `src/`, and session rotation has to produce the same order on
 * the client and in the server-side share read. Client callers import it from
 * here as usual.
 */
export { seededShuffle } from "../../../convex/stackRules";

/**
 * Seed that holds steady for a calendar day — pair with `seededShuffle` for a
 * selection that rotates daily but stays put while the user is looking at it.
 * Shared so the feed and the Insights screen (a lazy chunk it cannot import
 * from) rotate on the same schedule.
 */
export function getDailySeed(now: Date = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/**
 * Pick one random element. Callers guarantee a non-empty array — the
 * shared "rotate per app load" helper used by the feed's spotlight
 * sections and the identity block's collection fact.
 */
export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
