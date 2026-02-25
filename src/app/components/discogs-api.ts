/**
 * Discogs API service — fetches collection, folders, and want list.
 * All calls are browser-side fetch with personal access token auth.
 *
 * Note: We do NOT set a custom User-Agent header because browsers treat it
 * as a "forbidden" header — setting it triggers a CORS preflight that Discogs
 * may reject. The browser's built-in User-Agent satisfies the API requirement.
 */

import type { Album, WantItem } from "./mock-data";

const BASE = "https://api.discogs.com";

function headers(token: string): HeadersInit {
  return {
    Authorization: `Discogs token=${token}`,
  };
}

/**
 * Wrapper around fetch that converts browser-level network errors
 * (CORS preflight rejections, offline, sandbox restrictions) into
 * clean Error objects with descriptive messages instead of raw TypeErrors.
 */
async function discogsFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    // TypeError: "NetworkError when attempting to fetch resource" (Firefox)
    // TypeError: "Failed to fetch" (Chrome)
    // These indicate the request never reached the server.
    throw new Error(
      `Network request to Discogs failed. This usually means the browser blocked the request (CORS, ad-blocker, or sandbox restrictions). URL: ${url}`
    );
  }
}

/* ─── Identity ─── */

export async function fetchIdentity(token: string): Promise<string> {
  const url = `${BASE}/oauth/identity`;
  console.log("[Discogs] Fetching identity...", url);
  const res = await discogsFetch(url, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[Discogs] Auth failed:", res.status, body);
    throw new Error(`Discogs auth failed (${res.status}): ${body || "Check your token"}`);
  }
  const data = await res.json();
  console.log("[Discogs] Identity:", data.username);
  return data.username as string;
}

/* ─── User Profile (check if user exists / is public) ─── */

