/**
 * Pure helpers over album fields that BOTH the client and Convex need.
 *
 * No Convex imports — same pattern as marketValue.ts / admin.ts /
 * coverIdentity.ts, so the client bundle, the Convex runtime, and the node
 * test environment can all import it.
 *
 * `mediaType` and `hasRating` used to live in `discogs-api.ts` (client-only).
 * They moved here whole when the session rule engine landed, because a rule
 * has to evaluate identically on the client and in `stacks.getShared` — two
 * copies of a classifier is a bug waiting for a format string nobody tested.
 * `discogs-api.ts` re-exports both, so every existing import site is unchanged
 * and there is exactly one implementation.
 */

// ─── Format classifier ───

/**
 * UI media-type buckets. The raw Discogs format string is never discarded —
 * this classifier only groups it for badges, the filter drawer, Reports By
 * Format, session rules, and the `"vinyl"` display scope. A CD/CDr/SACD all
 * read "CD" here.
 */
export type MediaType =
  | "Vinyl"
  | "Shellac"
  | "CD"
  | "Cassette"
  | "Tape"
  | "DVD"
  | "Blu-ray"
  | "Digital"
  | "Box Set"
  | "Other";

/**
 * Classify a Discogs format string into a UI media-type bucket. First match
 * wins — order matters: the physical-medium checks come before "Box Set"/
 * "All Media" so "Box Set; Vinyl; LP" reads as Vinyl, not Box Set. Forgiving:
 * anything unmatched (including "") falls through to "Other", never throws.
 */
export function mediaType(format: string): MediaType {
  const f = format.toLowerCase();
  if (
    f.includes("vinyl") ||
    f.includes("flexi") ||
    f.includes("lathe") ||
    f.includes("acetate")
  )
    return "Vinyl";
  if (
    f.includes("shellac") ||
    f.includes("pathé") ||
    f.includes("pathe") ||
    f.includes("edison") ||
    f.includes("cylinder")
  )
    return "Shellac";
  if (f.includes("blu-ray") || f.includes("bluray")) return "Blu-ray";
  // "cd" also covers CDr/CDV/SACD; Minidisc has no "cd" substring so it's explicit.
  if (f.includes("cd") || f.includes("minidisc")) return "CD";
  if (
    f.includes("cassette") ||
    f.includes("cartridge") ||
    f.includes("dcc") ||
    f.includes("elcaset") ||
    f.includes("playtape")
  )
    return "Cassette";
  if (f.includes("reel") || f.includes("dat")) return "Tape";
  if (f.includes("dvd") || f.includes("laserdisc") || f.includes("vhs"))
    return "DVD";
  if (f.includes("file") || f.includes("memory stick") || f.includes("floppy"))
    return "Digital";
  if (f.includes("box set")) return "Box Set";
  return "Other";
}

// ─── Rating convention ───

/**
 * Guard for the user's own star rating, mirroring the `hasYear` convention.
 *
 * Discogs sends `rating: 0` to mean UNRATED, not zero stars — the same trap as
 * year 0. The sync mapper strips the 0, so a stored rating is always a real
 * 1–5. This guard is the read-side half: never render a rating without it, and
 * never express "unrated" as `rating < 1` — say `!hasRating(...)`.
 */
export const hasRating = (rating: number | null | undefined): rating is number =>
  rating != null && rating > 0;

/** Star values a rating can take, best first. */
export const RATING_VALUES = [5, 4, 3, 2, 1] as const;

// ─── Condition grades ───

/** Condition grades in order from best to worst. */
export const CONDITION_GRADES = [
  "Mint (M)",
  "Near Mint (NM or M-)",
  "Very Good Plus (VG+)",
  "Very Good (VG)",
  "Good Plus (G+)",
  "Good (G)",
  "Fair (F)",
  "Poor (P)",
];

/** Short grade codes, index-aligned with CONDITION_GRADES. */
const CONDITION_CODES = ["m", "nm", "vg+", "vg", "g+", "g", "f", "p"];

/**
 * Rank a condition string best-to-worst: 0 = Mint, 7 = Poor, -1 = unknown or
 * unset. Powers the `atLeast` operator on `mediaCondition`.
 *
 * The cache stores Discogs' full label ("Very Good Plus (VG+)"), so that is
 * the first pass. The bare-code pass is a fallback for hand-entered values
 * and is anchored to whole tokens — an unanchored `includes("g")` would rank
 * "Very Good Plus" as Good. The mapper joins multiple grades with " · "; the
 * best recognizable grade wins, since a copy graded twice is at least its
 * better grade.
 */
export function conditionRank(condition: string | undefined): number {
  if (!condition) return -1;
  const c = condition.toLowerCase();

  for (let i = 0; i < CONDITION_GRADES.length; i++) {
    if (c.includes(CONDITION_GRADES[i].toLowerCase())) return i;
  }

  // Fallback: bare codes, matched as whole tokens (split on anything that
  // isn't a letter or a plus, so "VG+ / NM" and "vg+" both resolve).
  const tokens = c.split(/[^a-z+]+/).filter(Boolean);
  for (let i = 0; i < CONDITION_CODES.length; i++) {
    if (tokens.includes(CONDITION_CODES[i])) return i;
  }
  return -1;
}
