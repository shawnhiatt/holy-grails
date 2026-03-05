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
      return { _id: existing._id, session_token: sessionToken };
    }

    const id = await ctx.db.insert("users", {
      discogs_username: args.discogs_username,
      discogs_avatar_url: args.discogs_avatar_url,
      access_token: args.access_token,
      token_secret: args.token_secret,
      session_token: sessionToken,
      created_at: Date.now(),
    });
    return { _id: id, session_token: sessionToken };
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
