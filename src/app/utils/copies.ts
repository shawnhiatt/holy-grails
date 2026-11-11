/* Every copy (DW-04c): each copy you own is its own item.

   Discogs gives every copy its own instance id, so a copy is (you, instance
   id). An `Album` is one copy, and its `id` is `copyKey(instanceId)`:
   "c-<instanceId>". Purge verdicts, plays and session members belong to a
   copy; the release id rides along on `Album.release_id` for everything that
   is about the release (prices, wants, Look It Up, friends, release data).

   Why a prefix rather than the bare instance id: before copies, `Album.id`
   WAS the release id and many writes did `Number(album.id)`. A prefixed id
   makes any such leftover a NaN, which the server rejects (copies.ts
   `assertInstanceId`), instead of a valid-looking number stored in a release
   id field.

   Pure: no React, no Convex client. The server's fold (`foldByCopy` in
   convex/copies.ts) is reused as-is, so the owner's view and a share link
   (evaluated server-side) put every verdict and play on the same copy. */

import type { Doc } from "../../../convex/_generated/dataModel";
import { foldByCopy } from "../../../convex/copies";
import type { Album, PurgeTag } from "../components/discogs-api";

// ─── Ids ───

const COPY_PREFIX = "c-";

/** The `Album.id` of one copy. */
export function copyKey(instanceId: number): string {
  return `${COPY_PREFIX}${instanceId}`;
}

/** The instance id inside a copy key, or NaN for anything that isn't one
 *  (a release id string, a "w-" want id, a friend's album). NaN is the point:
 *  the server refuses it rather than storing a wrong number. */
export function instanceOfKey(id: string): number {
  if (!id.startsWith(COPY_PREFIX)) return NaN;
  const rest = id.slice(COPY_PREFIX.length);
  if (!/^\d+$/.test(rest)) return NaN;
  return Number(rest);
}

/** Play-map key for a play no cached copy can take: a release-only play of a
 *  release you don't own. Never equals a copy key, so it shows on no card,
 *  but it still counts in totals, streaks and plays per month. */
function releaseOnlyKey(releaseId: number): string {
  return `r-${releaseId}`;
}

/**
 * The default copy of a release among the given albums: the lowest instance
 * id, which is the oldest copy (Discogs issues them in increasing order). The
 * same rule as the server's `pickDefaultCopy`. Used wherever the app names a
 * release and has to open one copy of it ("View Your Copy").
 */
export function defaultCopyOf<T extends { release_id: number; instance_id: number }>(
  albums: readonly T[],
  releaseId: number
): T | undefined {
  let best: T | undefined;
  for (const a of albums) {
    if (a.release_id !== releaseId) continue;
    if (best === undefined || a.instance_id < best.instance_id) best = a;
  }
  return best;
}

// ─── The collection ───

type CollectionRow = Doc<"collection">;
type TagRow = Pick<Doc<"purge_tags">, "release_id" | "instance_id" | "tag">;
type PlayRow = Pick<Doc<"last_played">, "release_id" | "instance_id" | "played_at">;

/**
 * The cached collection as albums, one per copy, each with its own verdict.
 * A verdict row with an instance id is that copy's; a release-only one (from
 * before the copy migration) goes to the release's default copy, exactly as
 * the server folds it.
 */
export function deriveAlbums(rows: readonly CollectionRow[], tags: readonly TagRow[]): Album[] {
  const fold = foldByCopy(rows, tags, []);
  return rows.map((row) => ({
    id: copyKey(row.instanceId),
    release_id: row.releaseId,
    master_id: row.masterId || undefined,
    instance_id: row.instanceId,
    folder_id: row.folderId ?? 1,
    title: row.title,
    artist: row.artist,
    year: row.year,
    thumb: row.thumb ?? "",
    cover: row.cover,
    folder: row.folder,
    label: row.label,
    catalogNumber: row.catalogNumber,
    format: row.format,
    mediaCondition: row.mediaCondition,
    sleeveCondition: row.sleeveCondition,
    notes: row.notes,
    customFields: row.customFields,
    dateAdded: row.dateAdded,
    // Free data off the collection response (Session Builder phase 1).
    // Undefined until the user's next sync backfills the cached row.
    genres: row.genres || undefined,
    styles: row.styles || undefined,
    rating: row.rating || undefined,
    discCount: row.discCount || undefined,
    artistIds: row.artistIds || undefined,
    // marketValue is no longer on the collection row — it lives once per
    // release in `market_values` (Spec 6A.1) and is merged in by the
    // Insights value sections via market_values.getForUser.
    discogsUrl: `https://www.discogs.com/release/${row.releaseId}`,
    purgeTag: (fold.get(row.instanceId)?.purgeTag ?? null) as PurgeTag,
  }));
}

// ─── Plays ───

/** One logged play: which copy (`albumId`, a copy key), its release, and
 *  when. `releaseId` is what "releases played" counts (two copies of one
 *  release played are one release played). */
export interface PlayLogEntry {
  albumId: string;
  releaseId: number;
  playedAt: number;
}

/**
 * Which play-map key each play belongs to, by the server's fold: a play with
 * an instance id is that copy's (even if the copy has since left — then it
 * shows on no card); a release-only play goes to the release's default copy,
 * or to no card when the release isn't cached.
 */
