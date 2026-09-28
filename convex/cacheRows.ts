import { v } from "convex/values";

/**
 * The row shapes the sync writes into the `collection` and `wantlist` caches,
 * and the projections from the fetched Discogs data into them.
 *
 * These live together so one test can hold them against each other: every
 * field a cache mutation accepts must be forwarded by the projection that
 * feeds it. The collection projection used to be an inline object literal in
 * `syncSelf`, and it silently dropped genres/styles/rating/discCount/artistIds
 * from the day the free-data pass shipped — the validator accepts their
 * absence (they are optional), so nothing failed. `cacheRows.test.ts` is the
 * guard against that happening again. Add a new cached field HERE, to both
 * the validator and the projection, and the test will tell you if you forgot
 * one.
 *
 * No Convex server imports — only `convex/values` — so the test runs in plain
 * node.
 */

const customFieldValidator = v.object({
  name: v.string(),
  value: v.string(),
  fieldId: v.optional(v.number()),
  type: v.optional(v.string()),
  options: v.optional(v.array(v.string())),
});

/** Fields of one `collection` cache row, minus the owner key. */
export const collectionRowFields = {
  releaseId: v.number(),
  masterId: v.optional(v.number()),
  instanceId: v.number(),
  folderId: v.optional(v.number()),
  artist: v.string(),
  title: v.string(),
  year: v.number(),
  thumb: v.optional(v.string()),
  cover: v.string(),
  folder: v.string(),
  label: v.string(),
  catalogNumber: v.string(),
  format: v.string(),
  mediaCondition: v.string(),
  sleeveCondition: v.string(),
  notes: v.string(),
  customFields: v.optional(v.array(customFieldValidator)),
  dateAdded: v.string(),
  // Free data (Session Builder phase 1). `rating` is never 0 here: the mapper
  // drops Discogs' 0-means-unrated at the boundary.
  genres: v.optional(v.array(v.string())),
  styles: v.optional(v.array(v.string())),
  rating: v.optional(v.number()),
  discCount: v.optional(v.number()),
  artistIds: v.optional(v.array(v.number())),
};

/** Fields of one `wantlist` cache row, minus the owner key. No `rating`:
 *  Discogs only rates copies you own. */
export const wantRowFields = {
  release_id: v.number(),
  master_id: v.optional(v.number()),
  title: v.string(),
  artist: v.string(),
  year: v.number(),
  cover: v.string(),
  thumb: v.optional(v.string()),
  label: v.string(),
  format: v.optional(v.string()),
  genres: v.optional(v.array(v.string())),
  styles: v.optional(v.array(v.string())),
  discCount: v.optional(v.number()),
  artistIds: v.optional(v.array(v.number())),
  /** Discogs `date_added`, "YYYY-MM-DD" (same shape `collection` stores). */
  dateAdded: v.optional(v.string()),
  priority: v.boolean(),
};

/** The fetched-collection shape the projection reads (a structural subset of
 *  `ProxyAlbum` in discogs.ts). */
export interface SyncedAlbum {
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
  customFields?: { name: string; value: string; fieldId: number; type: string; options?: string[] }[];
  dateAdded: string;
  genres?: string[];
  styles?: string[];
  rating?: number;
  discCount?: number;
  artistIds?: number[];
}

/** The fetched-wantlist shape the projection reads (subset of `ProxyWant`). */
export interface SyncedWant {
  release_id: number;
  master_id?: number;
  title: string;
  artist: string;
  year: number;
  thumb: string;
  cover: string;
  label: string;
  format: string;
  genres?: string[];
  styles?: string[];
  discCount?: number;
  artistIds?: number[];
  dateAdded?: string;
  priority: boolean;
}

export function toCollectionRow(a: SyncedAlbum) {
  return {
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
    notes: a.notes,
    customFields: a.customFields,
    dateAdded: a.dateAdded,
    genres: a.genres,
    styles: a.styles,
    rating: a.rating,
    discCount: a.discCount,
    artistIds: a.artistIds,
  };
}

