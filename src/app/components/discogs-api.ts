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
  priority: boolean;
}

export interface Stack {
  id: string;
  name: string;
  albumIds: string[];
  createdAt: string;
  lastModified: string;
  /** Capability-token share id when the session is shared; undefined otherwise. */
  shareId?: string;
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


// ─── Format classifier ───

/**
 * UI media-type buckets. The raw Discogs format string is never discarded —
 * this classifier only groups it for badges, the filter drawer, Reports By
 * Format, and the `"vinyl"` display scope. A CD/CDr/SACD all read "CD" here.
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
 *
 * Mirrored deliberately in convex/discogs.ts if the server ever needs it — as
 * of the all-formats change nothing server-side classifies, so only this copy
 * exists. Keep them in sync if a mirror is added.
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

// ─── Condition grade constants ───

/** Condition grades in order from best to worst */
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