export function playKeyResolver(
  rows: readonly { releaseId: number; instanceId: number }[]
): (play: { release_id: number; instance_id?: number }) => string {
  const defaultOf = new Map<number, number>();
  for (const r of rows) {
    const d = defaultOf.get(r.releaseId);
    if (d === undefined || r.instanceId < d) defaultOf.set(r.releaseId, r.instanceId);
  }
  return (play) => {
    if (play.instance_id !== undefined) return copyKey(play.instance_id);
    const d = defaultOf.get(play.release_id);
    return d !== undefined ? copyKey(d) : releaseOnlyKey(play.release_id);
  };
}

/** lastPlayed (most recent per copy), playCounts, every timestamp, and the
 *  play log, from the raw play rows and the cached collection. */
export function buildPlayMaps(
  records: readonly PlayRow[],
  rows: readonly { releaseId: number; instanceId: number }[]
) {
  const keyOf = playKeyResolver(rows);
  const latestMs: Record<string, number> = {};
  const countMap: Record<string, number> = {};
  const allTimestamps: number[] = [];
  const playLog: PlayLogEntry[] = [];
  for (const lp of records) {
    const key = keyOf(lp);
    countMap[key] = (countMap[key] || 0) + 1;
    allTimestamps.push(lp.played_at);
    playLog.push({ albumId: key, releaseId: lp.release_id, playedAt: lp.played_at });
    if (!latestMs[key] || lp.played_at > latestMs[key]) {
      latestMs[key] = lp.played_at;
    }
  }
  const lastPlayedMap: Record<string, string> = {};
  for (const [key, ms] of Object.entries(latestMs)) {
    lastPlayedMap[key] = new Date(ms).toISOString();
  }
  return { lastPlayedMap, countMap, allTimestamps, playLog };
}

// ─── Write arguments ───
// Every write about a copy names both ids: the release (required by every
// table, forever) and the copy. These builders are the only place the pair is
// assembled, so a call site can't send one without the other.

/** `{ release_id, instance_id }` for purge_tags and last_played writes. */
export function copyArgs(album: Pick<Album, "release_id" | "instance_id">) {
  return { release_id: album.release_id, instance_id: album.instance_id };
}

/** `{ releaseId, instanceId }` for collection:removeItem. */
export function cacheRemoveArgs(album: Pick<Album, "release_id" | "instance_id">) {
  return { releaseId: album.release_id, instanceId: album.instance_id };
}

/** `{ releaseId, matchInstanceId }` for collection:updateInstance: which
 *  cached row to patch. (Its own `instanceId` arg is a value to STORE.) */
export function cacheMatchArgs(album: Pick<Album, "release_id" | "instance_id">) {
  return { releaseId: album.release_id, matchInstanceId: album.instance_id };
}

/**
 * True when clearing this copy's verdict must also clear a release-only
 * verdict row: the copy is its release's default copy, so the fold shows a
 * release-only row on it, and `purge_tags:remove` with an instance id only
 * deletes that copy's own rows. Without the second remove the cleared
 * verdict would come straight back. Only possible for a release that wasn't
 * owned when the copy migration ran and was bought again since.
 */
export function needsReleaseOnlyTagClear(
  album: Pick<Album, "release_id" | "instance_id">,
  albums: readonly Pick<Album, "release_id" | "instance_id">[],
  tags: readonly TagRow[]
): boolean {
  if (!tags.some((t) => t.release_id === album.release_id && t.instance_id === undefined)) {
    return false;
  }
  return defaultCopyOf(albums, album.release_id)?.instance_id === album.instance_id;
}

// ─── Sessions ───

/**
 * A manual session's members for a write: `copy_ids` (what the server
 * stores and what wins) and `album_ids` (their releases in order of first
 * appearance; the server derives the same from copy_ids, and old builds read
 * it). A member the collection no longer holds keeps its copy id and simply
 * has no release to list. Throws on a key that isn't a copy key, so a release
 * id can never be written into copy_ids.
 */
export function sessionMemberArgs(
  albumIds: readonly string[],
  albums: readonly Pick<Album, "release_id" | "instance_id">[]
): { copy_ids: number[]; album_ids: number[] } {
  const releaseOf = new Map(albums.map((a) => [a.instance_id, a.release_id]));
  const copy_ids: number[] = [];
  const album_ids: number[] = [];
  const seen = new Set<number>();
  for (const id of albumIds) {
    const inst = instanceOfKey(id);
    if (!Number.isSafeInteger(inst) || inst <= 0) {
      throw new Error(`Not a copy: ${id}`);
    }
    copy_ids.push(inst);
    const r = releaseOf.get(inst);
    if (r !== undefined && !seen.has(r)) {
      seen.add(r);
      album_ids.push(r);
    }
  }
  return { copy_ids, album_ids };
}

/**
 * A stored session's members as copy keys. A session saved since copies
 * carries `copy_ids`; one that doesn't yet (the copy migration fills every
 * manual session, so this is a backstop) is read by the default-copy rule:
 * each release's default copy, and a release you don't own drops out.
 */
export function sessionMemberKeys(
  stack: { copy_ids?: number[]; album_ids: number[] },
  rows: readonly { releaseId: number; instanceId: number }[]
): string[] {
  if (stack.copy_ids !== undefined) return stack.copy_ids.map(copyKey);
  const defaultOf = new Map<number, number>();
  for (const r of rows) {
    const d = defaultOf.get(r.releaseId);
    if (d === undefined || r.instanceId < d) defaultOf.set(r.releaseId, r.instanceId);
  }
  const out: string[] = [];
  for (const rid of stack.album_ids) {
    const d = defaultOf.get(rid);
    if (d !== undefined && !out.includes(copyKey(d))) out.push(copyKey(d));
  }
  return out;
}
