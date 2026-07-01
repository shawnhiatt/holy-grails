import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authenticateUser, resolveSession, SESSION_TTL_MS } from "./authHelper";

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
      .query("sessions")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", args.discogs_username)
      )
      .collect();
    for (const s of sessions) {
      if (now - s.created_at >= SESSION_TTL_MS) await ctx.db.delete(s._id);
    }

    await ctx.db.insert("sessions", {
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
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const patch: {
      last_synced_at: number;
      last_collection_count?: number;
      last_wantlist_count?: number;
    } = { last_synced_at: Date.now() };
    if (args.collectionCount !== undefined) patch.last_collection_count = args.collectionCount;
    if (args.wantlistCount !== undefined) patch.last_wantlist_count = args.wantlistCount;
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
      .query("sessions")
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

/**
 * Delete all user data across every Convex table.
 * Nuclear option — wipes purge tags, stacks, last played, want priorities,
 * following, following feed, collection cache, wantlist cache, preferences,
 * and the user record itself.
 */
export const deleteAllUserData = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const username = user.discogs_username;

    // Purge tags
    const purgeTags = await ctx.db
      .query("purge_tags")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of purgeTags) await ctx.db.delete(row._id);

    // Stacks
    const stacks = await ctx.db
      .query("stacks")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of stacks) await ctx.db.delete(row._id);

    // Last played
    const lastPlayed = await ctx.db
      .query("last_played")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of lastPlayed) await ctx.db.delete(row._id);

    // Want priorities
    const wantPriorities = await ctx.db
      .query("want_priorities")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of wantPriorities) await ctx.db.delete(row._id);

    // Following
    const following = await ctx.db
      .query("following")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of following) await ctx.db.delete(row._id);

    // Wantlist
    const wantlist = await ctx.db
      .query("wantlist")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of wantlist) await ctx.db.delete(row._id);

    // Preferences
    const preferences = await ctx.db
      .query("preferences")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of preferences) await ctx.db.delete(row._id);

    // Collection (camelCase field)
    const collection = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", username))
      .collect();
    for (const row of collection) await ctx.db.delete(row._id);

    // Following feed
    const followingFeed = await ctx.db
      .query("following_feed")
      .withIndex("by_follower", (q) => q.eq("follower_username", username))
      .collect();
    for (const row of followingFeed) await ctx.db.delete(row._id);

    // Followed collections cache
    const followedItems = await ctx.db
      .query("followed_items")
      .withIndex("by_follower_followed", (q) =>
        q.eq("follower_username", username)
      )
      .collect();
    for (const row of followedItems) await ctx.db.delete(row._id);

    // Sync status
    const syncStatus = await ctx.db
      .query("sync_status")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of syncStatus) await ctx.db.delete(row._id);

    // All sessions (every device)
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of sessions) await ctx.db.delete(row._id);

    // Delete the user record itself
    await ctx.db.delete(user._id);
  },
});
