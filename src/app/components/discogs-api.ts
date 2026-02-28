/**
 * Discogs API service — fetches collection, folders, and want list.
 * All calls are browser-side fetch with personal access token auth.
 *
 * Note: We do NOT set a custom User-Agent header because browsers treat it
 * as a "forbidden" header — setting it triggers a CORS preflight that Discogs
 * may reject. The browser's built-in User-Agent satisfies the API requirement.
 */

const BASE = "https://api.discogs.com";

// ─── Domain types ───

export type PurgeTag = "keep" | "cut" | "maybe" | null;

export interface Album {
  id: string;
  release_id: number;
  instance_id: number;
  title: string;
  artist: string;
  year: number;
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
  /** Marketplace listings count — populated by background prefetch, undefined until fetched */
  numForSale?: number;
  /** Lowest listing price in USD — undefined when no copies listed or not yet fetched */
  lowestPrice?: number;
}

export interface WantItem {
  id: string;
  release_id: number;
  title: string;
  artist: string;
  year: number;
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

export interface Friend {
  id: string;
  username: string;
  avatar: string;
  isPrivate: boolean;
  collection: Album[];
  wants: WantItem[];
  folders: string[];
  lastSynced: string;
}

/**
 * Auth can be a personal access token (string) or OAuth credentials.
 * All fetch functions in this module accept either form.
 */
export type DiscogsAuth =
  | string
  | { accessToken: string; tokenSecret: string };

function headers(auth: DiscogsAuth): HeadersInit {
  if (typeof auth === "string") {
    return { Authorization: `Discogs token=${auth}` };
  }
  // OAuth 1.0a PLAINTEXT — browser-side (no User-Agent header)
  const ck = import.meta.env.VITE_DISCOGS_CONSUMER_KEY;
  const cs = import.meta.env.VITE_DISCOGS_CONSUMER_SECRET;
  if (!ck || !cs) {
    throw new Error("Missing VITE_DISCOGS_CONSUMER_KEY or VITE_DISCOGS_CONSUMER_SECRET env vars");
  }
  const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = encodeURIComponent(`${cs}&${auth.tokenSecret}`);
  return {
    Authorization: `OAuth oauth_consumer_key="${ck}", oauth_nonce="${nonce}", oauth_token="${auth.accessToken}", oauth_signature="${sig}", oauth_signature_method="PLAINTEXT", oauth_timestamp="${timestamp}"`,
  };
}

/**
 * Pause between paginated requests to stay under the 60 req/min rate limit.
 *
 * Rate limit math (250ms inter-page delay):
 *   Collection sync  — ~5 pages (430 albums ÷ 100/page) + 2 setup requests = ~7 requests
 *   Wantlist sync    — typically 1–2 pages = ~2 requests
 *   Both run in parallel, so worst-case total ≈ 7 requests in ~1.25s of elapsed time.
 *   That is well under the 60 requests/minute ceiling (= 1 req/sec sustained).
 *   Even at 100 pages, 100 × 250ms = 25 seconds → 100 requests = 4 req/s, still under limit.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function fetchIdentity(auth: DiscogsAuth): Promise<string> {
  const url = `${BASE}/oauth/identity`;
  console.log("[Discogs] Fetching identity...", url);
  const res = await discogsFetch(url, { headers: headers(auth) });
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
  auth: DiscogsAuth
): Promise<{ username: string; avatar: string }> {
  const url = `${BASE}/users/${encodeURIComponent(username)}`;
  try {
    const res = await discogsFetch(url, { headers: headers(auth) });
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
  auth: DiscogsAuth
): Promise<DiscogsCustomField[]> {
  const res = await discogsFetch(
    `${BASE}/users/${username}/collection/fields`,
    { headers: headers(auth) }
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
  auth: DiscogsAuth
): Promise<Map<number, string>> {
  const res = await discogsFetch(`${BASE}/users/${username}/collection/folders`, {
    headers: headers(auth),
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
  fieldMap: FieldMap,
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
    instance_id: r.instance_id,
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
  auth: DiscogsAuth,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ albums: Album[]; folders: string[] }> {
  const folderMap = await fetchFolderMap(username, auth);
  const fields = await fetchCustomFields(username, auth);
  const fieldMap = buildFieldMap(fields);

  const albums: Album[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    if (page > 1) await sleep(250); // 250ms between pages — well within 60 req/min limit (see sleep() comment)
    const res = await discogsFetch(
      `${BASE}/users/${username}/collection/folders/0/releases?per_page=100&page=${page}&sort=artist&sort_order=asc`,
      { headers: headers(auth) }
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
  auth: DiscogsAuth,
  onProgress?: (loaded: number, total: number) => void
): Promise<WantItem[]> {
  const wants: WantItem[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    if (page > 1) await sleep(250); // 250ms between pages — well within 60 req/min limit (see sleep() comment)
    const res = await discogsFetch(
      `${BASE}/users/${username}/wants?per_page=100&page=${page}`,
      { headers: headers(auth) }
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

// In-memory cache keyed by release_id
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

/**
 * Fetch only marketplace stats for a release — skips price suggestions.
 * Used by the background market stats prefetch in app-context.tsx.
 * Callers are responsible for rate limiting (1 req/sec recommended).
 */
export async function fetchMarketStats(
  releaseId: number,
  auth: DiscogsAuth
): Promise<{ numForSale: number; lowestPrice: number | null }> {
  const res = await discogsFetch(
    `${BASE}/marketplace/stats/${releaseId}`,
    { headers: headers(auth) }
  );
  if (!res.ok) throw new Error(`Marketplace stats failed (${res.status})`);
  const data = await res.json();
  return {
    numForSale: data.num_for_sale ?? 0,
    lowestPrice: data.lowest_price?.value ?? null,
  };
}

/** 30-day cache TTL for per-album market data */
const MARKET_CACHE_TTL = 30 * 24 * 3600000; // 30 days in ms

export async function fetchMarketData(
  releaseId: number,
  auth: DiscogsAuth,
  forceRefresh = false
): Promise<MarketData> {
  // Return cached if fresh (< 30 days) and not forcing refresh
  const cached = marketCache.get(releaseId);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < MARKET_CACHE_TTL) return cached;

