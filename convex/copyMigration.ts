/**
 * Every copy (DW-04): move existing purge verdicts, plays and manual session
 * members onto copies. WRITTEN IN DW-04a, RUN IN DW-04b — dev first, prod
 * only with Shawn, after an `npx convex export` of that deployment (the
 * export is the undo).
 *
 * Why it is safe to run before any client changes: until the DW-04e switch
 * the cache holds one copy per release (the sync's sticky dedupe), so every
 * release maps to exactly one copy — the one the app has been showing, the
 * one the user rated, played and would have cut. Each release-only row moves
 * to that copy (copies.ts's default copy; the lowest instance id if an app
 * add briefly cached a second one).
 *
 * The rules this file must never break:
 *   - It never deletes anything.
 *   - A verdict or a play goes to exactly ONE copy, never to both. Copying a
 *     Cut onto two copies would make Purge Cut remove both from Discogs.
 *   - It only fills what is missing (rows without an instance id, sessions
 *     without copy_ids), so running it again changes nothing.
 *   - A row whose release isn't cached stays release-only and is COUNTED in
 *     the report — unresolved, not silent.
 *
 * Shape: one user per run, one page per mutation (Convex allows one paginate
 * per function, and a large user mustn't hit per-mutation limits). Each step
 * schedules the next: purge_tags → last_played → stacks → done. `runAll`
 * walks the users table and starts one run per user. `orphans` is the
 * read-only check DW-04b and DW-04e run before and after.
 *
 * Every function here is internal — run from the Convex dashboard or
 * `npx convex run copyMigration:runAll`. None is callable from a client.
 */

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { copiesOfRelease, pickDefaultCopy } from "./copies";

/** Rows per step. Each tag row costs two index reads, each play one (with a
 *  per-page cache), so this stays far below the per-mutation limits. */
export const MIGRATION_PAGE_SIZE = 200;
/** Session docs carry their member lists, so a smaller page. */
export const MIGRATION_STACK_PAGE_SIZE = 50;
/** Users started per runAll step. */
export const MIGRATION_USER_PAGE_SIZE = 100;
/** Cap on each report list of unresolved release ids; counts stay exact. */
export const UNRESOLVED_LIST_CAP = 1000;

type Phase = "tags" | "plays" | "stacks";
const phaseValidator = v.union(v.literal("tags"), v.literal("plays"), v.literal("stacks"));

type Report = Doc<"copy_migration">;

function emptyReport(username: string, runId: string, now: number): Omit<Report, "_id" | "_creationTime"> {
  const list = { unresolved: 0, unresolved_release_ids: [] as number[], unresolved_truncated: false };
  return {
    discogs_username: username,
    run_id: runId,
    status: "running",
    started_at: now,
    purge_tags: { seen: 0, moved: 0, already: 0, duplicates: 0, ...list },
    plays: { seen: 0, moved: 0, already: 0, ...list },
    sessions: { seen: 0, filled: 0, already: 0, auto: 0, ...list },
  };
}

/** Add release ids to a capped, de-duplicated report list. */
function addUnresolved(
  section: { unresolved_release_ids: number[]; unresolved_truncated: boolean },
  releaseIds: number[]
) {
  for (const r of releaseIds) {
    if (section.unresolved_release_ids.includes(r)) continue;
    if (section.unresolved_release_ids.length >= UNRESOLVED_LIST_CAP) {
      section.unresolved_truncated = true;
      continue;
    }
    section.unresolved_release_ids.push(r);
  }
}

async function getReport(ctx: MutationCtx, username: string): Promise<Report | null> {
  return await ctx.db
    .query("copy_migration")
    .withIndex("by_username", (q) => q.eq("discogs_username", username))
    .first();
}

/** The default copy of each release, memoized for one step. */
function defaultCopyLookup(ctx: MutationCtx, username: string) {
  const memo = new Map<number, number | null>();
  return async (releaseId: number): Promise<number | null> => {
    if (memo.has(releaseId)) return memo.get(releaseId)!;
    const d = pickDefaultCopy(await copiesOfRelease(ctx, username, releaseId));
    const out = d ? d.instanceId : null;
    memo.set(releaseId, out);
    return out;
  };
}

