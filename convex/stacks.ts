import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { authenticateUser } from "./authHelper";
import {
  assertInstanceIds,
  findCopy,
  foldByCopy,
  loadDefaultCopies,
  loadReleaseOfCopies,
  rebuildCopyIds,
  releaseIdsForCopies,
} from "./copies";
import { evaluateStackRule, type RuleAlbum, type StackRule } from "./stackRules";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

/**
 * A session's saved query. Loose `field`/`op` strings so a new operator ships
 * without a schema deploy — the pure evaluator in stackRules.ts ignores what
 * it doesn't recognize.
 */
const ruleValidator = v.object({
  match: v.union(v.literal("all"), v.literal("any")),
  conditions: v.array(
    v.object({
      field: v.string(),
      op: v.string(),
      value: v.optional(v.any()),
    })
  ),
  sort: v.string(),
  limit: v.optional(v.number()),
  rotation: v.union(v.literal("off"), v.literal("daily"), v.literal("weekly")),
});

/**
 * A manual session's members, both ways (DW-04: sessions hold copies). Until
 * the DW-04f cleanup every write stores `album_ids` (release ids, what old
 * clients read) and `copy_ids` (instance ids) together, so an old build and a
 * new one can't drift apart:
 *   - sent `copy_ids` (a new client): store them, and set `album_ids` to their
 *     releases in order of first appearance;
 *   - sent only `album_ids` (an old client): keep the copies already held
 *     whose release is still listed, and add the default copy of each newly
 *     listed release (copies.ts rebuildCopyIds).
 */
async function membersFromCopies(ctx: QueryCtx, username: string, copyIds: number[]) {
  assertInstanceIds(copyIds);
  const releaseOf = await loadReleaseOfCopies(ctx, username, copyIds);
  return { copy_ids: copyIds, album_ids: releaseIdsForCopies(copyIds, releaseOf) };
}

async function membersFromReleases(
  ctx: QueryCtx,
  username: string,
  albumIds: number[],
  existingCopyIds: number[]
) {
  const releaseOf = await loadReleaseOfCopies(ctx, username, existingCopyIds);
  const defaults = await loadDefaultCopies(ctx, username, albumIds);
  return {
    album_ids: albumIds,
    copy_ids: rebuildCopyIds(existingCopyIds, albumIds, releaseOf, defaults),
  };
}

export const create = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
    // Session Builder. Omitted entirely for a hand-filled session, which is
    // why `kind` is optional rather than defaulted — undefined reads manual.
    kind: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
    rule: v.optional(ruleValidator),
    name_generated: v.optional(v.string()),
    // Every copy (DW-04): the members as copy instance ids. When sent it wins
    // and album_ids is derived from it; old clients send album_ids only.
    copy_ids: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const now = Date.now();
    // An auto session stores no ids: membership is derived from the rule at
    // read time, so a cached copy here would be a second source of truth
    // that drifts the moment the collection changes.
    const members =
      args.kind === "auto"
        ? { album_ids: [] as number[] }
        : args.copy_ids !== undefined
          ? await membersFromCopies(ctx, user.discogs_username, args.copy_ids)
          : await membersFromReleases(ctx, user.discogs_username, args.album_ids, []);
    return await ctx.db.insert("stacks", {
      discogs_username: user.discogs_username,
      stack_id: args.stack_id,
      name: args.name,
      ...members,
      created_at: now,
      last_modified: now,
      ...(args.kind && { kind: args.kind }),
      ...(args.rule && { rule: args.rule }),
      ...(args.name_generated && { name_generated: args.name_generated }),
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    name: v.optional(v.string()),
    album_ids: v.optional(v.array(v.number())),
    rule: v.optional(ruleValidator),
    excluded_ids: v.optional(v.array(v.number())),
    name_generated: v.optional(v.string()),
    // Every copy (DW-04). copy_ids: a manual session's members as copies
    // (wins over album_ids). excluded_copy_ids: copies kicked out of an auto
    // session (new removals; excluded_ids keeps its whole-release meaning).
    copy_ids: v.optional(v.array(v.number())),
    excluded_copy_ids: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (!existing) {
      throw new Error(`Stack ${args.stack_id} not found`);
    }

    const updates: Record<string, unknown> = { last_modified: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    // An auto session's membership is derived from its rule and never stored
    // (see create). The client refuses to hand-add to one, but this is the
    // server-side backstop: album_ids sent for an auto session are ignored
    // rather than written as a stale second source of truth. freeze is the
    // one path that turns an auto session into stored ids.
    if (existing.kind !== "auto") {
      if (args.copy_ids !== undefined) {
        Object.assign(updates, await membersFromCopies(ctx, user.discogs_username, args.copy_ids));
      } else if (args.album_ids !== undefined) {
        Object.assign(
          updates,
          await membersFromReleases(ctx, user.discogs_username, args.album_ids, existing.copy_ids ?? [])
        );
      }
    }
    if (args.rule !== undefined) updates.rule = args.rule;
    if (args.excluded_ids !== undefined) updates.excluded_ids = args.excluded_ids;
    if (args.excluded_copy_ids !== undefined) {
      assertInstanceIds(args.excluded_copy_ids);
      updates.excluded_copy_ids = args.excluded_copy_ids;
    }
    if (args.name_generated !== undefined) updates.name_generated = args.name_generated;

    await ctx.db.patch(existing._id, updates);
    return existing._id;
  },
});

