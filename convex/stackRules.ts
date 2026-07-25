/**
 * The Session Builder rule engine.
 *
 * Pure — no Convex imports — so one implementation serves the live client view
 * and the server-side share-link read (`stacks.getShared`) alike. Same pattern
 * as marketValue.ts / admin.ts / coverIdentity.ts, and tested in the node
 * environment alongside insights.ts and accounts.ts.
 *
 * ── Why membership is derived, not stored ──
 *
 * A session's rule is the only source of truth; the matching records are
 * recomputed at read time from the live collection. That is what makes "a
 * record you just added drops into every session it qualifies for" free — no
 * cron, no recompute-on-write, no drift between the rule and a stored id list.
 * The cost is that contents aren't pinned: pull a record from the collection
 * and it leaves the session silently. For a session that fills itself, that is
 * the correct semantic.
 *
 * ── Forward compatibility ──
 *
 * `field` and `op` are loose strings (same call CLAUDE.md documents for
 * `view_mode`): a client that learns a new operator can write rules an older
 * deployment still reads. Unrecognized conditions are IGNORED rather than
 * throwing — an unknown field fails safe. The one exception is a rule whose
 * conditions are *all* unrecognized, which yields an empty set rather than the
 * whole collection: showing nothing is recoverable, dumping 3000 records into
 * a session is not.
 */

import { conditionRank, hasRating, mediaType } from "./albumFields";

// ─── Types ───

export interface StackRuleCondition {
  field: string;
  op: string;
  /** Shape depends on the operator: a string, a number, an array, or a pair. */
  value?: unknown;
}

export interface StackRule {
  match: "all" | "any";
  conditions: StackRuleCondition[];
  sort: string;
  /** Cap on how many records the session plays. Undefined = no cap. */
  limit?: number;
  rotation: "off" | "daily" | "weekly";
}

/**
 * The normalized album shape the engine reads. Deliberately not `Album` or the
 * Convex `collection` row — those disagree on casing (`release_id` vs
 * `releaseId`) and on where purge tags and play history live. Each side
 * adapts into this, so the engine itself has one shape to reason about.
 */
export interface RuleAlbum {
  releaseId: number;
  artist: string;
  artistIds?: number[];
  title: string;
  label: string;
  year: number;
  genres?: string[];
  styles?: string[];
  /** Raw Discogs format string; the engine classifies it for `mediaType`. */
  format: string;
  folder: string;
  mediaCondition: string;
  rating?: number;
  /** ISO date string, as stored. */
  dateAdded: string;
  purgeTag?: "keep" | "cut" | "maybe" | null;
  /** Epoch ms of the most recent play, or null/undefined if never played. */
  lastPlayedAt?: number | null;
  playCount?: number;
  /** Lowest ask from the market-value drip. Sparse — gate any UI on it. */
  marketValue?: number | null;
}

// ─── Rotation ───

const DAY_MS = 86_400_000;

/**
 * How far to shift the rotation period boundary off UTC midnight.
 *
 * A naive UTC-day bucket flips at 00:00 UTC, which is late afternoon in the
 * US — mid-evening, prime listening, the worst possible moment for the set to
 * change under someone mid-sitting. Ten hours moves the flip to 10:00 UTC:
 * early morning across the beta's actual users, when nobody is listening.
 *
 * This is a judgment call about where the users are, not a law. Changing it
 * reshuffles every rotating session once, which is harmless.
 */
export const ROTATION_OFFSET_MS = 10 * 60 * 60 * 1000;

/**
 * Rotation only engages when the pool meaningfully exceeds the cap. Below
 * this, a reshuffle returns nearly the same records in a different order,
 * which reads as random noise rather than as freshness.
 */
export const ROTATION_THRESHOLD = 1.5;

/**
 * The current rotation period as an integer. Same number all period, one
 * higher the next — that is the entire mechanism: no stored state, no job,
 * and it computes identically on the client and in Convex so a shared link
 * shows the owner's set.
 */
export function rotationBucket(
  rotation: "off" | "daily" | "weekly",
  now: number
): number {
  const shifted = now - ROTATION_OFFSET_MS;
  if (rotation === "weekly") return Math.floor(shifted / (DAY_MS * 7));
  return Math.floor(shifted / DAY_MS);
}

// ─── Seeded shuffle ───

/** xmur3 string hash → 32-bit seed. Public-domain construction. */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32 PRNG — small, fast, plenty for shuffling a record crate. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates seeded by a string — same seed in, same order out, forever.
 *
 * An *addition* to the unseeded `shuffle` in utils/shuffle.ts, not an
 * exception to the ban on `Math.random()` sort-shuffles: still Fisher–Yates,
 * just with a deterministic source of randomness. Lives here rather than in
 * utils/ because Convex cannot import from `src/`; utils/shuffle.ts re-exports
 * it so client callers keep their usual import.
 */
export function seededShuffle<T>(input: readonly T[], seed: string): T[] {
  const rand = mulberry32(xmur3(seed));
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Condition evaluation ───

const lower = (s: unknown): string => String(s ?? "").toLowerCase().trim();

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(lower).filter(Boolean);
  const one = lower(v);
  return one ? [one] : [];
}

