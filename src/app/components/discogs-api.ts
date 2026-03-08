/**
 * Discogs API types, constants, and client-side caches.
 *
 * All authenticated Discogs HTTP calls are now routed through server-side
 * Convex actions in `convex/discogs.ts`. This module retains only:
 *   - Domain types (Album, WantItem, Session, etc.)
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
  pricePaid: string;
  notes: string;
  /** Arbitrary user-defined Discogs custom fields (e.g. "Acquired From", "Last Cleaned") */
  customFields?: { name: string; value: string }[];
  dateAdded: string;
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
  priority: boolean;
}

export interface Session {
  id: string;
  name: string;
  albumIds: string[];
  createdAt: string;
  lastModified: string;
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

export interface ConditionPrice {
  condition: string;
  value: number;
  currency: string;
}

export interface MarketplaceStats {
  lowestPrice: number | null;
  numForSale: number;
  currency: string;
}

export interface MarketData {
  prices: ConditionPrice[];
  stats: MarketplaceStats;
  fetchedAt: number;
}

// ─── Vinyl-only filter ───

/** Returns true if the release format string indicates vinyl */
export function isVinylFormat(format: string): boolean {
  return format.toLowerCase().includes("vinyl");
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

/**
 * Normalize a user's mediaCondition string to match the Discogs API condition keys.
 * e.g. "Near Mint (NM)" → "Near Mint (NM or M-)"
 *      "VG+" → "Very Good Plus (VG+)"
 */
export function normalizeCondition(raw: string): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  for (const grade of CONDITION_GRADES) {
    if (grade.toLowerCase() === lower) return grade;
    const shortMatch = CONDITION_SHORT[grade];
    if (shortMatch && lower === shortMatch.toLowerCase()) return grade;
    // Partial match: "near mint (nm)" should match "Near Mint (NM or M-)"
    if (grade.toLowerCase().startsWith(lower.split("(")[0].trim().toLowerCase())) {
      // Additional check for parenthetical
      const rawAbbrev = (raw.match(/\(([^)]+)\)/) || [])[1]?.toLowerCase();
      const gradeAbbrev = (grade.match(/\(([^)]+)\)/) || [])[1]?.toLowerCase();
      if (!rawAbbrev || (gradeAbbrev && gradeAbbrev.includes(rawAbbrev))) {
        return grade;
      }
    }
  }
  return null;
}

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
  pricePaidId: number | null;
  /** All other custom fields: field_id → field name */
  otherFields: Map<number, string>;
}

export function buildFieldMap(fields: DiscogsCustomField[]): FieldMap {
  const result: FieldMap = {
    mediaConditionId: null,
    sleeveConditionId: null,
    notesId: null,
    pricePaidId: null,
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
    } else if (
      lower === "price paid" ||
      lower === "price" ||
      lower === "cost" ||
      lower === "purchase price" ||
      lower.includes("price paid")
    ) {
      result.pricePaidId = f.id;
    } else {
      result.otherFields.set(f.id, f.name);
    }
  }

  return result;
}

// ─── In-memory caches ───

// Market data cache keyed by release_id
const marketCache = new Map<number, MarketData>();

export function getCachedMarketData(releaseId: number): MarketData | null {
  return marketCache.get(releaseId) || null;
}

/** Clear all per-album market data from the in-memory cache */
export function clearAllMarketData(): void {
  marketCache.clear();
}

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
