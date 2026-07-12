"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import crypto from "crypto";
import { MARKET_STALE_MS, MARKET_BATCH_SIZE, MARKET_CURRENCY } from "./marketValue";

// ─── Config ───

const BASE = "https://api.discogs.com";
const USER_AGENT = "HolyGrails/1.0";

function getConsumerKey(): string {
  const k = process.env.DISCOGS_CONSUMER_KEY;
  if (!k) throw new Error("DISCOGS_CONSUMER_KEY env var not set");
  return k;
}

function getConsumerSecret(): string {
  const s = process.env.DISCOGS_CONSUMER_SECRET;
  if (!s) throw new Error("DISCOGS_CONSUMER_SECRET env var not set");
  return s;
}

// ─── HMAC-SHA1 OAuth 1.0a signing ───

function buildOAuthHeader(
  method: string,
  url: string,
  accessToken: string,
  tokenSecret: string,
  extraParams?: Record<string, string>
): string {
  const consumerKey = getConsumerKey();
  const consumerSecret = getConsumerSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
    ...extraParams,
  };

  // Signature base string per OAuth 1.0a spec
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`
    )
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url.split("?")[0]), // base URL without query string
    encodeURIComponent(sortedParams),
  ].join("&");

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  params.oauth_signature = signature;

  return (
    "OAuth " +
    Object.entries(params)
      .map(([k, val]) => `${k}="${encodeURIComponent(val)}"`)
      .join(", ")
  );
}

// Retry budget for 429 rate-limit responses. The OAuth header is rebuilt on
// every attempt — signatures embed a timestamp and nonce, so a reused header
// would be rejected.
const RATE_LIMIT_MAX_RETRIES = 2;

// Adaptive throttle driven by the X-Discogs-Ratelimit-Remaining header
// (60 req/min rolling window, authenticated). Requests run at full speed
// while there's headroom and back off progressively as the budget drains —
// replacing the old fixed 1.1 s sleep between paginated requests, which made
// large syncs several times slower than necessary. Module state is shared
// across concurrent actions in the same runtime, so parallel loops (own sync
// + following feed) self-regulate against the same budget. The 429 retry
// below remains as the backstop.
let rateLimitRemaining = 60;

async function discogsFetch(
  method: string,
  url: string,
  accessToken: string,
  tokenSecret: string,
  body?: string
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    if (rateLimitRemaining <= 3) await sleep(5000);
    else if (rateLimitRemaining <= 8) await sleep(1500);
    else if (rateLimitRemaining <= 15) await sleep(400);
    const headers: Record<string, string> = {
      Authorization: buildOAuthHeader(method, url, accessToken, tokenSecret),
      "User-Agent": USER_AGENT,
    };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(url, { method, headers, body });
    const remaining = Number(res.headers.get("X-Discogs-Ratelimit-Remaining"));
    if (Number.isFinite(remaining)) rateLimitRemaining = remaining;
    if (res.status !== 429 || attempt >= RATE_LIMIT_MAX_RETRIES) return res;
    rateLimitRemaining = 0;
    const retryAfter = Number(res.headers.get("Retry-After"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 60) * 1000
        : 5000 * (attempt + 1);
    console.warn(
      `[Discogs] 429 rate limited — retrying in ${waitMs}ms (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`
    );
    await sleep(waitMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Data transformation (ported from discogs-api.ts) ───

interface DiscogsRelease {
  id: number;
  instance_id: number;
  folder_id: number;
  rating: number;
  basic_information: {
    id: number;
    master_id?: number;
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

interface DiscogsWant {
  id: number;
  basic_information: {
    id: number;
    master_id?: number;
    title: string;
    year: number;
    artists: { name: string; anv: string }[];
    labels: { name: string; catno: string }[];
    formats?: { name: string; qty: string; descriptions?: string[] }[];
    cover_image: string;
    thumb: string;
  };
  date_added: string;
}

interface WantPage {
  pagination: { pages: number; page: number; items: number };
  wants: DiscogsWant[];
}

interface DiscogsCustomField {
  id: number;
  name: string;
  type: string;
  options?: string[];
  public: boolean;
}

interface FieldMap {
  mediaConditionId: number | null;
  sleeveConditionId: number | null;
  notesId: number | null;
  otherFields: Map<number, { name: string; type: string; options?: string[] }>;
}

function formatArtistName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "");
}

function buildFieldMap(fields: DiscogsCustomField[]): FieldMap {
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

function folderName(
  folderId: number,
  folderMap: Map<number, string>
): string {
  return folderMap.get(folderId) || "Uncategorized";
}

// Album shape returned by proxy actions (matches discogs-api.ts Album minus purgeTag/discogsUrl)
interface ProxyAlbum {
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
  customFields?: { name: string; value: string; fieldId: number; type: string; options?: string[] }[];
  dateAdded: string;
  discogsUrl: string;
}

/** Flatten Discogs `formats[]` into the app's single format string: each
 *  format's name + descriptions joined by ", ", the formats themselves joined
 *  by "; ". Shared by collection and wantlist mapping. Empty → "". */
function flattenFormats(
  formats: { name: string; descriptions?: string[] }[] | undefined
): string {
  const parts: string[] = [];
  for (const fmt of formats || []) {
    parts.push([fmt.name, ...(fmt.descriptions || [])].filter(Boolean).join(", "));
  }
  return parts.join("; ");
}

function mapRelease(
  r: DiscogsRelease,
  folderMap: Map<number, string>,
  fieldMap: FieldMap
): ProxyAlbum {
  const bi = r.basic_information;
  const artist = bi.artists
    .map((a) => formatArtistName(a.anv || a.name))
    .join(", ");
  const label = bi.labels?.[0]?.name || "Unknown";
  const catno = bi.labels?.[0]?.catno || "";

  const noteValues: string[] = [];
  const mediaCondition: string[] = [];
  const sleeveCondition: string[] = [];
  const customFields: { name: string; value: string; fieldId: number; type: string; options?: string[] }[] = [];

  for (const n of r.notes || []) {
    if (!n.value) continue;
    if (
      fieldMap.mediaConditionId != null &&
      n.field_id === fieldMap.mediaConditionId
    ) {
      mediaCondition.push(n.value);
    } else if (
      fieldMap.sleeveConditionId != null &&
      n.field_id === fieldMap.sleeveConditionId
    ) {
      sleeveCondition.push(n.value);
    } else if (
      fieldMap.notesId != null &&
      n.field_id === fieldMap.notesId
    ) {
      noteValues.push(n.value);
    } else {
      const customField = fieldMap.otherFields.get(n.field_id);
      if (customField) {
        customFields.push({
          name: customField.name,
          value: n.value,
          fieldId: n.field_id,
          type: customField.type,
          ...(customField.options && { options: customField.options }),
        });
      } else {
        noteValues.push(n.value);
      }
    }
  }

  // Include all defined custom fields (even unset ones) so they're available in edit mode
  const setFieldIds = new Set(customFields.map(cf => cf.fieldId));
  for (const [fieldId, fieldInfo] of fieldMap.otherFields) {
    if (!setFieldIds.has(fieldId)) {
      customFields.push({
        name: fieldInfo.name,
        value: "",
        fieldId,
        type: fieldInfo.type,
        ...(fieldInfo.options && { options: fieldInfo.options }),
      });
    }
  }

  return {
    id: String(bi.id),
    release_id: bi.id,
    master_id: bi.master_id || undefined,
    instance_id: r.instance_id,
    folder_id: r.folder_id,
    title: bi.title,
    artist,
    year: bi.year || 0,
    thumb: bi.thumb || "",
    cover: bi.cover_image || bi.thumb || "",
    folder: folderName(r.folder_id, folderMap),
    label,
    catalogNumber: catno,
    // Raw flattened Discogs format string. No "Vinyl" fallback — the old
    // fallback existed to survive the vinyl-only filter; with all formats
    // stored, an empty format must stay empty (classified "Other"), not lie.
    format: flattenFormats(bi.formats),
    mediaCondition: mediaCondition.join(" · "),
    sleeveCondition: sleeveCondition.join(" · "),
    pricePaid: "",
    notes: noteValues.join(" · "),
    customFields: customFields.length > 0 ? customFields : undefined,
    dateAdded: r.date_added ? r.date_added.split("T")[0] : "",
    discogsUrl: `https://www.discogs.com/release/${bi.id}`,
  };
}