/** Days between `then` and `now`, or null when `then` is unusable. */
function daysSince(then: number | null | undefined, now: number): number | null {
  if (then == null || !Number.isFinite(then)) return null;
  return (now - then) / DAY_MS;
}

function dateAddedMs(a: RuleAlbum): number | null {
  if (!a.dateAdded) return null;
  const t = new Date(a.dateAdded).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Evaluate one condition. Returns `null` — not false — when the field or
 * operator isn't recognized, so the caller can drop it instead of letting an
 * unknown condition silently exclude everything.
 */
export function evaluateCondition(
  album: RuleAlbum,
  cond: StackRuleCondition,
  now: number
): boolean | null {
  const { field, op, value } = cond;

  switch (field) {
    case "artist": {
      if (op === "is") return lower(album.artist) === lower(value);
      if (op === "contains") return lower(album.artist).includes(lower(value));
      return null;
    }
    case "artistId": {
      if (op === "is") {
        const target = asNumber(value);
        return target != null && (album.artistIds || []).includes(target);
      }
      return null;
    }
    case "title": {
      if (op === "contains") return lower(album.title).includes(lower(value));
      if (op === "is") return lower(album.title) === lower(value);
      return null;
    }
    case "label": {
      if (op === "is") return lower(album.label) === lower(value);
      if (op === "contains") return lower(album.label).includes(lower(value));
      return null;
    }
    case "year": {
      // Discogs uses year 0 for "no release date" — it is missing data, not
      // year zero, so an unknown year matches no year comparison at all.
      if (!album.year) return false;
      if (op === "is") return album.year === asNumber(value);
      if (op === "before") {
        const n = asNumber(value);
        return n != null && album.year < n;
      }
      if (op === "after") {
        const n = asNumber(value);
        return n != null && album.year > n;
      }
      if (op === "between") {
        const pair = Array.isArray(value) ? value : [];
        const lo = asNumber(pair[0]);
        const hi = asNumber(pair[1]);
        return lo != null && hi != null && album.year >= lo && album.year <= hi;
      }
      return null;
    }
    case "decade": {
      if (op === "is") {
        if (!album.year) return false;
        const n = asNumber(value);
        return n != null && Math.floor(album.year / 10) * 10 === n;
      }
      return null;
    }
    case "genre":
    case "style": {
      // Genres and styles are checked together against both lists. Discogs
      // shelves the same word in either bucket depending on the release
      // ("Soul" is a genre on one and a style on another), so treating them
      // as one namespace is what the user means by "jazz".
      const tags = [...(album.genres || []), ...(album.styles || [])].map(lower);
      const wanted = asStringList(value);
      if (wanted.length === 0) return null;
      if (op === "includesAny") return wanted.some((w) => tags.includes(w));
      if (op === "excludesAll") return !wanted.some((w) => tags.includes(w));
      return null;
    }
    case "mediaType": {
      const mt = lower(mediaType(album.format));
      if (op === "is") return mt === lower(value);
      if (op === "isNot") return mt !== lower(value);
      return null;
    }
    case "format": {
      if (op === "contains") return lower(album.format).includes(lower(value));
      return null;
    }
    case "folder": {
      if (op === "is") return lower(album.folder) === lower(value);
      if (op === "isNot") return lower(album.folder) !== lower(value);
      return null;
    }
    case "mediaCondition": {
      const rank = conditionRank(album.mediaCondition);
      if (op === "is") return rank >= 0 && rank === conditionRank(String(value));
      if (op === "atLeast") {
        const target = conditionRank(String(value));
        // Ungraded copies fail "at least VG+" rather than passing by default —
        // an unknown grade is not a promise about the record.
        if (rank < 0 || target < 0) return false;
        return rank <= target; // lower index = better grade
      }
      return null;
    }
    case "rating": {
      if (op === "unrated") return !hasRating(album.rating);
      if (!hasRating(album.rating)) return false;
      if (op === "is") return album.rating === asNumber(value);
      if (op === "atLeast") {
        const n = asNumber(value);
        return n != null && album.rating >= n;
      }
      if (op === "atMost") {
        const n = asNumber(value);
        return n != null && album.rating <= n;
      }
      return null;
    }
    case "purgeTag": {
      const tag = album.purgeTag ?? null;
      if (op === "untagged") return tag === null;
      if (op === "is") return tag === lower(value);
      if (op === "isNot") return tag !== lower(value);
      return null;
    }
    case "lastPlayed": {
      const days = daysSince(album.lastPlayedAt, now);
      if (op === "never") return days === null;
      const n = asNumber(value);
      if (n == null) return null;
      // Never played counts as "not within N days" — it is the strongest
      // possible case of not having played it — and never as "within".
      if (op === "withinDays") return days !== null && days <= n;
      if (op === "notWithinDays") return days === null || days > n;
      return null;
    }
    case "playCount": {
      const n = asNumber(value);
      if (n == null) return null;
      const count = album.playCount ?? 0;
      if (op === "atLeast") return count >= n;
      if (op === "atMost") return count <= n;
      return null;
    }
    case "dateAdded": {
      const added = dateAddedMs(album);
      if (added === null) return false;
      if (op === "withinDays") {
        const n = asNumber(value);
        return n != null && (now - added) / DAY_MS <= n;
      }
      if (op === "before") {
        const t = new Date(String(value)).getTime();
        return Number.isFinite(t) && added < t;
      }
      if (op === "after") {
        const t = new Date(String(value)).getTime();
        return Number.isFinite(t) && added > t;
      }
      return null;
    }
    case "marketValue": {
      const n = asNumber(value);
      if (n == null) return null;
      // Sparse by design: `null` means priced-but-no-listings, `undefined`
      // means never priced. Neither is a number to compare, so both fail
      // rather than being treated as $0.
      const val = album.marketValue;
      if (val == null) return false;
      if (op === "atLeast") return val >= n;
      if (op === "atMost") return val <= n;
      return null;
    }
    default:
      return null;
  }
}

/** Does this album satisfy the rule's conditions? */
export function matchesRule(album: RuleAlbum, rule: StackRule, now: number): boolean {
  const results: boolean[] = [];
  for (const cond of rule.conditions || []) {
    const r = evaluateCondition(album, cond, now);
    if (r !== null) results.push(r);
  }
  // No comprehensible condition → match nothing. See the forward-compatibility
  // note at the top: an empty session is recoverable, a session that quietly
  // swallowed the whole collection is not.
  if (results.length === 0) return false;
  return rule.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

// ─── Sorting ───

export const RULE_SORTS = [
  "artist-az",
  "title-az",
  "year-new",
  "year-old",
  "added-new",
  "added-old",
  "rating-high",
  "last-played-oldest",
] as const;

function sortAlbums(albums: RuleAlbum[], sort: string): RuleAlbum[] {
  const out = [...albums];
  switch (sort) {
    case "title-az":
      out.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "year-new":
      out.sort((a, b) => b.year - a.year);
      break;
    case "year-old":
      // Unknown year (0) sorts last rather than leading "oldest first".
      out.sort((a, b) => (a.year || Infinity) - (b.year || Infinity));
      break;
    case "added-new":
      out.sort((a, b) => (dateAddedMs(b) ?? 0) - (dateAddedMs(a) ?? 0));
      break;
    case "added-old":
      out.sort((a, b) => (dateAddedMs(a) ?? 0) - (dateAddedMs(b) ?? 0));
      break;
    case "rating-high":
      // Unrated sinks below one-star: unrated is not a zero-star record.
      out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "last-played-oldest":
      // Never played leads — it is the oldest possible last play.
      out.sort((a, b) => (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0));
      break;
    case "artist-az":
    default:
      out.sort((a, b) => a.artist.localeCompare(b.artist));
      break;
  }
  return out;
}

// ─── The evaluator ───

export interface EvaluateResult {
  /** The records the session plays right now, in running order. */
  albums: RuleAlbum[];
  /** How many records match the rule before the cap — the "of M" in the UI. */
  poolSize: number;
  /** True when the cap is active AND rotation actually engaged this period. */
  rotating: boolean;
}

/**
 * Evaluate a session rule against a collection.
 *
 * Order is specified precisely because the client and the server must agree
 * exactly — a shared link that disagreed with the owner's view would be worse
 * than no share link:
 *
 *   1. Filter by `conditions`, honoring `match`.
 *   2. Remove `excludedIds`.
 *   3. If rotating and the pool clears the threshold: seeded-shuffle by
 *      `stackId + period bucket` and take `limit`. Otherwise: sort, take
 *      `limit`.
 *   4. Sort the resulting set for display.
 *
 * Step 4 runs in both branches, so rotation picks *which* records and the sort
 * rule always decides the *running order*. Keeping those independent is what
 * lets a daily-rotating jazz session still play oldest-first.
 */
export function evaluateStackRule(
  albums: readonly RuleAlbum[],
  rule: StackRule,
  opts: { stackId: string; excludedIds?: number[]; now?: number }
): EvaluateResult {
  const now = opts.now ?? Date.now();
  const excluded = new Set(opts.excludedIds || []);

  const pool = albums.filter(
    (a) => !excluded.has(a.releaseId) && matchesRule(a, rule, now)
  );

  const limit = rule.limit && rule.limit > 0 ? rule.limit : null;
  const rotating =
    rule.rotation !== "off" &&
    limit !== null &&
    pool.length >= limit * ROTATION_THRESHOLD;

  let selected: RuleAlbum[];
  if (rotating && limit !== null) {
    const seed = `${opts.stackId}:${rotationBucket(rule.rotation, now)}`;
    selected = seededShuffle(pool, seed).slice(0, limit);
  } else {
    selected = limit !== null ? sortAlbums(pool, rule.sort).slice(0, limit) : pool;
  }

  return {
    albums: sortAlbums(selected, rule.sort),
    poolSize: pool.length,
    rotating,
  };
}