/** Purge verdicts: one page. */
async function migrateTagPage(
  ctx: MutationCtx,
  username: string,
  report: Report,
  cursor: string | null
) {
  const page = await ctx.db
    .query("purge_tags")
    .withIndex("by_username", (q) => q.eq("discogs_username", username))
    .paginate({ numItems: MIGRATION_PAGE_SIZE, cursor });
  const s = report.purge_tags;
  const defaultCopy = defaultCopyLookup(ctx, username);
  const unresolved: number[] = [];

  for (const listed of page.page) {
    s.seen++;
    // Re-read: an earlier row of this page may have changed things.
    const row = await ctx.db.get(listed._id);
    if (!row) continue;
    if (row.instance_id !== undefined) {
      s.already++;
      continue;
    }
    const instanceId = await defaultCopy(row.release_id);
    if (instanceId === null) {
      s.unresolved++;
      unresolved.push(row.release_id);
      continue;
    }
    const siblings = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q.eq("discogs_username", username).eq("release_id", row.release_id)
      )
      .collect();
    // The copy already has a verdict: never give it a second one.
    if (siblings.some((t) => t.instance_id === instanceId)) {
      s.duplicates++;
      continue;
    }
    // Two release-only verdicts for one release (a past race): the newest
    // moves to the copy, the rest stay release-only, untouched.
    const winner = siblings
      .filter((t) => t.instance_id === undefined)
      .reduce((a, b) =>
        b.tagged_at > a.tagged_at || (b.tagged_at === a.tagged_at && b._creationTime > a._creationTime)
          ? b
          : a
      );
    if (winner._id !== row._id) {
      s.duplicates++;
      continue;
    }
    await ctx.db.patch(row._id, { instance_id: instanceId });
    s.moved++;
  }
  addUnresolved(s, unresolved);
  return page;
}

/** Plays: one page. Every play of a release goes to the same one copy. */
async function migratePlayPage(
  ctx: MutationCtx,
  username: string,
  report: Report,
  cursor: string | null
) {
  const page = await ctx.db
    .query("last_played")
    .withIndex("by_username", (q) => q.eq("discogs_username", username))
    .paginate({ numItems: MIGRATION_PAGE_SIZE, cursor });
  const s = report.plays;
  const defaultCopy = defaultCopyLookup(ctx, username);
  const unresolved: number[] = [];

  for (const row of page.page) {
    s.seen++;
    if (row.instance_id !== undefined) {
      s.already++;
      continue;
    }
    const instanceId = await defaultCopy(row.release_id);
    if (instanceId === null) {
      s.unresolved++;
      unresolved.push(row.release_id);
      continue;
    }
    await ctx.db.patch(row._id, { instance_id: instanceId });
    s.moved++;
  }
  addUnresolved(s, unresolved);
  return page;
}

/** Manual sessions without copy_ids: one page. Auto sessions need nothing —
 *  their members are derived, and old release exclusions keep excluding
 *  every copy. */
async function migrateStackPage(
  ctx: MutationCtx,
  username: string,
  report: Report,
  cursor: string | null
) {
  const page = await ctx.db
    .query("stacks")
    .withIndex("by_username", (q) => q.eq("discogs_username", username))
    .paginate({ numItems: MIGRATION_STACK_PAGE_SIZE, cursor });
  const s = report.sessions;
  const defaultCopy = defaultCopyLookup(ctx, username);
  const unresolved: number[] = [];

  for (const stack of page.page) {
    s.seen++;
    if (stack.kind === "auto") {
      s.auto++;
      continue;
    }
    if (stack.copy_ids !== undefined) {
      s.already++;
      continue;
    }
    const copyIds: number[] = [];
    const done = new Set<number>();
    for (const releaseId of stack.album_ids) {
      if (done.has(releaseId)) continue;
      done.add(releaseId);
      const instanceId = await defaultCopy(releaseId);
      if (instanceId === null) {
        // Not owned: invisible today, stays in album_ids, gets no copy.
        s.unresolved++;
        unresolved.push(releaseId);
      } else {
        copyIds.push(instanceId);
      }
    }
    await ctx.db.patch(stack._id, { copy_ids: copyIds });
    s.filled++;
  }
  addUnresolved(s, unresolved);
  return page;
}

const NEXT_PHASE: Record<Phase, Phase | null> = { tags: "plays", plays: "stacks", stacks: null };

/** Run one page of one phase, then schedule the next page or phase. */
async function runStep(
  ctx: MutationCtx,
  username: string,
  runId: string,
  phase: Phase,
  cursor: string | null
) {
  const report = await getReport(ctx, username);
  // Superseded by a newer run (or the report was removed): stop quietly.
  if (!report || report.run_id !== runId || report.status !== "running") return;

  const page =
    phase === "tags"
      ? await migrateTagPage(ctx, username, report, cursor)
      : phase === "plays"
        ? await migratePlayPage(ctx, username, report, cursor)
        : await migrateStackPage(ctx, username, report, cursor);

  const next: { phase: Phase; cursor: string | null } | null = !page.isDone
    ? { phase, cursor: page.continueCursor }
    : NEXT_PHASE[phase]
      ? { phase: NEXT_PHASE[phase]!, cursor: null }
      : null;

  await ctx.db.patch(report._id, {
    purge_tags: report.purge_tags,
    plays: report.plays,
    sessions: report.sessions,
    ...(next === null && { status: "done" as const, ran_at: Date.now() }),
  });
  if (next) {
    await ctx.scheduler.runAfter(0, internal.copyMigration.migrateUserStep, {
      username,
      runId,
      phase: next.phase,
      cursor: next.cursor,
    });
  }
}