function parseCurrencyString(raw: unknown): number {
  const cleaned = String(raw ?? "").replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned);
}

// ─── Shared fetch helpers ───

interface FolderInfo {
  id: number;
  name: string;
  count: number;
}

async function fetchFolderMapInternal(
  username: string,
  accessToken: string,
  tokenSecret: string
): Promise<{ map: Map<number, string>; list: FolderInfo[] }> {
  const url = `${BASE}/users/${encodeURIComponent(username)}/collection/folders`;
  const res = await discogsFetch("GET", url, accessToken, tokenSecret);
  if (!res.ok)
    throw new Error(`Failed to fetch folders (${res.status})`);
  const data = await res.json();
  const map = new Map<number, string>();
  const list: FolderInfo[] = [];
  for (const f of data.folders || []) {
    map.set(f.id, f.name);
    list.push({ id: f.id, name: f.name, count: f.count || 0 });
  }
  return { map, list };
}

async function fetchCustomFieldsInternal(
  username: string,
  accessToken: string,
  tokenSecret: string
): Promise<DiscogsCustomField[]> {
  const url = `${BASE}/users/${encodeURIComponent(username)}/collection/fields`;
  const res = await discogsFetch("GET", url, accessToken, tokenSecret);
  if (!res.ok) {
    console.warn(`[Discogs] Failed to fetch custom fields (${res.status})`);
    return [];
  }
  const data = await res.json();
  return (data.fields || []) as DiscogsCustomField[];
}

interface Creds {
  username: string;
  access_token: string;
  token_secret: string;
}

/**
 * Fetch a user's full collection (paginated, per-folder for folder_id
 * fidelity). Used by the server-side sync loops (syncSelf, syncFollowedUser).
 * Pacing is handled by the adaptive throttle in discogsFetch.
 */
async function fetchCollectionInternal(
  creds: Creds,
  username: string,
  skipPrivateFields: boolean,
  onProgress?: (fetched: number, total: number) => Promise<void>
): Promise<{ albums: ProxyAlbum[]; folders: FolderInfo[]; forbidden: boolean }> {
  const folderResult: { map: Map<number, string>; list: FolderInfo[] } = skipPrivateFields
    ? { map: new Map<number, string>(), list: [] }
    : await fetchFolderMapInternal(
        username,
        creds.access_token,
        creds.token_secret
      );
  const folderMap: Map<number, string> = folderResult.map;
  const fields = skipPrivateFields
    ? []
    : await fetchCustomFieldsInternal(
        username,
        creds.access_token,
        creds.token_secret
      );
  const fieldMap = buildFieldMap(fields);

  const albums: ProxyAlbum[] = [];

  // Discogs does not return folder_id on releases fetched from folder 0 (All).
  // Fetch from each real folder individually so we know the folder assignment.
  // When skipPrivateFields is true (followed users), fall back to folder 0.
  const folderIds = skipPrivateFields
    ? [0]
    : Array.from(folderMap.keys()).filter((id) => id !== 0);

  // Total instances across real folders — drives sync progress reporting.
  let totalItems = folderResult.list
    .filter((f) => f.id !== 0)
    .reduce((sum, f) => sum + f.count, 0);

  // A private/forbidden own collection returns 403 on the per-folder releases
  // endpoint (folder metadata reads fine — that's why we still have the folder
  // list). Rather than aborting the whole sync, flag it and let syncSelf skip
  // the collection write (preserving any cache) while the wantlist still syncs.
  let forbidden = false;

  for (const folderId of folderIds) {
    if (forbidden) break;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url = `${BASE}/users/${encodeURIComponent(username)}/collection/folders/${folderId}/releases?per_page=100&page=${page}&sort=artist&sort_order=asc`;
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
      );
      if (!res.ok) {
        if (res.status === 403 && !skipPrivateFields) {
          console.warn(
            `[Discogs] Collection folder ${folderId} returned 403 for @${username} — collection is private/forbidden; skipping collection sync`
          );
          forbidden = true;
          break;
        }
        throw new Error(
          `Failed to fetch collection folder ${folderId} page ${page} (${res.status})`
        );
      }
      const data: CollectionPage = await res.json();
      totalPages = data.pagination.pages;
      if (skipPrivateFields && page === 1) totalItems = data.pagination.items;

      for (const r of data.releases) {
        // Inject folder_id from the folder we're fetching — Discogs omits it
        r.folder_id = folderId;
        albums.push(mapRelease(r, folderMap, fieldMap));
      }
      if (onProgress) await onProgress(albums.length, totalItems);
      page++;
    }
  }

  // Dedupe by release_id
  const seen = new Set<number>();
  const deduped: ProxyAlbum[] = [];
  for (const a of albums) {
    if (!seen.has(a.release_id)) {
      seen.add(a.release_id);
      deduped.push(a);
    }
  }

  // Build rich folder list for client — "All" is a virtual folder (id 0)
  const folderObjects: FolderInfo[] = folderResult.list.length > 0
    ? folderResult.list
    : [{ id: 0, name: "All", count: deduped.length }];

  return { albums: deduped, folders: folderObjects, forbidden };
}

