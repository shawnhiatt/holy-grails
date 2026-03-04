"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import crypto from "crypto";

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

async function discogsFetch(
  method: string,
  url: string,
  accessToken: string,
  tokenSecret: string,
  body?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: buildOAuthHeader(method, url, accessToken, tokenSecret),
    "User-Agent": USER_AGENT,
  };
  if (body) headers["Content-Type"] = "application/json";
  return fetch(url, { method, headers, body });
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
  pricePaidId: number | null;
  otherFields: Map<number, string>;
}

function formatArtistName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, "");
}

function buildFieldMap(fields: DiscogsCustomField[]): FieldMap {
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
  customFields?: { name: string; value: string }[];
  dateAdded: string;
  discogsUrl: string;
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
  const formatParts: string[] = [];
  for (const fmt of bi.formats || []) {
    formatParts.push(
      [fmt.name, ...(fmt.descriptions || [])].filter(Boolean).join(", ")
    );
  }

  const noteValues: string[] = [];
  const mediaCondition: string[] = [];
  const sleeveCondition: string[] = [];
  const pricePaid: string[] = [];
  const customFields: { name: string; value: string }[] = [];

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
    } else if (
      fieldMap.pricePaidId != null &&
      n.field_id === fieldMap.pricePaidId
    ) {
      pricePaid.push(n.value);
    } else {
      const customName = fieldMap.otherFields.get(n.field_id);
      if (customName) {
        customFields.push({ name: customName, value: n.value });
      } else {
        noteValues.push(n.value);
      }
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
    format: formatParts.join("; ") || "Vinyl",
    mediaCondition: mediaCondition.join(" · "),
    sleeveCondition: sleeveCondition.join(" · "),
    pricePaid: pricePaid.join(" · "),
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

// Condition grades (same as discogs-api.ts)
const CONDITION_GRADES = [
  "Mint (M)",
  "Near Mint (NM or M-)",
  "Very Good Plus (VG+)",
  "Very Good (VG)",
  "Good Plus (G+)",
  "Good (G)",
  "Fair (F)",
  "Poor (P)",
];

// ─── Shared fetch helpers ───

async function fetchFolderMapInternal(
  username: string,
  accessToken: string,
  tokenSecret: string
): Promise<Map<number, string>> {
  const url = `${BASE}/users/${encodeURIComponent(username)}/collection/folders`;
  const res = await discogsFetch("GET", url, accessToken, tokenSecret);
  if (!res.ok)
    throw new Error(`Failed to fetch folders (${res.status})`);
  const data = await res.json();
  const map = new Map<number, string>();
  for (const f of data.folders || []) {
    map.set(f.id, f.name);
  }
  return map;
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
      return { username: args.username, avatar: "" };
    }
  },
});

// 3. Fetch full collection (paginated, with folders + custom fields)
export const proxyFetchCollection = action({
  args: {
    sessionToken: v.string(),
    username: v.string(),
    skipPrivateFields: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const skip = args.skipPrivateFields === true;
    const folderMap = skip
      ? new Map<number, string>()
      : await fetchFolderMapInternal(
          args.username,
          creds.access_token,
          creds.token_secret
        );
    const fields = skip
      ? []
      : await fetchCustomFieldsInternal(
          args.username,
          creds.access_token,
          creds.token_secret
        );
    const fieldMap = buildFieldMap(fields);

    const albums: ProxyAlbum[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      if (page > 1) await sleep(250);
      const url = `${BASE}/users/${encodeURIComponent(args.username)}/collection/folders/0/releases?per_page=100&page=${page}&sort=artist&sort_order=asc`;
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
      );
      if (!res.ok)
        throw new Error(
          `Failed to fetch collection page ${page} (${res.status})`
        );
      const data: CollectionPage = await res.json();
      totalPages = data.pagination.pages;

      for (const r of data.releases) {
        albums.push(mapRelease(r, folderMap, fieldMap));
      }
      page++;
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

    const folderNames = [
      "All",
      ...Array.from(folderMap.values()).filter((n) => n !== "All"),
    ];

    return { albums: deduped, folders: folderNames };
  },
});

