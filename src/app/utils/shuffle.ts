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