interface ProxyWant {
  id: string;
  release_id: number;
  master_id?: number;
  title: string;
  artist: string;
  year: number;
  thumb: string;
  cover: string;
  label: string;
  format: string;
  priority: boolean;
}

/**
 * Fetch a user's full wantlist (paginated). Shared by proxyFetchWantlist and
 * the server-side sync loop.
 */
async function fetchWantlistInternal(
  creds: Creds,
  username: string,
  onProgress?: (fetched: number, total: number) => Promise<void>
): Promise<ProxyWant[]> {
  const wants: ProxyWant[] = [];
  let page = 1;
  let totalPages = 1;
  let totalItems = 0;

  while (page <= totalPages) {
    const url = `${BASE}/users/${encodeURIComponent(username)}/wants?per_page=100&page=${page}`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok)
      throw new Error(
        `Failed to fetch wantlist page ${page} (${res.status})`
      );
    const data: WantPage = await res.json();
    totalPages = data.pagination.pages;
    if (page === 1) totalItems = data.pagination.items;

    for (const w of data.wants) {
      const bi = w.basic_information;
      const artist = bi.artists
        .map((a) => formatArtistName(a.anv || a.name))
        .join(", ");
      wants.push({
        id: `w-${bi.id}`,
        release_id: bi.id,
        master_id: bi.master_id || undefined,
        title: bi.title,
        artist,
        year: bi.year || 0,
        thumb: bi.thumb || "",
        cover: bi.cover_image || bi.thumb || "",
        label: bi.labels?.[0]?.name || "Unknown",
        format: flattenFormats(bi.formats),
        priority: false,
      });
    }
    if (onProgress) await onProgress(wants.length, totalItems);
    page++;
  }

  return wants;
}

/**
 * Fetch a user's profile, including the raw num_collection / num_wantlist
 * instance counts used by the change-detection probe.
 */
async function fetchProfileInternal(creds: Creds, username: string) {
  const url = `${BASE}/users/${encodeURIComponent(username)}`;
  const res = await discogsFetch(
    "GET",
    url,
    creds.access_token,
    creds.token_secret
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile (${res.status})`);
  }
  const data = await res.json();
  return {
    username: data.username as string,
    avatar: (data.avatar_url as string) || "",
    profile: (data.profile as string) || "",
    location: (data.location as string) || "",
    registered: (data.registered as string) || "",
    buyerRating: (data.buyer_rating as number) || 0,
    buyerRatingStars: (data.buyer_rating_stars as number) || 0,
    sellerRating: (data.seller_rating as number) || 0,
    sellerRatingStars: (data.seller_rating_stars as number) || 0,
    releasesContributed: (data.releases_contributed as number) || 0,
    releasesRated: (data.releases_rated as number) || 0,
    numLists: (data.num_lists as number) || 0,
    rank: (data.rank as number) || 0,
    num_collection: (data.num_collection as number) ?? 0,
    num_wantlist: (data.num_wantlist as number) ?? 0,
  };
}

/** Fetch the authenticated user's collection value. */
async function fetchCollectionValueInternal(creds: Creds): Promise<{
  minimum: number;
  median: number;
  maximum: number;
  currency: string;
  fetchedAt: number;
}> {
  const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/value`;
  const res = await discogsFetch(
    "GET",
    url,
    creds.access_token,
    creds.token_secret
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch collection value (${res.status})${body ? ": " + body : ""}`
    );
  }
  const data = await res.json();
  const minimum = parseCurrencyString(data.minimum);
  const median = parseCurrencyString(data.median);
  const maximum = parseCurrencyString(data.maximum);

  if (!isFinite(minimum) || !isFinite(median) || !isFinite(maximum)) {
    throw new Error(
      `Collection value fields are not finite numbers — response may have changed shape.`
    );
  }

  return {
    minimum,
    median,
    maximum,
    currency: (data.currency as string) || "USD",
    fetchedAt: Date.now(),
  };
}

// ─── Public actions ───

// 1. Fetch identity (username)
export const proxyFetchIdentity = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/oauth/identity`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Discogs auth failed (${res.status}): ${body || "Check your token"}`
      );
    }
    const data = await res.json();
    return { username: data.username as string };
  },
});

// 2. Fetch user profile
export const proxyFetchUserProfile = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(args.username)}`;
    try {
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
      );
      if (res.status === 404) {
        throw new Error(
          `User "${args.username}" not found on Discogs.`
        );
      }
      if (!res.ok) {
        throw new Error(
          `Failed to fetch user profile (${res.status})`
        );
      }
      const data = await res.json();
      return {
        username: data.username as string,
        avatar: (data.avatar_url as string) || "",
        profile: (data.profile as string) || "",
        location: (data.location as string) || "",
        registered: (data.registered as string) || "",
        buyerRating: (data.buyer_rating as number) || 0,
        buyerRatingStars: (data.buyer_rating_stars as number) || 0,
        sellerRating: (data.seller_rating as number) || 0,
        sellerRatingStars: (data.seller_rating_stars as number) || 0,
        releasesContributed: (data.releases_contributed as number) || 0,
        releasesRated: (data.releases_rated as number) || 0,
        numLists: (data.num_lists as number) || 0,
        rank: (data.rank as number) || 0,
      };
    } catch (err: any) {
      if (
        err instanceof Error &&
        !err.message.includes("Failed to fetch")
      ) {
        throw err;
      }
      console.warn(
        "[Discogs] Profile fetch skipped (network unavailable)"
      );
      return {
        username: args.username,
        avatar: "",
        profile: "",
        location: "",
        registered: "",
        buyerRating: 0,
        buyerRatingStars: 0,
        sellerRating: 0,
        sellerRatingStars: 0,
        releasesContributed: 0,
        releasesRated: 0,
        numLists: 0,
        rank: 0,
      };
    }
  },
});

