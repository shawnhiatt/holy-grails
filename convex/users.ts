import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, TableNames } from "./_generated/dataModel";
import {
  authenticateUser,
  isSessionRowExpired,
  resolveSession,
  SESSION_RENEW_AFTER_MS,
  sessionLastActive,
} from "./authHelper";

/**
 * Bootstrap query for session restore on cold load.
 *
 * Resolves the session token stored in the client's localStorage (sessions
 * table, with legacy single-token fallback). Returns the user record WITHOUT
 * OAuth tokens (and without echoing the session token back), or null if the
 * token is invalid, expired, or not found.
 */
export const getLatestUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveSession(ctx, args.sessionToken);
    if (!user) return null;
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      discogs_username: user.discogs_username,
      discogs_avatar_url: user.discogs_avatar_url,
      created_at: user.created_at,
      last_synced_at: user.last_synced_at,
      collection_value: user.collection_value,
      collection_value_synced_at: user.collection_value_synced_at,
      shareActivity: user.shareActivity,
      last_collection_count: user.last_collection_count,
      last_wantlist_count: user.last_wantlist_count,
      collection_private: user.collection_private,
      wantlist_private: user.wantlist_private,
    };
  },
});

/**
 * Authenticated query: returns current user's info WITHOUT OAuth tokens.
 */
export const getMe = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      discogs_username: user.discogs_username,
      discogs_avatar_url: user.discogs_avatar_url,
      created_at: user.created_at,
      last_synced_at: user.last_synced_at,
      collection_value: user.collection_value,
      collection_value_synced_at: user.collection_value_synced_at,
      shareActivity: user.shareActivity,
      last_collection_count: user.last_collection_count,
      last_wantlist_count: user.last_wantlist_count,
      collection_private: user.collection_private,
      wantlist_private: user.wantlist_private,
    };
  },
});

/**
 * Create or update a user record during OAuth login.
 *
 * INTERNAL ONLY — callable exclusively from oauth.completeLogin, which
 * derives discogs_username server-side from the Discogs /oauth/identity
 * endpoint. This function must never be exposed publicly: a public variant
 * would let any caller claim any username and receive a session token for
 * that user (full takeover of their Holy Grails data).
 *
 * Every login mints a FRESH token as a new sessions-table row (rotation),
 * so one device's login never reuses or invalidates another device's
 * session. Expired session rows for this user are pruned while we're here.
 */
export const upsert = internalMutation({
  args: {
    discogs_username: v.string(),
    discogs_avatar_url: v.optional(v.string()),
    access_token: v.string(),
    token_secret: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .first();

    const is_new = !existing;
    const sessionToken = crypto.randomUUID();
    const now = Date.now();

    // Prune expired session rows for this user
    const sessions = await ctx.db
      .query("auth_sessions")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
    for (const s of sessions) {
      if (isSessionRowExpired(s, now)) await ctx.db.delete(s._id);
    }

    await ctx.db.insert("auth_sessions", {
      session_token: sessionToken,
      discogs_username: args.discogs_username,
      created_at: now,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        access_token: args.access_token,
        token_secret: args.token_secret,
        discogs_avatar_url: args.discogs_avatar_url,
      });
      return { _id: existing._id, session_token: sessionToken, is_new };
    }

    const id = await ctx.db.insert("users", {
      discogs_username: args.discogs_username,
      discogs_avatar_url: args.discogs_avatar_url,
      access_token: args.access_token,
      token_secret: args.token_secret,
      created_at: now,
    });
    return { _id: id, session_token: sessionToken, is_new };
  },
});

export const setShareActivity = mutation({
  args: { sessionToken: v.string(), shareActivity: v.boolean() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    await ctx.db.patch(user._id, { shareActivity: args.shareActivity });
  },
});

export const updateLastSynced = mutation({
  args: {
    sessionToken: v.string(),
    // Raw Discogs counts observed during this sync, persisted so the next
    // cold load's probe can detect whether anything changed.
    collectionCount: v.optional(v.number()),
    wantlistCount: v.optional(v.number()),
    // Discogs privacy state observed this sync (403 = "browse" turned off).
    collectionPrivate: v.optional(v.boolean()),
    wantlistPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const patch: {
      last_synced_at: number;
      last_collection_count?: number;
      last_wantlist_count?: number;
      collection_private?: boolean;
      wantlist_private?: boolean;
    } = { last_synced_at: Date.now() };
    if (args.collectionCount !== undefined) patch.last_collection_count = args.collectionCount;
    if (args.wantlistCount !== undefined) patch.last_wantlist_count = args.wantlistCount;
    if (args.collectionPrivate !== undefined) patch.collection_private = args.collectionPrivate;
    if (args.wantlistPrivate !== undefined) patch.wantlist_private = args.wantlistPrivate;
    await ctx.db.patch(user._id, patch);
  },
});

