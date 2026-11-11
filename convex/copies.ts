/**
 * Every copy (DW-04): which copy a write means.
 *
 * Discogs gives every copy you own its own instance id. It survives a folder
 * move, and a removed-then-re-added copy gets a new one, so a copy is
 * (username, instanceId). Purge verdicts, plays and session members belong to
 * a copy; the release id is kept beside it everywhere.
 *
 * ── The default copy ──
 *
 * When something names only a release (an old client, a Shortcut, the widget,
 * a stale session entry) it means the release's DEFAULT copy: the cached copy
 * with the lowest instance id. Discogs issues instance ids in increasing
 * order, so that is the oldest copy. Until the DW-04e switch the cache holds
 * one copy per release (the sync's sticky dedupe), so the default copy is
 * simply the one the app has been showing. One rule, used by every server
 * path here and by the copy migration — never pick a copy any other way.
 *
 * Only TYPES come from `_generated`, so at runtime this module is pure and a
 * client can import the helpers (stackRules.ts is imported the same way).
 */

import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// ─── Validation ───

/** A Discogs instance id: a positive safe integer. NaN (e.g. a leftover
 *  `Number("c-123")` on a client) and fractions are not. */
export function isInstanceId(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

/** Throw rather than ever store something that isn't a real instance id. */
export function assertInstanceId(n: number): void {
  if (!isInstanceId(n)) throw new Error("Invalid copy.");
}

export function assertInstanceIds(ids: readonly number[]): void {
  for (const n of ids) assertInstanceId(n);
}

// ─── Pure helpers ───

/** The default copy among one release's cached rows: lowest instance id. */
export function pickDefaultCopy<T extends { instanceId: number }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) if (best === null || r.instanceId < best.instanceId) best = r;
  return best;
}

/**
 * A manual session's `album_ids` from its `copy_ids`: each copy's release, in
 * order of first appearance. A copy the cache doesn't know (it left the
 * collection) has no release to list and is skipped — it is invisible either
 * way.
 */