// 2b. Lightweight change-detection probe.
// Returns the raw Discogs instance counts for the authenticated user's own
// collection and wantlist from a single profile request. The client compares
// these against the counts stored at the last sync to decide whether a real
// sync is needed — turning the common "nothing changed" case into one cheap
// request instead of a full paginated fetch. Self-operation: counts always come
// from the authenticated user, so the client-supplied username is ignored.
export const proxyFetchSyncSignals = action({
  args: { sessionToken: v.string(), username: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ num_collection: number; num_wantlist: number } | null> => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}`;
    try {
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
      );
      if (!res.ok) return null;
      const data = await res.json();
      return {
        num_collection: (data.num_collection as number) ?? 0,
        num_wantlist: (data.num_wantlist as number) ?? 0,
      };
    } catch (err) {
      // Network failure or rate limit — treat as "unknown", caller will sync.
      console.warn("[Discogs] Sync signals probe failed:", err);
      return null;
    }
  },
});

// 4. Fetch wantlist (paginated)
export const proxyFetchWantlist = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args): Promise<ProxyWant[]> => {
    const creds: Creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    return await fetchWantlistInternal(creds, args.username);
  },
});

// 5. Fetch collection value
export const proxyFetchCollectionValue = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    minimum: number;
    median: number;
    maximum: number;
    currency: string;
    fetchedAt: number;
  }> => {
    const creds: Creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    return await fetchCollectionValueInternal(creds);
  },
});

// 6. Server-side sync loop — the whole collection/wantlist sync runs inside
// this single action. Pages are fetched with the adaptive throttle, results
// are written straight to the Convex cache (no round trip through the
// client), and per-page progress lands in the sync_status table the client
// subscribes to. The client receives the fresh data reactively through its
// existing collection/wantlist cache subscriptions.
export const syncSelf = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{
    profile: {
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
    } | null;
    folders: FolderInfo[];
    albumCount: number;
    wantCount: number;
    collDiff: { added: number; removed: number; updated: number };
    wantDiff: { added: number; removed: number; updated: number };
    crossovers: ProxyWant[];
    collectionValue: {
      minimum: number;
      median: number;
      maximum: number;
      currency: string;
      fetchedAt: number;
    } | null;
    collectionPrivate: boolean;
    wantlistPrivate: boolean;
  }> => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );

    const setStatus = async (phase: string, current?: number, total?: number) => {
      try {
        await ctx.runMutation(internal.syncStatus.set, {
          username: creds.username,
          phase,
          current,
          total,
        });
      } catch {
        // Progress is best-effort — never fail the sync over it.
      }
    };

    try {
      // Profile first: enriched data for the client plus the raw
      // num_collection / num_wantlist counts the next boot probe compares.
      await setStatus("collection");
      let profile: Awaited<ReturnType<typeof fetchProfileInternal>> | null = null;
      try {
        profile = await fetchProfileInternal(creds, creds.username);
      } catch (e) {
        console.warn("[Discogs] Profile fetch failed during sync:", e);
      }

      // Collection — paginated fetch with live progress, then a single
      // server-to-server diff write. All formats are stored (the vinyl-only
      // filter was removed with the all-formats change); scope is a
      // display-only concern applied at the client derive.
      const {
        albums,
        folders,
        forbidden: collectionPrivate,
      } = await fetchCollectionInternal(
        creds,
        creds.username,
        false,
        (fetched, total) => setStatus("collection", fetched, total)
      );

      await setStatus("caching");
      // Skip the diff write entirely when the collection is private/forbidden —
      // applyDiff with an empty array would delete any existing cached rows.
      let collDiff: { added: number; removed: number; updated: number } = {
        added: 0,
        removed: 0,
        updated: 0,
      };
      if (!collectionPrivate)
        collDiff = await ctx.runMutation(api.collection.applyDiff, {
          sessionToken: args.sessionToken,
          albums: albums.map((a) => ({
            releaseId: a.release_id,
            masterId: a.master_id || undefined,
            instanceId: a.instance_id,
            folderId: a.folder_id,
            artist: a.artist,
            title: a.title,
            year: a.year,
            thumb: a.thumb,
            cover: a.cover,
            folder: a.folder,
            label: a.label,
            catalogNumber: a.catalogNumber,
            format: a.format,
            mediaCondition: a.mediaCondition,
            sleeveCondition: a.sleeveCondition,
            pricePaid: a.pricePaid,
            notes: a.notes,
            customFields: a.customFields,
            dateAdded: a.dateAdded,
          })),
        });

      // Wantlist — same private/forbidden handling as the collection: a
      // wantlist with "Allow others to browse my wantlist" off returns 403,
      // which must not abort the sync or wipe the cached wantlist.
      await setStatus("wantlist");
      let wants: ProxyWant[] = [];
      let wantlistPrivate = false;
      try {
        wants = await fetchWantlistInternal(
          creds,
          creds.username,
          (fetched, total) => setStatus("wantlist", fetched, total)
        );
      } catch (e: any) {
        if (String(e?.message ?? "").includes("403")) {
          wantlistPrivate = true;
          console.warn(
            `[Discogs] Wantlist returned 403 for @${creds.username} — wantlist is private/forbidden; skipping wantlist sync`
          );
        } else {
          throw e;
        }
      }
      let wantDiff: { added: number; removed: number; updated: number } = {
        added: 0,
        removed: 0,
        updated: 0,
      };
      if (!wantlistPrivate)
        wantDiff = await ctx.runMutation(api.wantlist.applyDiff, {
          sessionToken: args.sessionToken,
          items: wants.map((w) => ({
            release_id: w.release_id,
            master_id: w.master_id || undefined,
            title: w.title,
            artist: w.artist,
            year: w.year,
            cover: w.cover,
            thumb: w.thumb || undefined,
            label: w.label,
            format: w.format || undefined,
            priority: w.priority,
          })),
        });

      // Wantlist items that are now in the collection — drives the
      // "Now in your collection" crossover prompt.
      const collectionRids = new Set(albums.map((a) => a.release_id));
      const crossovers = wants.filter((w) => collectionRids.has(w.release_id));

      // Collection value (non-fatal)
      await setStatus("value");
      let collectionValue: {
        minimum: number;
        median: number;
        maximum: number;
        currency: string;
        fetchedAt: number;
      } | null = null;
      try {
        collectionValue = await fetchCollectionValueInternal(creds);
        await ctx.runMutation(api.users.updateCollectionValue, {
          sessionToken: args.sessionToken,
          collection_value: JSON.stringify(collectionValue),
        });
      } catch (e) {
        console.warn("[Discogs] Collection value fetch failed during sync:", e);
      }

      // Persist sync metadata + raw counts for the next boot probe.
      await ctx.runMutation(api.users.updateLastSynced, {
        sessionToken: args.sessionToken,
        collectionCount: profile?.num_collection,
        wantlistCount: profile?.num_wantlist,
        collectionPrivate,
        wantlistPrivate,
      });

      return {
        profile: profile
          ? {
              username: profile.username,
              avatar: profile.avatar,
              profile: profile.profile,
              location: profile.location,
              registered: profile.registered,
              buyerRating: profile.buyerRating,
              buyerRatingStars: profile.buyerRatingStars,
              sellerRating: profile.sellerRating,
              sellerRatingStars: profile.sellerRatingStars,
              releasesContributed: profile.releasesContributed,
              releasesRated: profile.releasesRated,
              numLists: profile.numLists,
              rank: profile.rank,
            }
          : null,
        folders,
        albumCount: albums.length,
        wantCount: wants.length,
        collDiff,
        wantDiff,
        crossovers,
        collectionValue,
        // True when Discogs privacy ("Allow others to browse my …") blocks the
        // read — the client can surface a "this is private on Discogs" note.
        collectionPrivate,
        wantlistPrivate,
      };
    } finally {
      await setStatus("idle");
    }
  },
});

// 6b. Server-side followed-user sync — fetches a followed user's full
// collection + wantlist and persists slim rows to the followed_items cache.
// Profiles render instantly from the cache; this runs in the background when
// a profile is opened stale (24h TTL, checked client-side) or right after a
// new follow. Replaces the old client hydration loop that re-downloaded every
// followed collection each session and held it in memory only.
export const syncFollowedUser = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ albums: number; wants: number; isPrivate: boolean }> => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );

    let albums: ProxyAlbum[] = [];
    let isPrivate = false;
    try {
      const result = await fetchCollectionInternal(creds, args.username, true);
      // All formats — the vinyl-only filter was removed with the all-formats
      // change; scope is applied display-only at the viewer's client derive.
      albums = result.albums;
    } catch (e: any) {
      if (String(e?.message ?? "").includes("403")) {
        isPrivate = true;
      } else {
        throw e;
      }
    }

    let wants: ProxyWant[] = [];
    if (!isPrivate) {
      try {
        wants = await fetchWantlistInternal(creds, args.username);
      } catch {
        // Wantlist may be unavailable — collection alone is still useful
      }
    }

    // Refresh the stored avatar while we're here (previously a side effect
    // of the old client hydration loop)
    let avatarUrl: string | undefined;
    try {
      const profile = await fetchProfileInternal(creds, args.username);
      avatarUrl = profile.avatar || undefined;
    } catch {
      // Non-critical
    }

    const slim = (x: {
      release_id: number;
      master_id?: number;
      title: string;
      artist: string;
      year: number;
      thumb: string;
      cover: string;
      label: string;
      format?: string;
    } & { dateAdded?: string }) => ({
      release_id: x.release_id,
      master_id: x.master_id || undefined,
      title: x.title,
      artist: x.artist,
      year: x.year,
      thumb: x.thumb || undefined,
      cover: x.cover,
      label: x.label,
      format: x.format || undefined,
      dateAdded: x.dateAdded ?? "",
    });

    // Chunked replace keeps each mutation comfortably under Convex's
    // per-transaction write limits for large collections.
    const CHUNK = 400;
    await ctx.runMutation(internal.followed_items.clearForUser, {
      follower_username: creds.username,
      followed_username: args.username,
      kind: "collection",
    });
    for (let i = 0; i < albums.length; i += CHUNK) {
      await ctx.runMutation(internal.followed_items.appendItems, {
        follower_username: creds.username,
        followed_username: args.username,
        kind: "collection",
        items: albums.slice(i, i + CHUNK).map(slim),
      });
    }
    await ctx.runMutation(internal.followed_items.clearForUser, {
      follower_username: creds.username,
      followed_username: args.username,
      kind: "want",
    });
    for (let i = 0; i < wants.length; i += CHUNK) {
      await ctx.runMutation(internal.followed_items.appendItems, {
        follower_username: creds.username,
        followed_username: args.username,
        kind: "want",
        items: wants.slice(i, i + CHUNK).map(slim),
      });
    }

    await ctx.runMutation(internal.following.updateSyncMeta, {
      follower_username: creds.username,
      following_username: args.username,
      collection_synced_at: Date.now(),
      is_private: isPrivate,
      avatar_url: avatarUrl,
    });

    return { albums: albums.length, wants: wants.length, isPrivate };
  },
});

// 7. Update collection instance (custom fields)
export const proxyUpdateCollectionInstance = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    folderId: v.number(),
    releaseId: v.number(),
    instanceId: v.number(),
    fields: v.object({
      mediaCondition: v.optional(v.string()),
      sleeveCondition: v.optional(v.string()),
      notes: v.optional(v.string()),
    }),
    customFields: v.optional(v.array(v.object({
      fieldId: v.number(),
      value: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const fieldDefs = await fetchCustomFieldsInternal(
      creds.username,
      creds.access_token,
      creds.token_secret
    );
    const fieldMap = buildFieldMap(fieldDefs);

    const updates: { fieldId: number; value: string }[] = [];
    if (
      args.fields.mediaCondition !== undefined &&
      fieldMap.mediaConditionId != null
    ) {
      updates.push({
        fieldId: fieldMap.mediaConditionId,
        value: args.fields.mediaCondition,
      });
    }
    if (
      args.fields.sleeveCondition !== undefined &&
      fieldMap.sleeveConditionId != null
    ) {
      updates.push({
        fieldId: fieldMap.sleeveConditionId,
        value: args.fields.sleeveCondition,
      });
    }
    if (
      args.fields.notes !== undefined &&
      fieldMap.notesId != null
    ) {
      updates.push({ fieldId: fieldMap.notesId, value: args.fields.notes });
    }

    if (args.customFields) {
      for (const cf of args.customFields) {
        updates.push({ fieldId: cf.fieldId, value: cf.value });
      }
    }

    for (const update of updates) {
      const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders/${args.folderId}/releases/${args.releaseId}/instances/${args.instanceId}/fields/${update.fieldId}`;
      const res = await discogsFetch(
        "POST",
        url,
        creds.access_token,
        creds.token_secret,
        JSON.stringify({ value: update.value })
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Failed to update field ${update.fieldId} for instance ${args.instanceId} (${res.status})${body ? ": " + body : ""}`
        );
      }
    }
  },
});

// 8. Move to folder — single in-place POST preserves instance_id and date_added
export const proxyMoveToFolder = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    oldFolderId: v.number(),
    newFolderId: v.number(),
    releaseId: v.number(),
    instanceId: v.number(),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );

    // Single call: POST to the existing instance URL with new folder_id in body
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders/${args.oldFolderId}/releases/${args.releaseId}/instances/${args.instanceId}`;
    const res = await discogsFetch(
      "POST",
      url,
      creds.access_token,
      creds.token_secret,
      JSON.stringify({ folder_id: args.newFolderId })
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to move release ${args.releaseId} to folder ${args.newFolderId} (${res.status})${body ? ": " + body : ""}`
      );
    }

    return { success: true };
  },
});

// 9. Remove from collection
export const proxyRemoveFromCollection = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    folderId: v.number(),
    releaseId: v.number(),
    instanceId: v.number(),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders/${args.folderId}/releases/${args.releaseId}/instances/${args.instanceId}`;
    const res = await discogsFetch(
      "DELETE",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (res.status === 404) return;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to remove release ${args.releaseId} from collection (${res.status})${body ? ": " + body : ""}`
      );
    }
  },
});

// 10. Add to wantlist
export const proxyAddToWantlist = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    releaseId: v.number(),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/wants/${args.releaseId}`;
    const res = await discogsFetch(
      "PUT",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to add release ${args.releaseId} to wantlist (${res.status})${body ? ": " + body : ""}`
      );
    }
    const data = await res.json();
    const bi = data.basic_information;
    const artist = (bi?.artists || [])
      .map((a: { name: string; anv: string }) =>
        formatArtistName(a.anv || a.name)
      )
      .join(", ");
    return {
      id: `w-${bi?.id ?? args.releaseId}`,
      release_id: bi?.id ?? args.releaseId,
      master_id: bi?.master_id || undefined,
      title: bi?.title ?? "",
      artist,
      year: bi?.year ?? 0,
      thumb: bi?.thumb || "",
      cover: bi?.cover_image || bi?.thumb || "",
      label: bi?.labels?.[0]?.name || "Unknown",
      format: flattenFormats(bi?.formats) || undefined,
      priority: false,
    };
  },
});

// 11. Remove from wantlist
export const proxyRemoveFromWantlist = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    releaseId: v.number(),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/wants/${args.releaseId}`;
    const res = await discogsFetch(
      "DELETE",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (res.status === 404) return;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to remove release ${args.releaseId} from wantlist (${res.status})${body ? ": " + body : ""}`
      );
    }
  },
});

// 12. Fetch release detail (enriched metadata: tracklist, credits, notes, community)
export const proxyFetchRelease = action({
  args: { sessionToken: v.string(), releaseId: v.number() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/releases/${args.releaseId}`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      throw new Error(
        `Failed to fetch release ${args.releaseId} (${res.status})`
      );
    }
    const data = await res.json();

    // Tracklist
    const tracklist: { position: string; title: string; duration: string }[] = [];
    for (const t of data.tracklist || []) {
      if (t.type_ === "track") {
        tracklist.push({
          position: t.position || "",
          title: t.title || "",
          duration: t.duration || "",
        });
      }
    }

    // Credits (extraartists) — group by role
    const credits: { role: string; name: string }[] = [];
    for (const ea of data.extraartists || []) {
      const name = formatArtistName(ea.anv || ea.name || "");
      // Roles can be comma-separated (e.g. "Producer, Written-By")
      for (const role of (ea.role || "").split(/,\s*/)) {
        if (role && name) {
          credits.push({ role: role.trim(), name });
        }
      }
    }

    // Community
    const community = data.community
      ? {
          rating: data.community.rating?.average ?? null,
          ratingCount: data.community.rating?.count ?? 0,
          have: data.community.have ?? 0,
          want: data.community.want ?? 0,
        }
      : null;

    // Identifiers (barcode, matrix, etc.)
    const identifiers: { type: string; value: string }[] = [];
    for (const id of data.identifiers || []) {
      if (id.type && id.value) {
        identifiers.push({ type: id.type, value: id.value });
      }
    }

    // Images
    const images = (data.images || []).map((img: any) => ({
      uri: (img.uri as string) || "",
      uri150: (img.uri150 as string) || "",
      type: img.type === "primary" ? "primary" as const : "secondary" as const,
      width: (img.width as number) || 0,
      height: (img.height as number) || 0,
    }));

    // Unofficial releases (bootlegs) can't be sold on Discogs, so market
    // data for them is noise — price suggestions come back algorithmic with
    // no sales history behind them. Callers use this to hide the Value section.
    const isUnofficial = (data.formats || []).some(
      (f: { descriptions?: string[] }) =>
        (f.descriptions || []).some(
          (d: string) => d.toLowerCase() === "unofficial release"
        )
    );

    return {
      country: (data.country as string) || "",
      notes: (data.notes as string) || "",
      tracklist,
      credits,
      community,
      identifiers,
      genres: (data.genres as string[]) || [],
      styles: (data.styles as string[]) || [],
      images,
      // Market signal (Tier 1) — asking prices, available to all users
      lowestPrice: typeof data.lowest_price === "number" ? data.lowest_price : null,
      numForSale: typeof data.num_for_sale === "number" ? data.num_for_sale : 0,
      isUnofficial,
    };
  },
});

// 13. Fetch single collection page (for following feed)
export const proxyFetchUserCollectionPage = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const pg = args.page ?? 1;
    const pp = args.perPage ?? 50;
    const url = `${BASE}/users/${encodeURIComponent(args.username)}/collection/folders/0/releases?page=${pg}&per_page=${pp}&sort=added&sort_order=desc`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      throw new Error(
        `Failed to fetch collection page for @${args.username} (${res.status})`
      );
    }
    const data: CollectionPage = await res.json();
    return data.releases.map((r) => {
      const bi = r.basic_information;
      return {
        release_id: bi.id,
        master_id: bi.master_id || undefined,
        title: bi.title,
        artist: bi.artists
          .map((a) => formatArtistName(a.anv || a.name))
          .join(", "),
        year: bi.year || 0,
        thumb: bi.thumb || "",
        cover: bi.cover_image || bi.thumb || "",
        label: bi.labels?.[0]?.name || "Unknown",
        format: flattenFormats(bi.formats) || undefined,
        dateAdded: r.date_added || "",
      };
    });
  },
});