export const updateCollectionValue = mutation({
  args: {
    sessionToken: v.string(),
    collection_value: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    await ctx.db.patch(user._id, {
      collection_value: args.collection_value,
      collection_value_synced_at: Date.now(),
    });
  },
});

/**
 * Renew the calling device's session, so its 90 days count from its last use
 * rather than from login. The client calls this whenever the app opens or
 * comes back to the foreground; it writes at most once a day per device.
 *
 * It cannot revive a session that has already expired: that one is
 * rejected like any other bad token and the device signs in again. Legacy
 * single-token sessions are not renewed; every one of them is past its 90
 * days already.
 */
export const touchSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = args.sessionToken
      ? await ctx.db
          .query("auth_sessions")
          .withIndex("by_token", (q) => q.eq("session_token", args.sessionToken))
          .first()
      : null;
    if (!session || isSessionRowExpired(session, now)) throw new Error("Unauthorized");
    if (now - sessionLastActive(session) < SESSION_RENEW_AFTER_MS) return;
    await ctx.db.patch(session._id, { last_seen_at: now });
  },
});

export const clearSession = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    // Look up directly instead of authenticateUser — sign-out must succeed
    // even if the token is stale or expired.
    if (!args.sessionToken) return;

    // Sessions-table path: sign out THIS device only. Other devices' rows
    // and the user record (OAuth tokens, sync metadata, caches) stay put,
    // so the next login boots instantly from cache.
    const session = await ctx.db
      .query("auth_sessions")
      .withIndex("by_token", (q) => q.eq("session_token", args.sessionToken))
      .first();
    if (session) {
      await ctx.db.delete(session._id);
      return;
    }

    // Legacy single-token path: clear the fields rather than deleting the
    // whole user record (the old behavior destroyed OAuth tokens and sync
    // metadata on every sign-out).
    const user = await ctx.db
      .query("users")
      .withIndex("by_session_token", (q) =>
        q.eq("session_token", args.sessionToken)
      )
      .first();
    if (!user) return; // already signed out or token invalid — nothing to do
    await ctx.db.patch(user._id, {
      session_token: undefined,
      session_created_at: undefined,
    });
  },
});

/**
 * Authenticated query: given a list of Discogs usernames (the viewer's
 * followed users), return the subset registered as Holy Grails users with
 * shareActivity === true.
 */
export const getHolyGrailsUsers = query({
  args: {
    sessionToken: v.string(),
    usernames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await authenticateUser(ctx, args.sessionToken);
    if (args.usernames.length === 0) return [];
    const results: { discogs_username: string; discogs_avatar_url: string | undefined }[] = [];
    for (const username of args.usernames) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("discogs_username", username))
        .first();
      if (user && user.shareActivity === true) {
        results.push({
          discogs_username: user.discogs_username,
          discogs_avatar_url: user.discogs_avatar_url,
        });
      }
    }
    return results;
  },
});

// ─── Delete all data, in pages ───
//
// Delete all data used to remove everything in ONE transaction, which fails
// outright once an account outgrows Convex's per-mutation limits (32,000
// documents read, 16,000 written — and followed_items holds every followed
// user's whole collection). It now deletes in steps of at most
// USER_DELETE_BATCH documents; a step that runs out of budget schedules the
// next one. The model is the chunked sync write (syncCacheInChunks in
// cacheRows.ts) — do not fold this back into one mutation.
//
// Partial failure is safe because of the ORDER: every step walks the tables
// from the top, and the sessions and the user row come last and are only
// reached once every table above them has been seen empty in that same
// transaction. A chain that stops partway leaves the account signed in, so
// running Delete all data again picks up where it stopped. Every query is
// keyed on the caller's own username; nothing else is read or deleted.

/** Documents one step may delete. Far under the per-mutation limits. */
export const USER_DELETE_BATCH = 1000;
/** Tables whose rows are large (feed snapshots carry 50 albums, bug reports
 *  carry diagnostics) take smaller bites so a step stays well under the 16 MiB
 *  read limit. */
const HEAVY_ROW_BATCH = 100;
/** Safety valve: a chain this long means something keeps writing rows for
 *  the account. It stops; the account is still signed in to re-run it. */
const MAX_DELETE_STEPS = 1000;

