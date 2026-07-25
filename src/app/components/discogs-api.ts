/**
 * Discogs API types, constants, and client-side caches.
 *
 * All authenticated Discogs HTTP calls are now routed through server-side
 * Convex actions in `convex/discogs.ts`. This module retains only:
 *   - Domain types (Album, WantItem, Stack, etc.)
 *   - Condition grade constants
 *   - Pure utility functions (normalizeCondition, buildFieldMap)
 *   - In-memory caches (market data, collection value)
 */

import type { StackRule } from "../../../convex/stackRules";

// ─── Domain types ───

export type PurgeTag = "keep" | "cut" | "maybe" | null;

export interface Album {
  id: string;
  release_id: number;
  master_id?: number;
  instance_id: number;
  folder_id: number;
  title: string;
  artist: string;
  year: number;
  thumb: string;
  cover: string;
  folder: string;
  label: string;
  catalogNumber: string;
  format: string;
  mediaCondition: string;
  sleeveCondition: string;
  notes: string;
  /** Arbitrary user-defined Discogs custom fields (e.g. "Acquired From", "Last Cleaned") */
  customFields?: { name: string; value: string; fieldId?: number; type?: string; options?: string[] }[];
  dateAdded: string;
  /** Discogs genres ("Jazz") and the more specific styles ("Hard Bop"). Both
   *  ride along on the collection response — no extra request. Undefined on
   *  rows synced before the free-data pass; backfills on the next sync. */
  genres?: string[];
  styles?: string[];
  /** The user's own 1–5 star Discogs rating. **Undefined means UNRATED** —
   *  never 0. Same footgun as `year: 0`; guard with `hasRating`, and never
   *  test `rating < 1` to find unrated records. Distinct from the community
   *  average rating album detail shows from the enriched release fetch. */
  rating?: number;
  /** Disc count summed from `formats[].qty` — a 2×LP reads 2. Stored but
   *  deliberately unsurfaced (D10); it exists for rules and future use. */
  discCount?: number;
  /** Discogs artist ids, for exact matching without the " (2)" suffix dance.
   *  Also unsurfaced infrastructure. */
  artistIds?: number[];
  /** Lowest ask from the shared market-value drip (Spec 6A.1), merged in by the
   *  Insights value sections (Session B) from `market_values` keyed on
   *  `release_id`. `null` = fetched, no listings; `undefined` = not yet fetched. */
  marketValue?: number | null;
  marketValueFetchedAt?: number;
  discogsUrl: string;
  purgeTag: PurgeTag;
}

export interface WantItem {
  id: string;
  release_id: number;
  master_id?: number;
  title: string;
  artist: string;
  year: number;
  thumb: string;
  cover: string;
  label: string;
  /** Raw Discogs format string; may be undefined for rows synced before the
   *  all-formats change captured format on the wantlist. Powers badges. */
  format?: string;
  /** Free data, as on `Album` — minus `rating`, which Discogs only keeps for
   *  copies you own. */
  genres?: string[];
  styles?: string[];
  discCount?: number;
  artistIds?: number[];
  priority: boolean;
}

export interface Stack {
  id: string;
  name: string;
  /** Hand-picked members. Always `[]` for an auto session — its membership is
   *  derived from `rule` at read time, never stored (see `stackMembership`). */
  albumIds: string[];
  createdAt: string;
  lastModified: string;
  /** Capability-token share id when the session is shared; undefined otherwise. */
  shareId?: string;
  /** "auto" = fills itself from `rule`. Undefined reads as "manual", so every
   *  session that predates the Session Builder is already correct. */
  kind?: "manual" | "auto";
  rule?: StackRule;
  /** Records kicked out of an auto session by hand, keyed on release_id. */
  excludedIds?: number[];
  /** Last title the generator produced; see the title-freeze rule. */
  nameGenerated?: string;
}