// 13b. Fetch a single page of a user's wantlist (for following feed cache)
export const proxyFetchUserWantlistPage = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const pg = args.page ?? 1;
    const pp = args.perPage ?? 50;
    const url = `${BASE}/users/${encodeURIComponent(args.username)}/wants?page=${pg}&per_page=${pp}&sort=added&sort_order=desc`;
    try {
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
      );
      if (res.status === 403) return [];
      if (!res.ok) {
        throw new Error(
          `Failed to fetch wantlist page for @${args.username} (${res.status})`
        );
      }
      const data: WantPage = await res.json();
      return data.wants.map((w) => {
        const bi = w.basic_information;
        return {
          release_id: bi.id,
          master_id: bi.master_id || undefined,
          title: bi.title,
          artist: bi.artists
            .map((a) => formatArtistName(a.anv || a.name))
            .join(", "),
          year: bi.year || 0,
          thumb: bi.thumb || "",
          cover: bi.cover_image || bi.thumb || "",
          label: bi.labels?.[0]?.name || "Unknown",
          format: flattenFormats(bi.formats) || undefined,
          dateAdded: w.date_added || "",
        };
      });
    } catch (e) {
      console.warn(`[Discogs] proxyFetchUserWantlistPage failed for @${args.username}:`, e);
      return [];
    }
  },
});