export function toWantRow(w: SyncedWant) {
  return {
    release_id: w.release_id,
    master_id: w.master_id || undefined,
    title: w.title,
    artist: w.artist,
    year: w.year,
    cover: w.cover,
    thumb: w.thumb || undefined,
    label: w.label,
    format: w.format || undefined,
    genres: w.genres,
    styles: w.styles,
    discCount: w.discCount,
    artistIds: w.artistIds,
    dateAdded: w.dateAdded,
    priority: w.priority,
  };
}

// ─── Diff signatures ───
//
// Whether an already-cached row needs patching. Computed on the stored row in
// the query runtime and on the incoming row in the sync action, so both sides
// MUST share this one implementation. Free data is included on purpose: the
// signature is how already-cached rows get backfilled when a field is added —
// leave a field out and existing rows compare equal and never receive it.

type CollectionRowLike = Partial<Record<keyof typeof collectionRowFields, unknown>>;
type WantRowLike = Partial<Record<keyof typeof wantRowFields, unknown>>;

type CustomFieldLike = {
  name: string;
  value: string;
  fieldId?: number;
  type?: string;
  options?: string[];
};

/** Custom fields as positional tuples. Convex hands stored objects back with
 *  their keys SORTED, so a JSON.stringify of the raw objects never matched
 *  the incoming ones and every row carrying custom fields was re-patched on
 *  every sync. Positional tuples compare by value, not by key order. */
function customFieldsKey(fields: unknown): unknown {
  if (!Array.isArray(fields)) return null;
  return (fields as CustomFieldLike[]).map((f) => [
    f.name,
    f.value,
    f.fieldId ?? null,
    f.type ?? null,
    f.options ?? null,
  ]);
}

export function albumSignature(a: CollectionRowLike): string {
  return JSON.stringify([
    a.masterId ?? null,
    a.instanceId,
    a.folderId ?? null,
    a.artist,
    a.title,
    a.year,
    a.thumb ?? null,
    a.cover,
    a.folder,
    a.label,
    a.catalogNumber,
    a.format,
    a.mediaCondition,
    a.sleeveCondition,
    a.notes,
    customFieldsKey(a.customFields),
    a.dateAdded,
    a.genres ?? null,
    a.styles ?? null,
    a.rating ?? null,
    a.discCount ?? null,
    a.artistIds ?? null,
  ]);
}

export function wantSignature(w: WantRowLike): string {
  return JSON.stringify([
    w.master_id ?? null,
    w.title,
    w.artist,
    w.year,
    w.cover,
    w.thumb ?? null,
    w.label,
    w.format ?? null,
    w.genres ?? null,
    w.styles ?? null,
    w.discCount ?? null,
    w.artistIds ?? null,
    w.dateAdded ?? null,
    w.priority,
  ]);
}

// ─── Chunked diff planning ───
//
// The sync used to reconcile a whole collection inside ONE mutation: every
// incoming row as one argument, every existing row read, every insert/patch/
// delete in one transaction. A large collection runs into Convex's
// per-mutation limits on that path and the whole sync fails with nothing
// written. The sync action now reads the cache's signatures page by page,
// plans the diff here, and applies it in bounded chunks.

/** One cached row as the sync sees it: its id, its key, its signature. */
export interface CachedSignature<Id extends string> {
  id: Id;
  key: number;
  signature: string;
}

export interface CacheDiffPlan<Id extends string, Row> {
  inserts: Row[];
  patches: { id: Id; row: Row }[];
  deletes: Id[];
}

/**
 * Decide what to write. New keys insert, changed signatures patch, unchanged
 * rows are left alone, and cached keys absent from the fetch delete. A key
 * cached more than once (a past race) keeps its first row and deletes the
 * rest. An incoming key seen twice keeps the first, matching the sync's own
 * dedupe-by-release rule.
 */
