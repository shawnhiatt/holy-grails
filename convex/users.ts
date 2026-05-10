import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";

/**
 * Bootstrap query for session restore on cold load.
 *
 * Looks up a user by session_token stored in the client's localStorage.
 * Returns the user record WITHOUT OAuth tokens, or null if the token is
 * invalid / not found. Never returns a record based on insertion order.
 */
export const getLatestUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_session_token", (q) =>
        q.eq("session_token", args.sessionToken)
      )
      .first();
    if (!user) return null;
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      discogs_username: user.discogs_username,
      discogs_avatar_url: user.discogs_avatar_url,
      session_token: user.session_token,
      created_at: user.created_at,
      last_synced_at: user.last_synced_at,
      collection_value: user.collection_value,
      collection_value_synced_at: user.collection_value_synced_at,
      shareActivity: user.shareActivity,
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
    };
  },
});

/**
 * Create or update a user record during OAuth login.
 *
 * Intentionally unauthenticated — called after OAuth completes, before
 * a session token exists. Reuses the existing session_token for returning
 * users (idempotent across double-fired callbacks). Only generates a new
 * token for genuinely new users.
 */
export const upsert = mutation({
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

    // Reuse existing session token if the user already has one (idempotent
    // across double-fired OAuth callbacks in React StrictMode / HMR).
    // Only generate a fresh token for genuinely new users.
    const sessionToken = existing?.session_token ?? crypto.randomUUID();

    if (existing) {
      await ctx.db.patch(existing._id, {
        access_token: args.access_token,
        token_secret: args.token_secret,
        discogs_avatar_url: args.discogs_avatar_url,
        session_token: sessionToken,
      });
      return { _id: existing._id, session_token: sessionToken, is_new };
    }

    const id = await ctx.db.insert("users", {
      discogs_username: args.discogs_username,
      discogs_avatar_url: args.discogs_avatar_url,
      access_token: args.access_token,
      token_secret: args.token_secret,
      session_token: sessionToken,
      created_at: Date.now(),
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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    await ctx.db.patch(user._id, { last_synced_at: Date.now() });
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
    // even if the token is stale (e.g. rotated by a double-fired upsert).
    const user = await ctx.db
      .query("users")
      .withIndex("by_session_token", (q) =>
        q.eq("session_token", args.sessionToken)
      )
      .first();
    if (!user) return; // already signed out or token invalid — nothing to do
    await ctx.db.delete(user._id);
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
 * Nuclear option — wipes purge tags, sessions, last played, want priorities,
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

    // Sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_username", (q) => q.eq("discogs_username", username))
      .collect();
    for (const row of sessions) await ctx.db.delete(row._id);

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

    // Delete the user record itself
    await ctx.db.delete(user._id);
  },
});