// 14. Fetch folders (with id, name, count)
export const proxyFetchFolders = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok)
      throw new Error(`Failed to fetch folders (${res.status})`);
    const data = await res.json();
    return (data.folders || []).map(
      (f: { id: number; name: string; count: number }) => ({
        id: f.id as number,
        name: f.name as string,
        count: (f.count as number) || 0,
      })
    );
  },
});

// 15. Create folder
export const proxyCreateFolder = action({
  args: { sessionToken: v.string(), username: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders`;
    const res = await discogsFetch(
      "POST",
      url,
      creds.access_token,
      creds.token_secret,
      JSON.stringify({ name: args.name })
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to create folder (${res.status})${body ? ": " + body : ""}`
      );
    }
    const data = await res.json();
    return {
      id: data.id as number,
      name: data.name as string,
      count: (data.count as number) || 0,
    };
  },
});

// 16. Rename folder
export const proxyRenameFolder = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    folderId: v.number(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders/${args.folderId}`;
    const res = await discogsFetch(
      "POST",
      url,
      creds.access_token,
      creds.token_secret,
      JSON.stringify({ name: args.name })
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to rename folder (${res.status})${body ? ": " + body : ""}`
      );
    }
    const data = await res.json();
    return {
      id: data.id as number,
      name: data.name as string,
      count: (data.count as number) || 0,
    };
  },
});