async function deleteRows(
  ctx: MutationCtx,
  rows: { _id: Id<TableNames> }[]
): Promise<number> {
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

/** One entry per table, in deletion order. `take(n)` deletes up to n of the
 *  user's rows and returns how many it deleted. auth_sessions is last. */
const USER_DATA_TABLES: {
  cap: number;
  take: (ctx: MutationCtx, username: string, n: number) => Promise<number>;
}[] = [
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("purge_tags").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: HEAVY_ROW_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("stacks").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("last_played").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("want_priorities").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("following").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("wantlist").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("preferences").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    // camelCase field on this table
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("collection").withIndex("by_username", (q) => q.eq("discogsUsername", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(
        ctx,
        await ctx.db
          .query("collection_removals")
          .withIndex("by_username_and_removedAt", (q) => q.eq("discogsUsername", u))
          .take(n)
      ),
  },
  {
    cap: HEAVY_ROW_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("following_feed").withIndex("by_follower", (q) => q.eq("follower_username", u)).take(n)),
  },
  {
    // Every followed user's collection and wantlist: the big one.
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(
        ctx,
        await ctx.db
          .query("followed_items")
          .withIndex("by_follower_followed", (q) => q.eq("follower_username", u))
          .take(n)
      ),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("sync_status").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("cover_scans").withIndex("by_username_at", (q) => q.eq("discogs_username", u)).take(n)),
  },
  {
    // Bug reports and their screenshots (Settings promises this removes
    // everything on our side — reports carry the reporter's username).
    cap: HEAVY_ROW_BATCH,
    take: async (ctx, u, n) => {
      const rows = await ctx.db
        .query("bug_reports")
        .withIndex("by_username", (q) => q.eq("discogs_username", u))
        .take(n);
      for (const row of rows) {
        if (row.screenshot_id) await ctx.storage.delete(row.screenshot_id);
        await ctx.db.delete(row._id);
      }
      return rows.length;
    },
  },
  {
    // Every device's session. Second to last, so an unfinished delete can
    // still be re-run from the device that started it.
    cap: USER_DELETE_BATCH,
    take: async (ctx, u, n) =>
      deleteRows(ctx, await ctx.db.query("auth_sessions").withIndex("by_username", (q) => q.eq("discogs_username", u)).take(n)),
  },
];

/**
 * Delete up to USER_DELETE_BATCH of the user's documents. Returns true once
 * everything is gone, the user record included.
 */
async function deleteUserDataStep(ctx: MutationCtx, username: string): Promise<boolean> {
  let budget = USER_DELETE_BATCH;
  for (const table of USER_DATA_TABLES) {
    const want = Math.min(budget, table.cap);
    const deleted = await table.take(ctx, username, want);
    budget -= deleted;
    // A full bite means the table may hold more, or the budget is spent.
    // Either way the next step starts again from the top.
    if (deleted === want) return false;
  }
  // Every table above was seen empty in this transaction: the user record
  // (which also carries the legacy single-token session fields) goes last.
  const users = await ctx.db
    .query("users")
    .withIndex("by_username", (q) => q.eq("discogs_username", username))
    .take(budget);
  await deleteRows(ctx, users);
  return users.length < budget;
}

/**
 * Delete all user data across every Convex table — purge tags, sessions
 * (`stacks`), plays, want priorities, following, the feed and followed
 * collections caches, collection and wantlist caches, preferences, sync
 * status, cover-scan quota, bug reports, every device's session, and the user
 * record itself.
 *
 * Same name, arguments and (empty) return as before. A typical account is
 * gone when this returns; a larger one finishes in scheduled steps a few
 * seconds later (see the section comment above). The caller's session stays
 * valid until the very last step, so calling this again resumes a run that
 * stopped.
 */
export const deleteAllUserData = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const username = user.discogs_username;
    if (!(await deleteUserDataStep(ctx, username))) {
      await ctx.scheduler.runAfter(0, internal.users.continueDeleteAllUserData, {
        username,
        step: 1,
      });
    }
  },
});

/** The scheduled rest of deleteAllUserData. Internal: it takes a username. */
export const continueDeleteAllUserData = internalMutation({
  args: { username: v.string(), step: v.number() },
  handler: async (ctx, args) => {
    if (await deleteUserDataStep(ctx, args.username)) return;
    if (args.step >= MAX_DELETE_STEPS) {
      console.error(`deleteAllUserData: stopped after ${args.step} steps`);
      return;
    }
    await ctx.scheduler.runAfter(0, internal.users.continueDeleteAllUserData, {
      username: args.username,
      step: args.step + 1,
    });
  },
});