export async function fetchUserProfile(
  username: string,
  token: string
): Promise<{ username: string; avatar: string }> {
  const url = `${BASE}/users/${encodeURIComponent(username)}`;
  try {
    const res = await discogsFetch(url, { headers: headers(token) });
    if (res.status === 404) {
      throw new Error(`User "${username}" not found on Discogs.`);
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch user profile (${res.status})`);
    }
    const data = await res.json();
    return {
      username: data.username as string,
      avatar: (data.avatar_url as string) || "",
    };
  } catch (err) {
    // Re-throw HTTP-level errors (404, etc.) — callers need those
    if (err instanceof Error && !err.message.includes("Network request to Discogs failed")) {
      throw err;
    }
    // Network-level failure — return fallback silently (avatar is non-critical)
    console.warn("[Discogs] Profile fetch skipped (network unavailable)");
    return { username, avatar: "" };
  }
}

/* ─── Custom Fields ─── */

export interface DiscogsCustomField {
  id: number;
  name: string;
  type: string; // "dropdown", "textarea", "text"
  options?: string[];
  public: boolean;
}

/**
 * Fetch the user's custom field definitions.
 * Discogs default fields are typically:
 *   field 1 = "Media Condition" (dropdown)
 *   field 2 = "Sleeve Condition" (dropdown)
 *   field 3 = "Notes" (textarea)
 * But IDs vary per user when they add/reorder custom fields.
 */
export async function fetchCustomFields(
  username: string,
  token: string
): Promise<DiscogsCustomField[]> {
  const res = await discogsFetch(
    `${BASE}/users/${username}/collection/fields`,
    { headers: headers(token) }
  );
  if (!res.ok) {
    console.warn(`[Discogs] Failed to fetch custom fields (${res.status})`);
    return [];
  }
  const data = await res.json();
  return (data.fields || []) as DiscogsCustomField[];
}

/**
 * Build a lookup map from field definitions to identify which field_id
 * corresponds to Media Condition, Sleeve Condition, Notes, and Price Paid.
 */
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

/* ─── Collection ─── */

interface DiscogsRelease {
  id: number;
  instance_id: number;
  folder_id: number;
  rating: number;
  basic_information: {
    id: number;
    title: string;
    year: number;
    artists: { name: string; anv: string }[];
    labels: { name: string; catno: string }[];
    formats: { name: string; qty: string; descriptions?: string[] }[];
    cover_image: string;
    thumb: string;
  };
  notes?: { field_id: number; value: string }[];
  date_added: string;
}

interface CollectionPage {
  pagination: { pages: number; page: number; items: number };
  releases: DiscogsRelease[];
}

/**
 * Map folder_id → folder name. Folder 0 = "Uncategorized", 1 = "All" in Discogs.
 * User-created folders start at id 2+.
 */
function folderName(
  folderId: number,
  folderMap: Map<number, string>
): string {
  return folderMap.get(folderId) || "Uncategorized";
}

async function fetchFolderMap(
  username: string,
  token: string
): Promise<Map<number, string>> {
  const res = await discogsFetch(`${BASE}/users/${username}/collection/folders`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch folders (${res.status})`);
  const data = await res.json();
  const map = new Map<number, string>();
  for (const f of data.folders || []) {
    map.set(f.id, f.name);
  }
  return map;
}

function formatArtistName(name: string): string {
  // Discogs appends " (N)" for disambiguation — strip it
  return name.replace(/\s*\(\d+\)\s*$/, "");
}

function mapRelease(
  r: DiscogsRelease,
  folderMap: Map<number, string>,
  fieldMap: FieldMap
): Album {
  const bi = r.basic_information;
  const artist = bi.artists
    .map((a) => formatArtistName(a.anv || a.name))
    .join(", ");
  const label = bi.labels?.[0]?.name || "Unknown";
  const catno = bi.labels?.[0]?.catno || "";
  const formatParts: string[] = [];
  for (const fmt of bi.formats || []) {
    formatParts.push(
      [fmt.name, ...(fmt.descriptions || [])].filter(Boolean).join(", ")
    );
  }

  // Parse Discogs custom fields using the field map.
  // Known fields (Media Condition, Sleeve Condition, Notes, Price Paid) go to
  // dedicated properties. All other user-defined custom fields (e.g. "Acquired
  // From", "Last Cleaned") are collected into the customFields array.
  const noteValues: string[] = [];
  const mediaCondition: string[] = [];
  const sleeveCondition: string[] = [];
  const pricePaid: string[] = [];
  const customFields: { name: string; value: string }[] = [];

  for (const n of r.notes || []) {
    if (!n.value) continue; // skip empty values
    if (fieldMap.mediaConditionId != null && n.field_id === fieldMap.mediaConditionId) {
      mediaCondition.push(n.value);
    } else if (fieldMap.sleeveConditionId != null && n.field_id === fieldMap.sleeveConditionId) {
      sleeveCondition.push(n.value);
    } else if (fieldMap.notesId != null && n.field_id === fieldMap.notesId) {
      noteValues.push(n.value);
    } else if (fieldMap.pricePaidId != null && n.field_id === fieldMap.pricePaidId) {
      pricePaid.push(n.value);
    } else {
      // Check if this is a recognized custom field
      const customName = fieldMap.otherFields.get(n.field_id);
      if (customName) {
        customFields.push({ name: customName, value: n.value });
      } else {
        // Truly unknown field — append to notes as fallback
        noteValues.push(n.value);
      }
    }
  }

  return {
    id: String(bi.id),
    release_id: bi.id,
    title: bi.title,
    artist,
    year: bi.year || 0,
    cover: bi.cover_image || bi.thumb || "",
    folder: folderName(r.folder_id, folderMap),
    label,
    catalogNumber: catno,
    format: formatParts.join("; ") || "Vinyl",
    mediaCondition: mediaCondition.join(" · "),
    sleeveCondition: sleeveCondition.join(" · "),
    pricePaid: pricePaid.join(" · "),
    notes: noteValues.join(" · "),
    customFields: customFields.length > 0 ? customFields : undefined,
    dateAdded: r.date_added ? r.date_added.split("T")[0] : "",
    discogsUrl: `https://www.discogs.com/release/${bi.id}`,
    purgeTag: null,
  };
}

export async function fetchCollection(
  username: string,
  token: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ albums: Album[]; folders: string[] }> {
  const folderMap = await fetchFolderMap(username, token);
  const fields = await fetchCustomFields(username, token);
  const fieldMap = buildFieldMap(fields);

  const albums: Album[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await discogsFetch(
      `${BASE}/users/${username}/collection/folders/0/releases?per_page=100&page=${page}&sort=artist&sort_order=asc`,
      { headers: headers(token) }
    );
    if (!res.ok) throw new Error(`Failed to fetch collection page ${page} (${res.status})`);
    const data: CollectionPage = await res.json();
    totalPages = data.pagination.pages;

    for (const r of data.releases) {
      albums.push(mapRelease(r, folderMap, fieldMap));
    }

    onProgress?.(albums.length, data.pagination.items);
    page++;
  }

  // Dedupe by release_id (same release can appear in multiple folders)
  const seen = new Set<number>();
  const deduped: Album[] = [];
  for (const a of albums) {
    if (!seen.has(a.release_id)) {
      seen.add(a.release_id);
      deduped.push(a);
    }
  }

  const folderNames = ["All", ...Array.from(folderMap.values()).filter((n) => n !== "All")];

  return { albums: deduped, folders: folderNames };
}

/* ─── Want List ─── */

interface DiscogsWant {
  id: number;
  basic_information: {
    id: number;
    title: string;
    year: number;
    artists: { name: string; anv: string }[];
    labels: { name: string; catno: string }[];
    cover_image: string;
    thumb: string;
  };
  date_added: string;
}

interface WantPage {
  pagination: { pages: number; page: number; items: number };
  wants: DiscogsWant[];
}

export async function fetchWantlist(
  username: string,
  token: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<WantItem[]> {
  const wants: WantItem[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await discogsFetch(
      `${BASE}/users/${username}/wants?per_page=100&page=${page}`,
      { headers: headers(token) }
    );
    if (!res.ok) throw new Error(`Failed to fetch want list page ${page} (${res.status})`);
    const data: WantPage = await res.json();
    totalPages = data.pagination.pages;

    for (const w of data.wants) {
      const bi = w.basic_information;
      const artist = bi.artists
        .map((a) => formatArtistName(a.anv || a.name))
        .join(", ");
      wants.push({
        id: `w-${bi.id}`,
        release_id: bi.id,
        title: bi.title,
        artist,
        year: bi.year || 0,
        cover: bi.cover_image || bi.thumb || "",
        label: bi.labels?.[0]?.name || "Unknown",
        priority: false,
      });
    }

    onProgress?.(wants.length, data.pagination.items);
    page++;
  }

  return wants;
}

/* ─── Market Value / Pricing ─── */

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

// In-memory cache keyed by release_id, hydrated from localStorage on startup
const marketCache = new Map<number, MarketData>();

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

export function getCachedMarketData(releaseId: number): MarketData | null {
  return marketCache.get(releaseId) || null;
}

/** LocalStorage key for persisting per-album market data */
const MARKET_CACHE_LS_KEY = "hg-market-cache";

/** 30-day cache TTL for per-album market data */
const MARKET_CACHE_TTL = 30 * 24 * 3600000; // 30 days in ms

/** Hydrate the in-memory cache from localStorage (runs once at module load) */
function hydrateMarketCache(): void {
  try {
    const raw = localStorage.getItem(MARKET_CACHE_LS_KEY);
    if (!raw) return;
    const parsed: Record<string, MarketData> = JSON.parse(raw);
    const now = Date.now();
    for (const [key, data] of Object.entries(parsed)) {
      // Only restore entries that are still within the 30-day TTL
      if (now - data.fetchedAt < MARKET_CACHE_TTL) {
        marketCache.set(Number(key), data);
      }
    }
    console.log(`[MarketCache] Hydrated ${marketCache.size} entries from localStorage`);
  } catch (e) {
    console.warn("[MarketCache] Failed to hydrate from localStorage:", e);
  }
}

/** Persist the full in-memory cache to localStorage */
function persistMarketCache(): void {
  try {
    const obj: Record<string, MarketData> = {};
    for (const [key, data] of marketCache) {
      obj[String(key)] = data;
    }
    localStorage.setItem(MARKET_CACHE_LS_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn("[MarketCache] Failed to persist to localStorage:", e);
  }
}

// Hydrate on module load
hydrateMarketCache();

export async function fetchMarketData(
  releaseId: number,
  token: string,
  forceRefresh = false
): Promise<MarketData> {
  // Return cached if fresh (< 30 days) and not forcing refresh
  const cached = marketCache.get(releaseId);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;

  const prices: ConditionPrice[] = [];
  let stats: MarketplaceStats = { lowestPrice: null, numForSale: 0, currency: "USD" };

  // ── QA PLACEHOLDER: hardcoded price suggestions ──
  // TODO: Replace with live API calls when wired to production
  // Original endpoints:
  //   GET ${BASE}/marketplace/price_suggestions/${releaseId}
  //   GET ${BASE}/marketplace/stats/${releaseId}
  try {
    const QA_PRICES: Record<string, number> = {
      "Mint (M)": 45.00,
      "Near Mint (NM or M-)": 28.00,
      "Very Good Plus (VG+)": 18.00,
      "Very Good (VG)": 10.00,
      "Good Plus (G+)": 5.00,
      "Good (G)": 3.00,
      "Fair (F)": 1.50,
      "Poor (P)": 0.75,
    };
    for (const grade of CONDITION_GRADES) {
      if (QA_PRICES[grade] != null) {
        prices.push({
          condition: grade,
          value: QA_PRICES[grade],
          currency: "USD",
        });
      }
    }
  } catch (e) {
    console.warn("[Discogs] Price suggestions failed:", e);
  }

  // ── QA PLACEHOLDER: hardcoded marketplace stats ──
  try {
    stats = {
      lowestPrice: 8.50,
      numForSale: 12,
      currency: "USD",
    };
  } catch (e) {
    console.warn("[Discogs] Marketplace stats failed:", e);
  }

  const result: MarketData = { prices, stats, fetchedAt: Date.now() };
  marketCache.set(releaseId, result);
  persistMarketCache();
  return result;
}

/* ─── Collection Value (API endpoint) ─── */

// Cached collection value — starts null until data is loaded (via sync or placeholder import)
let _collectionValue: CollectionValue | null = null;

export function getCachedCollectionValue(): CollectionValue | null {
  return _collectionValue;
}

/**
 * Fetch collection value from Discogs API.
 * GET /users/{username}/collection/value
 * Returns minimum, median, maximum as float-strings. Parse as floats, never integers.
 */
export async function fetchCollectionValue(
  username: string,
  token: string
): Promise<CollectionValue> {
  // ── QA PLACEHOLDER: hardcoded collection value ──
  // TODO: Replace with live API call when wired to production
  // Original endpoint: GET ${BASE}/users/${username}/collection/value
  try {
    const value: CollectionValue = {
      minimum: 4762.24,
      median: 9391.31,
      maximum: 21583.88,
      currency: "USD",
      fetchedAt: Date.now(),
    };

    _collectionValue = value;
    return value;
  } catch (err: any) {
    console.warn(`[Discogs] Collection value failed:`, err);
    throw new Error(`Failed to fetch collection value: ${err?.message || "Unknown error"}`);
  }
}

/** Clear the cached collection value entirely (returns getCachedCollectionValue → null) */
export function clearCollectionValue(): void {
  _collectionValue = null;
}

/** Demo-mode collection value — used when loading placeholder data */
const DEMO_COLLECTION_VALUE: CollectionValue = {
  minimum: 312.50,
  median: 587.00,
  maximum: 1243.75,
  currency: "USD",
  fetchedAt: Date.now(),
};

/** Reset to demo-mode collection value (placeholder import) */
export function setDemoCollectionValue(): void {
  _collectionValue = { ...DEMO_COLLECTION_VALUE };
}

/** Clear all per-album market data from in-memory cache and localStorage */
export function clearAllMarketData(): void {
  marketCache.clear();
  try {
    localStorage.removeItem(MARKET_CACHE_LS_KEY);
  } catch (e) {
    console.warn("[MarketCache] Failed to clear localStorage:", e);
  }
}