// 17. Delete folder
export const proxyDeleteFolder = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    folderId: v.number(),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders/${args.folderId}`;
    const res = await discogsFetch(
      "DELETE",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to delete folder (${res.status})${body ? ": " + body : ""}`
      );
    }
    return { deleted: true as const, folder_id: args.folderId };
  },
});

// 18. Update user profile (profile text, location)
export const proxyUpdateProfile = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    profile: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}`;
    const payload: Record<string, string> = {};
    if (args.profile !== undefined) payload.profile = args.profile;
    if (args.location !== undefined) payload.location = args.location;
    const res = await discogsFetch(
      "POST",
      url,
      creds.access_token,
      creds.token_secret,
      JSON.stringify(payload)
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Failed to update profile (${res.status})${text ? ": " + text : ""}`
      );
    }
    const data = await res.json();
    return {
      profile: (data.profile as string) || "",
      location: (data.location as string) || "",
    };
  },
});

// 19. Add release to collection
export const proxyAddToCollection = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    releaseId: v.number(),
    folderId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const folderId = args.folderId ?? 1; // default to Uncategorized
    const url = `${BASE}/users/${encodeURIComponent(creds.username)}/collection/folders/${folderId}/releases/${args.releaseId}`;
    const res = await discogsFetch(
      "POST",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Failed to add release ${args.releaseId} to collection (${res.status})${body ? ": " + body : ""}`
      );
    }
    const data = await res.json();
    const instanceId: number = data.instance_id;

    // Fetch release info to build a full Album-like object
    const releaseUrl = `${BASE}/releases/${args.releaseId}`;
    const releaseRes = await discogsFetch(
      "GET",
      releaseUrl,
      creds.access_token,
      creds.token_secret
    );
    if (!releaseRes.ok) {
      // Return minimal data even if release fetch fails
      return {
        instance_id: instanceId,
        release_id: args.releaseId,
        folder_id: folderId,
      };
    }
    const rd = await releaseRes.json();
    const artist = (rd.artists || [])
      .map((a: { name: string; anv: string }) =>
        formatArtistName(a.anv || a.name)
      )
      .join(", ");
    const label = rd.labels?.[0]?.name || "Unknown";
    const catno = rd.labels?.[0]?.catno || "";
    const formatParts: string[] = [];
    for (const fmt of rd.formats || []) {
      if (fmt.name) formatParts.push(fmt.name);
      for (const desc of fmt.descriptions || []) formatParts.push(desc);
    }

    // Include the user's custom field definitions (empty values) so the fresh
    // add matches what a full sync produces — without this, custom fields
    // don't appear on the album (or in edit mode) until the next sync.
    const fieldDefs = await fetchCustomFieldsInternal(
      creds.username,
      creds.access_token,
      creds.token_secret
    );
    const fieldMap = buildFieldMap(fieldDefs);
    const customFields: { name: string; value: string; fieldId: number; type: string; options?: string[] }[] = [];
    for (const [fieldId, fieldInfo] of fieldMap.otherFields) {
      customFields.push({
        name: fieldInfo.name,
        value: "",
        fieldId,
        type: fieldInfo.type,
        ...(fieldInfo.options && { options: fieldInfo.options }),
      });
    }

    return {
      customFields: customFields.length > 0 ? customFields : undefined,
      instance_id: instanceId,
      release_id: args.releaseId,
      master_id: rd.master_id || undefined,
      folder_id: folderId,
      title: rd.title ?? "",
      artist,
      year: rd.year ?? 0,
      thumb: rd.thumb || "",
      cover: rd.images?.[0]?.uri || rd.thumb || "",
      label,
      catalogNumber: catno,
      format: formatParts.join(", "),
      dateAdded: new Date().toISOString(),
      discogsUrl: rd.uri ? `https://www.discogs.com${rd.uri.replace("https://api.discogs.com", "")}` : `https://www.discogs.com/release/${args.releaseId}`,
    };
  },
});

// ─── Standalone database search & market lookup ───

// 23. No-op that warms the "use node" runtime when the Look It Up panel
// opens, so the first search doesn't also pay the container cold start.
export const warm = action({
  args: {},
  handler: async () => true,
});

// 20. Search the Discogs database (all formats — the all-formats change
// removed the vinyl-only release filter; scope is a display concern applied
// at the client derive, and the pressing picker exposes a Format facet chip).
export const proxySearchDatabase = action({
  args: {
    sessionToken: v.string(),
    query: v.string(),
    searchType: v.optional(v.union(v.literal("master"), v.literal("release"))),
    page: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const type = args.searchType ?? "master";
    const page = args.page ?? 1;
    const url = `${BASE}/database/search?q=${encodeURIComponent(args.query)}&type=${type}&per_page=25&page=${page}`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      throw new Error(`Search failed (${res.status})`);
    }
    const data = await res.json();
    const results = (data.results || []).map((r: any) => {
      // Search returns a combined "Artist - Title" string
      const combined: string = r.title || "";
      const sep = combined.indexOf(" - ");
      const artist = sep > 0 ? formatArtistName(combined.slice(0, sep)) : "";
      const title = sep > 0 ? combined.slice(sep + 3) : combined;
      const isMaster = r.type === "master";
      return {
        id: (r.id as number) || 0,
        type: isMaster ? ("master" as const) : ("release" as const),
        masterId: (r.master_id as number) || (isMaster ? (r.id as number) : 0),
        title,
        artist,
        year: Number(r.year) || 0,
        thumb: (r.thumb as string) || "",
        cover: (r.cover_image as string) || (r.thumb as string) || "",
        label: Array.isArray(r.label) ? (r.label[0] as string) || "" : "",
        catno: (r.catno as string) || "",
        country: (r.country as string) || "",
        format: Array.isArray(r.format) ? r.format.join(", ") : "",
        have: (r.community?.have as number) ?? 0,
        want: (r.community?.want as number) ?? 0,
      };
    });
    return {
      results,
      page: (data.pagination?.page as number) ?? page,
      totalPages: (data.pagination?.pages as number) ?? 1,
      totalItems: (data.pagination?.items as number) ?? results.length,
    };
  },
});