export function releaseIdsForCopies(
  copyIds: readonly number[],
  releaseOf: ReadonlyMap<number, number>
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const c of copyIds) {
    const r = releaseOf.get(c);
    if (r === undefined || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

/**
 * A manual session's `copy_ids` after a write that sent only `album_ids` (an
 * old client, or a session that predates copies). `album_ids` decides the
 * order. For each listed release: keep the copies of it the session already
 * held, in their existing order; if it held none, add the release's default
 * copy; if the user owns no copy of it, it gets none (it stays in album_ids
 * only, as invisible as it is today). Copies whose release is no longer
 * listed are dropped — the old client removed them.
 */
export function rebuildCopyIds(
  existingCopyIds: readonly number[],
  albumIds: readonly number[],
  releaseOf: ReadonlyMap<number, number>,
  defaultCopyOf: ReadonlyMap<number, number>
): number[] {
  const heldByRelease = new Map<number, number[]>();
  for (const c of existingCopyIds) {
    const r = releaseOf.get(c);
    if (r === undefined) continue;
    const list = heldByRelease.get(r) ?? [];
    if (!list.includes(c)) list.push(c);
    heldByRelease.set(r, list);
  }
  const out: number[] = [];
  const done = new Set<number>();
  for (const r of albumIds) {
    if (done.has(r)) continue;
    done.add(r);
    const held = heldByRelease.get(r);
    if (held && held.length) out.push(...held);
    else {
      const d = defaultCopyOf.get(r);
      if (d !== undefined) out.push(d);
    }
  }
  return out;
}

type TagLike = { release_id: number; instance_id?: number; tag: "keep" | "cut" | "maybe" };
type PlayLike = { release_id: number; instance_id?: number; played_at: number };

export interface CopyFold {
  purgeTag: "keep" | "cut" | "maybe" | null;
  playCount: number;
  lastPlayedAt: number | null;
}

/**
 * Purge verdicts and play history folded onto copies, keyed by instance id.
 * A row carrying an instance id belongs to that copy. A release-only row (no
 * instance id: written before the migration, or for a release not owned when
 * it ran) goes to that release's default copy — before the migration every
 * row is release-only, and this keeps the fold identical to the old
 * by-release one for a one-copy collection. Where several rows compete for
 * one copy's verdict, the last in input order wins (the old Map behaviour);
 * an instance row beats a release-only one.
 */
export function foldByCopy(
  rows: readonly { releaseId: number; instanceId: number }[],
  tags: readonly TagLike[],
  plays: readonly PlayLike[]
): Map<number, CopyFold> {
  const defaultOf = new Map<number, number>();
  for (const r of rows) {
    const d = defaultOf.get(r.releaseId);
    if (d === undefined || r.instanceId < d) defaultOf.set(r.releaseId, r.instanceId);
  }
  // A release-only row's copy, or undefined when the release isn't cached.
  const copyOf = (x: { release_id: number; instance_id?: number }) =>
    x.instance_id !== undefined ? x.instance_id : defaultOf.get(x.release_id);

  const tagByInstance = new Map<number, TagLike["tag"]>();
  const releaseOnlyTag = new Map<number, TagLike["tag"]>();
  for (const t of tags) {
    if (t.instance_id !== undefined) tagByInstance.set(t.instance_id, t.tag);
    else releaseOnlyTag.set(t.release_id, t.tag);
  }

  const out = new Map<number, CopyFold>();
  for (const r of rows) {
    const isDefault = defaultOf.get(r.releaseId) === r.instanceId;
    out.set(r.instanceId, {
      purgeTag:
        tagByInstance.get(r.instanceId) ??
        (isDefault ? releaseOnlyTag.get(r.releaseId) : undefined) ??
        null,
      playCount: 0,
      lastPlayedAt: null,
    });
  }
  for (const p of plays) {
    const c = copyOf(p);
    if (c === undefined) continue;
    const f = out.get(c);
    if (!f) continue;
    f.playCount += 1;
    f.lastPlayedAt = Math.max(f.lastPlayedAt ?? 0, p.played_at);
  }
  return out;
}

// ─── Reads ───

/** Every cached row of one release for one user (0, 1, or — after the
 *  switch — several copies). */
export async function copiesOfRelease(
  ctx: QueryCtx,
  username: string,
  releaseId: number
): Promise<Doc<"collection">[]> {
  return await ctx.db
    .query("collection")
    .withIndex("by_username_and_release", (q) =>
      q.eq("discogsUsername", username).eq("releaseId", releaseId)
    )
    .collect();
}

/** The cached row of one copy, or null when the cache doesn't hold it. */
export async function findCopy(
  ctx: QueryCtx,
  username: string,
  instanceId: number
): Promise<Doc<"collection"> | null> {
  return await ctx.db
    .query("collection")
    .withIndex("by_username_and_instance", (q) =>
      q.eq("discogsUsername", username).eq("instanceId", instanceId)
    )
    .first();
}

/**
 * The cached row a write about (release, copy?) means. With an instance id:
 * that copy's row, or null when it isn't cached. A cached copy of a DIFFERENT
 * release throws — a client mixed up its ids, and guessing would write a
 * verdict or play onto the wrong record. Without one: the default copy, or
 * null when the release isn't cached.
 */
export async function resolveCopy(
  ctx: QueryCtx,
  username: string,
  releaseId: number,
  instanceId?: number
): Promise<Doc<"collection"> | null> {
  if (instanceId !== undefined) {
    assertInstanceId(instanceId);
    const row = await findCopy(ctx, username, instanceId);
    if (row && row.releaseId !== releaseId) {
      throw new Error("That copy belongs to another release.");
    }
    return row;
  }
  return pickDefaultCopy(await copiesOfRelease(ctx, username, releaseId));
}

/**
 * The instance id to store on a verdict or play row: the named copy (even if
 * the cache doesn't hold it — the client saw it), else the default copy's,
 * else undefined (the release isn't cached: the row stays release-only, as
 * every row was before copies).
 */
export async function copyInstanceFor(
  ctx: QueryCtx,
  username: string,
  releaseId: number,
  instanceId?: number
): Promise<number | undefined> {
  const row = await resolveCopy(ctx, username, releaseId, instanceId);
  if (instanceId !== undefined) return instanceId;
  return row?.instanceId;
}

/** releaseOf for a set of copies (only the cached ones appear). */
export async function loadReleaseOfCopies(
  ctx: QueryCtx,
  username: string,
  copyIds: readonly number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const c of new Set(copyIds)) {
    const row = await findCopy(ctx, username, c);
    if (row) out.set(c, row.releaseId);
  }
  return out;
}

/** The default copy of each release (only cached releases appear). */
export async function loadDefaultCopies(
  ctx: QueryCtx,
  username: string,
  releaseIds: readonly number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const r of new Set(releaseIds)) {
    const d = pickDefaultCopy(await copiesOfRelease(ctx, username, r));
    if (d) out.set(r, d.instanceId);
  }
  return out;
}