/**
 * Start (or restart) the migration for one user. Resets that user's report
 * and runs the first page inline; the rest is scheduled. Idempotent: a second
 * run moves nothing that the first one moved, and a run started while
 * another is going supersedes it (the older chain stops at its next step).
 */
export const migrateUser = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // A run scheduled for an account deleted since (Delete all data) writes
    // nothing: no report for a user who isn't there.
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("discogs_username", args.username))
      .first();
    if (!user) return null;
    const now = Date.now();
    const runId = `${now}-${crypto.randomUUID()}`;
    const fresh = emptyReport(args.username, runId, now);
    const existing = await getReport(ctx, args.username);
    if (existing) await ctx.db.replace(existing._id, fresh);
    else await ctx.db.insert("copy_migration", fresh);
    await runStep(ctx, args.username, runId, "tags", null);
    return runId;
  },
});

/** One scheduled step of a user's run. */
export const migrateUserStep = internalMutation({
  args: {
    username: v.string(),
    runId: v.string(),
    phase: phaseValidator,
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await runStep(ctx, args.username, args.runId, args.phase, args.cursor);
  },
});

/**
 * The driver: start one migrateUser per user in the users table, a page of
 * users at a time. `npx convex run copyMigration:runAll` (dev first).
 */
export const runAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("users")
      .withIndex("by_username")
      .paginate({ numItems: MIGRATION_USER_PAGE_SIZE, cursor: args.cursor ?? null });
    for (const user of page.page) {
      await ctx.scheduler.runAfter(0, internal.copyMigration.migrateUser, {
        username: user.discogs_username,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.copyMigration.runAll, {
        cursor: page.continueCursor,
      });
    }
    return { started: page.page.length, more: !page.isDone };
  },
});

/** The report for one user, or null before their first run. */
export const report = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("copy_migration")
      .withIndex("by_username", (q) => q.eq("discogs_username", args.username))
      .first();
  },
});

/**
 * Everything of one user's that isn't on a cached copy, with release ids:
 *   - `releaseOnly`: rows with no instance id (not migrated, or the release
 *     wasn't owned when the migration ran);
 *   - `missingCopy`: rows naming a copy the cache no longer holds (it left
 *     the collection — its history stays, findable by release).
 * Sessions: copy_ids entries not cached, and album_ids releases with no copy.
 * Read-only. DW-04b and DW-04e run it before and after their steps; growth
 * between runs is the thing to look for.
 */
export const orphans = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = args.username;
    const rows = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", username))
      .collect();
    const cachedInstances = new Set(rows.map((r) => r.instanceId));
    const cachedReleases = new Set(rows.map((r) => r.releaseId));

    const split = (items: { release_id: number; instance_id?: number }[]) => {
      const releaseOnly: number[] = [];
      const missingCopy: { release_id: number; instance_id: number }[] = [];
      for (const x of items) {
        if (x.instance_id === undefined) releaseOnly.push(x.release_id);
        else if (!cachedInstances.has(x.instance_id))
          missingCopy.push({ release_id: x.release_id, instance_id: x.instance_id });
      }
      return { releaseOnly, missingCopy };
    };

    const tags = await ctx.db
      .query("purge_tags")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    const plays = await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    const stacks = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();

    const sessions: {
      stack_id: string;
      missingCopies: number[];
      releasesWithoutCopy: number[];
    }[] = [];
    for (const s of stacks) {
      if (s.kind === "auto") continue;
      const missingCopies = (s.copy_ids ?? []).filter((c) => !cachedInstances.has(c));
      const releasesWithoutCopy = s.album_ids.filter((r) => !cachedReleases.has(r));
      if (missingCopies.length || releasesWithoutCopy.length || s.copy_ids === undefined) {
        sessions.push({ stack_id: s.stack_id, missingCopies, releasesWithoutCopy });
      }
    }

    const t = split(tags);
    const p = split(plays);
    return {
      purgeTags: { total: tags.length, ...t },
      plays: {
        total: plays.length,
        releaseOnly: p.releaseOnly.length,
        releaseOnlyReleaseIds: [...new Set(p.releaseOnly)],
        missingCopy: p.missingCopy.length,
        missingCopyReleaseIds: [...new Set(p.missingCopy.map((x) => x.release_id))],
      },
      sessions,
      sessionsNotMigrated: stacks.filter((s) => s.kind !== "auto" && s.copy_ids === undefined).length,
    };
  },
});