/**
 * Freeze an auto session: materialize the records it currently plays into
 * `album_ids` and drop the rule, leaving an ordinary hand-filled session.
 *
 * The caller passes the ids because it has already evaluated the rule for
 * display — re-deriving them here would mean duplicating the client's purge
 * tags and play history server-side, and could disagree with what the user is
 * looking at. This is the "I love today's roll — keep it" escape hatch from
 * rotation, and it is deliberately one-way: unfreezing is just building a new
 * rule.
 */
export const freeze = mutation({
  args: {
    sessionToken: v.string(),
    stack_id: v.string(),
    album_ids: v.array(v.number()),
    // Every copy (DW-04): the evaluated set as copies. When sent it wins and
    // album_ids is derived from it; without it each release's default copy.
    copy_ids: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (!existing) {
      throw new Error(`Stack ${args.stack_id} not found`);
    }

    const members =
      args.copy_ids !== undefined
        ? await membersFromCopies(ctx, user.discogs_username, args.copy_ids)
        : await membersFromReleases(ctx, user.discogs_username, args.album_ids, []);
    await ctx.db.patch(existing._id, {
      ...members,
      kind: "manual",
      rule: undefined,
      excluded_ids: undefined,
      excluded_copy_ids: undefined,
      name_generated: undefined,
      last_modified: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Everything an auto session's rule can key on, loaded for one user: their
 * collection rows plus the purge tags and play history folded in from their own
 * tables. The single loading path behind both getShared (a viewer of a link)
 * and getMembership (the owner, natively), so the two cannot disagree about
 * what a rule sees.
 */
async function loadRuleAlbums(ctx: QueryCtx, username: string) {
  const rows = await ctx.db
    .query("collection")
    .withIndex("by_username", (q) =>
      q.eq("discogsUsername", username)
    )
    .collect();

  // Purge tags and play history live in their own tables; a rule can key
  // on either, so they are folded in the same way the client does.
  const tags = await ctx.db
    .query("purge_tags")
    .withIndex("by_username", (q) =>
      q.eq("discogs_username", username)
    )
    .collect();

  const plays = await ctx.db
    .query("last_played")
    .withIndex("by_username", (q) =>
      q.eq("discogs_username", username)
    )
    .collect();
  // Per copy (DW-04): a row with an instance id belongs to that copy, a
  // release-only row to the release's default copy — identical to the old
  // by-release fold while the cache holds one copy per release.
  const fold = foldByCopy(rows, tags, plays);

  // Market values are deliberately NOT loaded here. The client's rule
  // input (app-context's ruleAlbums) carries no market value — it lives in
  // the lazily-loaded Insights query — so a marketValue condition matches
  // nothing for the owner. Loading it here would make the share link show
  // a different set than the owner sees, and it took an unindexed read of
  // the whole shared market_values table on a public endpoint. The builder
  // offers no price field today; wire market values into BOTH sides
  // together if one is ever added.
  const ruleAlbums: RuleAlbum[] = rows.map((row) => ({
    releaseId: row.releaseId,
    instanceId: row.instanceId,
    artist: row.artist,
    artistIds: row.artistIds,
    title: row.title,
    label: row.label,
    year: row.year,
    genres: row.genres,
    styles: row.styles,
    format: row.format,
    folder: row.folder,
    mediaCondition: row.mediaCondition,
    rating: row.rating,
    dateAdded: row.dateAdded,
    purgeTag: fold.get(row.instanceId)?.purgeTag ?? null,
    lastPlayedAt: fold.get(row.instanceId)?.lastPlayedAt ?? null,
    playCount: fold.get(row.instanceId)?.playCount ?? 0,
  }));
  return { rows, ruleAlbums };
}

// ── Session sharing (capability-token share links) ──
// See the Sessions naming note in CLAUDE.md: internal identifiers stay
// stack*/share*; user-facing copy says "Session".

/**
 * Turn on a public share link for a session. Idempotent — returns the
 * existing share_id if one is already set. The share_id is unguessable
 * (128-bit, crypto-random) and IS the capability that grants read access.
 */
export const enableShare = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (!existing) {
      throw new Error(`Stack ${args.stack_id} not found`);
    }
    if (existing.share_id) {
      return existing.share_id;
    }

    // 32 hex chars = 128 bits of entropy — unguessable.
    const shareId = crypto.randomUUID().replace(/-/g, "");
    await ctx.db.patch(existing._id, { share_id: shareId });
    return shareId;
  },
});

/** Revoke a session's share link. */
export const disableShare = mutation({
  args: { sessionToken: v.string(), stack_id: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .filter((q) => q.eq(q.field("stack_id"), args.stack_id))
      .first();

    if (existing && existing.share_id) {
      await ctx.db.patch(existing._id, { share_id: undefined });
    }
  },
});

/**
 * Public read of a shared session. Deliberately UNAUTHENTICATED — the
 * unguessable share_id is the capability. Mirrors the Cross-User Data
 * Pattern's "null for not-found and not-shared alike": returns null for an
 * unknown/revoked share_id.
 *
 * Returns ONLY the whitelisted display fields. Never exposes
 * discogs_username, release ids, purge tags, notes, conditions, price paid,
 * or any token. Albums that have left the collection since sharing are
 * silently skipped.
 */
export const getShared = query({
  args: { share_id: v.string() },
  handler: async (ctx, args) => {
    if (!args.share_id) return null;

    const stack = await ctx.db
      .query("stacks")
      .withIndex("by_share_id", (q) => q.eq("share_id", args.share_id))
      .first();

    if (!stack) return null;

    /** The whitelist. Adding a field here widens what a link exposes. */
    const display = (row: {
      title: string;
      artist: string;
      year: number;
      cover: string;
      thumb?: string;
    }) => ({
      title: row.title,
      artist: row.artist,
      year: row.year,
      cover: row.cover,
      thumb: row.thumb ?? null,
    });

    // ── An auto session has no stored ids: evaluate its rule server-side ──
    //
    // This is the reason the free-data pass wrote genres and rating into the
    // Convex table rather than only onto the client `Album` type. The pure
    // evaluator runs over both shapes, so a shared link shows exactly what
    // the owner sees — including the same rotation roll, since the seeded
    // bucket is a function of the session id and the clock, not of state.
    if (stack.kind === "auto" && stack.rule) {
      const { rows, ruleAlbums } = await loadRuleAlbums(ctx, stack.discogs_username);

      const result = evaluateStackRule(ruleAlbums, stack.rule as StackRule, {
        stackId: stack.stack_id,
        excludedIds: stack.excluded_ids,
        excludedCopyIds: stack.excluded_copy_ids,
      });

      const byInstance = new Map(rows.map((r) => [r.instanceId, r]));
      return {
        name: stack.name,
        last_modified: stack.last_modified,
        albums: result.albums
          .map((a) => byInstance.get(a.instanceId!))
          .filter((r): r is NonNullable<typeof r> => !!r)
          .map(display),
      };
    }

    const albums: ReturnType<typeof display>[] = [];

    // A migrated manual session holds copies; one that isn't yet (copy_ids
    // unset) is read by release, as before.
    if (stack.copy_ids !== undefined) {
      for (const instanceId of stack.copy_ids) {
        const row = await findCopy(ctx, stack.discogs_username, instanceId);
        // Silently skip copies that have left the collection since sharing.
        if (!row) continue;
        albums.push(display(row));
      }
      return {
        name: stack.name,
        last_modified: stack.last_modified,
        albums,
      };
    }

    for (const releaseId of stack.album_ids) {
      const row = await ctx.db
        .query("collection")
        .withIndex("by_username_and_release", (q) =>
          q
            .eq("discogsUsername", stack.discogs_username)
            .eq("releaseId", releaseId)
        )
        .first();
      // Silently skip albums that have left the collection since sharing.
      if (!row) continue;
      albums.push(display(row));
    }

    return {
      name: stack.name,
      last_modified: stack.last_modified,
      albums,
    };
  },
});

/**
 * What each of the caller's auto sessions plays right now, keyed by stack_id.
 * The native app's twin of the PWA's client-side evaluation: rules don't run on
 * a phone, so it subscribes to this instead. Same evaluator and the same
 * loading path as getShared, so the owner and a link viewer see one set.
 *
 * Rotation is clock-derived, and Convex re-runs a query when the data it read
 * changes, not when time passes — a re-subscription can be handed the cached
 * result from before the early-morning flip. `hour` exists only to defeat
 * that: a new argument value is a new query, so it evaluates fresh.
 *
 * The contract: `hour` is the device's current UTC hour as "YYYY-MM-DDTHH"
 * (e.g. "2026-10-17T10"), sent on every subscription. Every rotation flip
 * lands on a UTC hour boundary — daily at 10:00 UTC (ROTATION_OFFSET_MS), and
 * weekly at the same hour on Thursdays (the epoch fell on one) — so the value
 * changes at or after every flip without the client porting rotationBucket.
 * It costs one fresh evaluation per hour per subscriber.
 *
 * The value is never read. Which records rotate in is decided by the server's
 * own clock, so a stale, skewed or invented value can only cost a cache miss.
 * A device clock running fast can change the value before the server flips,
 * caching the old set until the next hour; that is the accepted edge.
 * Optional, because the shipped native build calls this without it.
 */
export const getMembership = query({
  args: { sessionToken: v.string(), hour: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const stacks = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();

    // `ids` are release ids (what shipped builds read, until DW-04f);
    // `copyIds` are the same entries as copy instance ids, in the same order.
    const out: Record<
      string,
      { ids: number[]; copyIds: number[]; poolSize: number; rotating: boolean }
    > = {};
    const autos = stacks.filter((s) => s.kind === "auto" && s.rule);
    if (autos.length === 0) return out;

    const { ruleAlbums } = await loadRuleAlbums(ctx, user.discogs_username);
    for (const stack of autos) {
      const result = evaluateStackRule(ruleAlbums, stack.rule as StackRule, {
        stackId: stack.stack_id,
        excludedIds: stack.excluded_ids,
        excludedCopyIds: stack.excluded_copy_ids,
      });
      out[stack.stack_id] = {
        ids: result.albums.map((a) => a.releaseId),
        copyIds: result.albums.map((a) => a.instanceId!),
        poolSize: result.poolSize,
        rotating: result.rotating,
      };
    }
    return out;
  },
});

/**
 * What an unsaved rule would play, evaluated against the caller's own
 * collection: the native Session Builder's live match count. The PWA runs the
 * same evaluation client-side (app-context's previewStackRule); rules don't run
 * on a phone, so the native app asks here. Same loading path and evaluator as
 * getMembership and getShared, so the count can't disagree with what the saved
 * session ends up holding.
 *
 * Rotation seed: an unsaved rule has no stack_id, so it seeds with "preview" —
 * the PWA's previewStackRule does the same. `poolSize` and `rotating` never
 * depend on the seed, so they always agree with the saved session; `ids` agree
 * only when the rule doesn't rotate, or when `stackId` is passed. Pass
 * `stackId` when editing an existing session (its excluded_ids are applied
 * too, if it is the caller's), or with the id a new session is about to be
 * created under — `create` takes a client-chosen stack_id — so the preview
 * shows the exact rotation roll the session will open with. A stackId the
 * caller doesn't own only changes the seed; nothing of another user's is read.
 *
 * `hour` is getMembership's cache-buster, same contract: the device's current
 * UTC hour as "YYYY-MM-DDTHH", never read. Additive — the PWA never calls this.
 */
export const previewRule = query({
  args: {
    sessionToken: v.string(),
    rule: ruleValidator,
    hour: v.optional(v.string()),
    stackId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);

    let excludedIds: number[] | undefined;
    let excludedCopyIds: number[] | undefined;
    if (args.stackId) {
      const stack = await ctx.db
        .query("stacks")
        .withIndex("by_username", (q) =>
          q.eq("discogs_username", user.discogs_username)
        )
        .filter((q) => q.eq(q.field("stack_id"), args.stackId))
        .first();
      excludedIds = stack?.excluded_ids;
      excludedCopyIds = stack?.excluded_copy_ids;
    }

    const { ruleAlbums } = await loadRuleAlbums(ctx, user.discogs_username);
    const result = evaluateStackRule(ruleAlbums, args.rule as StackRule, {
      stackId: args.stackId || "preview",
      excludedIds,
      excludedCopyIds,
    });
    return {
      poolSize: result.poolSize,
      ids: result.albums.map((a) => a.releaseId),
      copyIds: result.albums.map((a) => a.instanceId!),
      rotating: result.rotating,
    };
  },
});