  const prices: ConditionPrice[] = [];
  let stats: MarketplaceStats = { lowestPrice: null, numForSale: 0, currency: "USD" };

  // Fetch price suggestions — GET /marketplace/price_suggestions/{release_id}
  // Response: { "Near Mint (NM or M-)": { currency: "USD", value: 28.0 }, ... }
  // Only condition grades with actual sales data are present in the response.
  try {
    const res = await discogsFetch(
      `${BASE}/marketplace/price_suggestions/${releaseId}`,
      { headers: headers(auth) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const grade of CONDITION_GRADES) {
        const entry = data[grade];
        if (entry && typeof entry.value === "number") {
          prices.push({
            condition: grade,
            value: entry.value,
            currency: entry.currency || "USD",
          });
        }
      }
    }
  } catch (e) {
    console.warn("[Discogs] Price suggestions failed:", e);
  }

  // Fetch marketplace stats — GET /marketplace/stats/{release_id}
  // Response: { lowest_price: { currency: "USD", value: 8.50 } | null, num_for_sale: 12 }
  // lowest_price is null when no copies are currently listed.
  try {
    const res = await discogsFetch(
      `${BASE}/marketplace/stats/${releaseId}`,
      { headers: headers(auth) }
    );
    if (res.ok) {
      const data = await res.json();
      stats = {
        lowestPrice: data.lowest_price?.value ?? null,
        numForSale: data.num_for_sale ?? 0,
        currency: data.lowest_price?.currency ?? "USD",
      };
    }
  } catch (e) {
    console.warn("[Discogs] Marketplace stats failed:", e);
  }

  const result: MarketData = { prices, stats, fetchedAt: Date.now() };
  marketCache.set(releaseId, result);
  return result;
}

/* ─── Collection Value (API endpoint) ─── */

// Cached collection value — starts null until data is loaded (via sync or placeholder import)
let _collectionValue: CollectionValue | null = null;

export function getCachedCollectionValue(): CollectionValue | null {
  return _collectionValue;
}

/**
 * The Discogs collection/value API returns values with a leading currency symbol,
 * e.g. "$250.00". Strip everything except digits, decimal point, and minus sign
 * before passing to parseFloat.
 */
function parseCurrencyString(raw: unknown): number {
  const cleaned = String(raw ?? "").replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned);
}

/**
 * Fetch collection value from Discogs API.
 * GET /users/{username}/collection/value
 * Returns minimum, median, maximum as currency strings e.g. "$250.00".
 *
 * Throws if the expected numeric fields are missing or unparseable — callers treat that
 * as "unavailable" rather than silently displaying $0.
 */
export async function fetchCollectionValue(
  username: string,
  auth: DiscogsAuth
): Promise<CollectionValue> {
  const res = await discogsFetch(
    `${BASE}/users/${encodeURIComponent(username)}/collection/value`,
    { headers: headers(auth) }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch collection value (${res.status})${body ? ": " + body : ""}`);
  }

  const data = await res.json();

  const minimum = parseCurrencyString(data.minimum);
  const median = parseCurrencyString(data.median);
  const maximum = parseCurrencyString(data.maximum);

  // Guard against a missing or non-numeric response (e.g. wrong shape, unexpected API change).
  // isFinite returns false for NaN and Infinity, but true for 0 — so a genuine $0 collection
  // value still displays correctly, while a missing field throws rather than silently showing $0.
  if (!isFinite(minimum) || !isFinite(median) || !isFinite(maximum)) {
    throw new Error(
      `Collection value fields are not finite numbers — response may have changed shape. ` +
      `minimum=${JSON.stringify(data.minimum)} median=${JSON.stringify(data.median)} maximum=${JSON.stringify(data.maximum)}`
    );
  }

  const value: CollectionValue = {
    minimum,
    median,
    maximum,
    currency: (data.currency as string) || "USD",
    fetchedAt: Date.now(),
  };
  _collectionValue = value;
  return value;
}

/** Clear the cached collection value entirely (returns getCachedCollectionValue → null) */
export function clearCollectionValue(): void {
  _collectionValue = null;
}

/** Clear all per-album market data from the in-memory cache */
export function clearAllMarketData(): void {
  marketCache.clear();
}