export interface FollowedUser {
  id: string;
  username: string;
  avatar: string;
  isPrivate: boolean;
  collection: Album[];
  wants: WantItem[];
  folders: string[];
  lastSynced: string;
  /** false while API hydration is in progress; true (or undefined for legacy) once complete */
  hydrated?: boolean;
}

export interface FeedAlbum {
  release_id: number;
  master_id?: number;
  title: string;
  artist: string;
  year: number;
  thumb: string;
  cover: string;
  label: string;
  /** Raw Discogs format string; undefined for feed/followed rows synced before
   *  the all-formats change. Powers badges; missing = no badge (never vinyl). */
  format?: string;
  dateAdded: string;
}

// ─── User Profile types ───

export interface UserProfile {
  username: string;
  avatar: string;
  profile: string;
  location: string;
  registered: string;
  buyerRating: number;
  buyerRatingStars: number;
  sellerRating: number;
  sellerRatingStars: number;
  releasesContributed: number;
  releasesRated: number;
  numLists: number;
  rank: number;
}

// ─── Market Value / Pricing types ───

export interface CollectionValue {
  minimum: number;
  median: number;
  maximum: number;
  currency: string;
  fetchedAt: number;
}


// ─── Format classifier / rating convention (re-exported) ───

/**
 * `mediaType`, `hasRating`, `RATING_VALUES` and `CONDITION_GRADES` moved to
 * `convex/albumFields.ts` when the session rule engine landed: a rule must
 * evaluate identically on the client and inside `stacks.getShared`, and Convex
 * cannot import from `src/`. They are re-exported here so every existing
 * `from "./discogs-api"` import site is unchanged and there is exactly one
 * implementation. Import from either path; do not copy the logic back.
 */
export type { StackRule, StackRuleCondition, RuleAlbum } from "../../../convex/stackRules";

export {
  mediaType,
  hasRating,
  RATING_VALUES,
  CONDITION_GRADES,
  conditionRank,
  type MediaType,
} from "../../../convex/albumFields";

// ─── Condition grade constants ───

/** Short labels for display */
export const CONDITION_SHORT: Record<string, string> = {
  "Mint (M)": "M",
  "Near Mint (NM or M-)": "NM",
  "Very Good Plus (VG+)": "VG+",
  "Very Good (VG)": "VG",
  "Good Plus (G+)": "G+",
  "Good (G)": "G",
  "Fair (F)": "F",
  "Poor (P)": "P",
};

// ─── Custom Fields utility ───

export interface DiscogsCustomField {
  id: number;
  name: string;
  type: string; // "dropdown", "textarea", "text"
  options?: string[];
  public: boolean;
}

export interface FieldMap {
  mediaConditionId: number | null;
  sleeveConditionId: number | null;
  notesId: number | null;
  /** All other custom fields: field_id → field info */
  otherFields: Map<number, { name: string; type: string; options?: string[] }>;
}

export function buildFieldMap(fields: DiscogsCustomField[]): FieldMap {
  const result: FieldMap = {
    mediaConditionId: null,
    sleeveConditionId: null,
    notesId: null,
    otherFields: new Map(),
  };

  for (const f of fields) {
    const lower = f.name.toLowerCase().trim();

    if (lower === "media condition" || lower === "media") {
      result.mediaConditionId = f.id;
    } else if (lower === "sleeve condition" || lower === "sleeve") {
      result.sleeveConditionId = f.id;
    } else if (lower === "notes") {
      result.notesId = f.id;
    } else {
      result.otherFields.set(f.id, { name: f.name, type: f.type, options: f.options });
    }
  }

  return result;
}

// ─── In-memory caches ───

// Collection value cache
let _collectionValue: CollectionValue | null = null;

export function getCachedCollectionValue(): CollectionValue | null {
  return _collectionValue;
}

/** Pre-populate the in-memory collection value cache (used when restoring from Convex) */
export function setCollectionValueCache(value: CollectionValue): void {
  _collectionValue = value;
}

/** Clear the cached collection value entirely (returns getCachedCollectionValue → null) */
export function clearCollectionValue(): void {
  _collectionValue = null;
}