// 21. Fetch pressings of a master (server-side filtered/paginated). All
// formats by default; the optional `format` arg (native versions param, like
// country/year/label) narrows to one media type when the picker's Format
// facet chip is set. The mainRelease probe below is also format-independent.
export const proxyFetchMasterVersions = action({
  args: {
    sessionToken: v.string(),
    masterId: v.number(),
    page: v.optional(v.number()),
    country: v.optional(v.string()),
    year: v.optional(v.string()),
    label: v.optional(v.string()),
    format: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const page = args.page ?? 1;
    let url = `${BASE}/masters/${args.masterId}/versions?per_page=25&page=${page}&sort=released&sort_order=asc`;
    if (args.country) url += `&country=${encodeURIComponent(args.country)}`;
    if (args.year) url += `&released=${encodeURIComponent(args.year)}`;
    if (args.label) url += `&label=${encodeURIComponent(args.label)}`;
    if (args.format) url += `&format=${encodeURIComponent(args.format)}`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch pressings (${res.status})`);
    }
    const data = await res.json();
    const versions = (data.versions || []).map((ver: any) => ({
      releaseId: (ver.id as number) || 0,
      title: (ver.title as string) || "",
      format: (ver.format as string) || "",
      label: (ver.label as string) || "",
      catno: (ver.catno as string) || "",
      country: (ver.country as string) || "",
      year: Number(ver.released) || 0,
      thumb: (ver.thumb as string) || "",
      inCollection: ((ver.stats?.user?.in_collection as number) ?? 0) > 0,
      inWantlist: ((ver.stats?.user?.in_wantlist as number) ?? 0) > 0,
      haveCount: (ver.stats?.community?.in_collection as number) ?? 0,
    }));

    // Filter facets (modern API; may be absent) — used for filter chips
    const facets = Array.isArray(data.filter_facets)
      ? data.filter_facets.map((f: any) => ({
          id: String(f.id ?? ""),
          title: String(f.title ?? ""),
          values: Array.isArray(f.values)
            ? f.values.map((x: any) => ({
                value: String(x.value ?? ""),
                title: String(x.title ?? x.value ?? ""),
                count: Number(x.count) || 0,
              }))
            : [],
        }))
      : [];

    // Main release — fallback for the pinned "most collected" row.
    // Only worth one extra request on an unfiltered first page.
    let mainReleaseId = 0;
    if (page === 1 && !args.country && !args.year && !args.label && !args.format) {
      const mRes = await discogsFetch(
        "GET",
        `${BASE}/masters/${args.masterId}`,
        creds.access_token,
        creds.token_secret
      );
      if (mRes.ok) {
        const m = await mRes.json();
        mainReleaseId = (m.main_release as number) || 0;
      }
    }

    return {
      versions,
      facets,
      mainReleaseId,
      page: (data.pagination?.page as number) ?? page,
      totalPages: (data.pagination?.pages as number) ?? 1,
      totalItems: (data.pagination?.items as number) ?? versions.length,
    };
  },
});

// 22. Condition-tiered price suggestions (Tier 2 market data).
// Discogs only serves this to users with seller settings filled out —
// callers must treat null as "no data" and degrade silently.
export const proxyFetchMarketData = action({
  args: { sessionToken: v.string(), releaseId: v.number() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/marketplace/price_suggestions/${args.releaseId}`;
    const res = await discogsFetch(
      "GET",
      url,
      creds.access_token,
      creds.token_secret
    );
    if (!res.ok) return null;
    const data = await res.json();
    const suggestions: { condition: string; value: number; currency: string }[] = [];
    for (const [condition, priceRaw] of Object.entries(data || {})) {
      const price = priceRaw as { currency?: string; value?: number };
      if (typeof price?.value === "number" && price.value > 0) {
        suggestions.push({
          condition,
          value: price.value,
          currency: price.currency || "USD",
        });
      }
    }
    return suggestions.length ? suggestions : null;
  },
});

// ── Per-album market value drip (Spec 6A.1) ──
// Daily cron (see convex/crons.ts). Prices are stored once per RELEASE in the
// shared `market_values` table, not per user — a release's lowest ask is the
// same for everyone who owns it, so one fetch serves all owners. Each run:
//   1. seed the shared set from all collections (picks up new releases, and
//      migrates any values from the legacy per-user collection fields),
//   2. fetch a batch of the stalest releases, spreading requests round-robin
//      across users' tokens so no single 60/min budget is the bottleneck.
// See docs/market-value-drip.md for the full write-up + scaling analysis.
export const marketValueDrip = internalAction({
  args: {},
  handler: async (ctx) => {
    const tokens = await ctx.runQuery(internal.discogsHelpers.listUsersForMarketDrip, {});
    if (tokens.length === 0) return; // nobody to fetch with

    // 1. Keep the shared set current (also migrates legacy per-user values).
    try {
      await ctx.runMutation(internal.market_values.seedFromCollection, {});
    } catch (e) {
      console.warn("[marketDrip] seed failed:", e);
    }

    // 2. Price the stalest batch, one Discogs request per unique release.
    const staleBefore = Date.now() - MARKET_STALE_MS;
    const batch = await ctx.runQuery(internal.market_values.getDripBatch, {
      staleBefore,
      limit: MARKET_BATCH_SIZE,
    });

    let i = 0;
    for (const { releaseId } of batch) {
      const creds = tokens[i % tokens.length]; // round-robin across tokens
      i++;
      try {
        const res = await discogsFetch(
          "GET",
          `${BASE}/marketplace/stats/${releaseId}?curr_abbr=${MARKET_CURRENCY}`,
          creds.accessToken,
          creds.tokenSecret
        );
        if (!res.ok) {
          // Transient/non-200 — advance fetchedAt only (value preserved) so a
          // failing release moves to the back of the queue instead of clogging.
          await ctx.runMutation(internal.market_values.setValue, {
            releaseId,
            fetchedAt: Date.now(),
          });
          continue;
        }
        const data = await res.json();
        // Stats returns lowest_price as { value, currency } | null. null (or a
        // missing value) means no active listings.
        const lp = data?.lowest_price;
        const value = lp && typeof lp.value === "number" ? lp.value : null;
        await ctx.runMutation(internal.market_values.setValue, {
          releaseId,
          fetchedAt: Date.now(),
          value,
        });
      } catch (e) {
        console.warn(`[marketDrip] stats fetch failed for ${releaseId}:`, e);
        // Advance fetchedAt so we don't re-hit it every run (retries in 30d).
        try {
          await ctx.runMutation(internal.market_values.setValue, {
            releaseId,
            fetchedAt: Date.now(),
          });
        } catch { /* ignore */ }
      }
    }
  },
});