// 4. Fetch wantlist (paginated)
export const proxyFetchWantlist = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const wants: {
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
    }[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      if (page > 1) await sleep(250);
      const url = `${BASE}/users/${encodeURIComponent(args.username)}/wants?per_page=100&page=${page}`;
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
      );
      if (!res.ok)
        throw new Error(
          `Failed to fetch want list page ${page} (${res.status})`
        );
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
          master_id: bi.master_id || undefined,
          title: bi.title,
          artist,
          year: bi.year || 0,
          thumb: bi.thumb || "",
          cover: bi.cover_image || bi.thumb || "",
          label: bi.labels?.[0]?.name || "Unknown",
          priority: false,
        });
      }
      page++;
    }

    return wants;
  },
});

// 5. Fetch market data (price suggestions + marketplace stats)
export const proxyFetchMarketData = action({
  args: { sessionToken: v.string(), releaseId: v.number() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );

    const prices: {
      condition: string;
      value: number;
      currency: string;
    }[] = [];
    let stats = {
      lowestPrice: null as number | null,
      numForSale: 0,
      currency: "USD",
    };

    // Price suggestions
    try {
      const url = `${BASE}/marketplace/price_suggestions/${args.releaseId}`;
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
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

    // Marketplace stats
    try {
      const url = `${BASE}/marketplace/stats/${args.releaseId}`;
      const res = await discogsFetch(
        "GET",
        url,
        creds.access_token,
        creds.token_secret
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

    return { prices, stats, fetchedAt: Date.now() };
  },
});

// 6. Fetch collection value
export const proxyFetchCollectionValue = action({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const url = `${BASE}/users/${encodeURIComponent(args.username)}/collection/value`;
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
  },
  handler: async (ctx, args) => {
    const creds = await ctx.runQuery(
      internal.discogsHelpers.getUserCredentials,
      { sessionToken: args.sessionToken }
    );
    const fieldDefs = await fetchCustomFieldsInternal(
      args.username,
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

    for (const update of updates) {
      const url = `${BASE}/users/${encodeURIComponent(args.username)}/collection/folders/${args.folderId}/releases/${args.releaseId}/instances/${args.instanceId}/fields/${update.fieldId}`;
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

// 8. Move to folder
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

    // Step 1: Add to new folder
    const addUrl = `${BASE}/users/${encodeURIComponent(args.username)}/collection/folders/${args.newFolderId}/releases/${args.releaseId}`;
    const addRes = await discogsFetch(
      "POST",
      addUrl,
      creds.access_token,
      creds.token_secret
    );
    if (!addRes.ok) {
      const body = await addRes.text().catch(() => "");
      throw new Error(
        `Failed to add release ${args.releaseId} to folder ${args.newFolderId} (${addRes.status})${body ? ": " + body : ""}`
      );
    }
    const addData = await addRes.json();
    const newInstanceId = addData.instance_id as number;

    // Step 2: Remove from old folder
    const delUrl = `${BASE}/users/${encodeURIComponent(args.username)}/collection/folders/${args.oldFolderId}/releases/${args.releaseId}/instances/${args.instanceId}`;
    const delRes = await discogsFetch(
      "DELETE",
      delUrl,
      creds.access_token,
      creds.token_secret
    );
    if (delRes.status !== 404 && !delRes.ok) {
      const body = await delRes.text().catch(() => "");
      throw new Error(
        `Failed to remove release ${args.releaseId} from folder ${args.oldFolderId} (${delRes.status})${body ? ": " + body : ""}`
      );
    }

    return { newInstanceId };
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
    const url = `${BASE}/users/${encodeURIComponent(args.username)}/collection/folders/${args.folderId}/releases/${args.releaseId}/instances/${args.instanceId}`;
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
    const url = `${BASE}/users/${encodeURIComponent(args.username)}/wants/${args.releaseId}`;
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
    const url = `${BASE}/users/${encodeURIComponent(args.username)}/wants/${args.releaseId}`;
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

// 12. Fetch single collection page (for following feed)
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
        dateAdded: r.date_added || "",
      };
    });
  },
});