export function planCacheDiff<Id extends string, Row>(
  cached: CachedSignature<Id>[],
  incoming: Row[],
  keyOf: (row: Row) => number,
  signatureOf: (row: Row) => string
): CacheDiffPlan<Id, Row> {
  const cachedByKey = new Map<number, CachedSignature<Id>>();
  const deletes: Id[] = [];
  for (const c of cached) {
    if (cachedByKey.has(c.key)) deletes.push(c.id);
    else cachedByKey.set(c.key, c);
  }

  const inserts: Row[] = [];
  const patches: { id: Id; row: Row }[] = [];
  const seen = new Set<number>();
  for (const row of incoming) {
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = cachedByKey.get(key);
    if (!existing) inserts.push(row);
    else if (existing.signature !== signatureOf(row)) patches.push({ id: existing.id, row });
  }

  for (const [key, c] of cachedByKey) {
    if (!seen.has(key)) deletes.push(c.id);
  }
  return { inserts, patches, deletes };
}

/** Rows per write mutation. Rows carry custom fields and notes, so this is
 *  sized well under the per-mutation argument and write limits. */
export const SYNC_UPSERT_CHUNK = 200;
/** Deletes carry only an id. */
export const SYNC_DELETE_CHUNK = 1000;

/**
 * Split a plan into mutation-sized chunks. Every insert and patch chunk comes
 * before any delete chunk, so a sync that fails partway can leave a row
 * stale but never removes one the fetch still returned.
 */
export function chunkCacheDiff<Id extends string, Row>(
  plan: CacheDiffPlan<Id, Row>,
  upsertChunk = SYNC_UPSERT_CHUNK,
  deleteChunk = SYNC_DELETE_CHUNK
): CacheDiffPlan<Id, Row>[] {
  const chunks: CacheDiffPlan<Id, Row>[] = [];
  const upserts: ({ kind: "insert"; row: Row } | { kind: "patch"; id: Id; row: Row })[] = [
    ...plan.inserts.map((row) => ({ kind: "insert" as const, row })),
    ...plan.patches.map((p) => ({ kind: "patch" as const, ...p })),
  ];
  for (let i = 0; i < upserts.length; i += upsertChunk) {
    const slice = upserts.slice(i, i + upsertChunk);
    chunks.push({
      inserts: slice.flatMap((u) => (u.kind === "insert" ? [u.row] : [])),
      patches: slice.flatMap((u) => (u.kind === "patch" ? [{ id: u.id, row: u.row }] : [])),
      deletes: [],
    });
  }
  for (let i = 0; i < plan.deletes.length; i += deleteChunk) {
    chunks.push({ inserts: [], patches: [], deletes: plan.deletes.slice(i, i + deleteChunk) });
  }
  return chunks;
}

/**
 * Reconcile one cache table with a fresh fetch: page through the cache's
 * signatures, plan inserts/patches/deletes, and write them in bounded chunks
 * (inserts and patches first, deletes last — see chunkCacheDiff). Replaces the
 * single applyDiff mutation that carried a whole collection in one
 * transaction and failed outright once a collection outgrew Convex's
 * per-mutation limits.
 */
export async function syncCacheInChunks<Id extends string, Row>(opts: {
  incoming: Row[];
  keyOf: (row: Row) => number;
  signatureOf: (row: Row) => string;
  readPage: (cursor: string | null) => Promise<{
    page: CachedSignature<Id>[];
    isDone: boolean;
    continueCursor: string;
  }>;
  writeChunk: (chunk: CacheDiffPlan<Id, Row>) => Promise<unknown>;
}): Promise<{ added: number; removed: number; updated: number }> {
  const cached: CachedSignature<Id>[] = [];
  let cursor: string | null = null;
  for (;;) {
    const result = await opts.readPage(cursor);
    cached.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  const plan = planCacheDiff(cached, opts.incoming, opts.keyOf, opts.signatureOf);
  for (const chunk of chunkCacheDiff(plan)) await opts.writeChunk(chunk);
  return {
    added: plan.inserts.length,
    removed: plan.deletes.length,
    updated: plan.patches.length,
  };
}
