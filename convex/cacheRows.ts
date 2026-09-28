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
