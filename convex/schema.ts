import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per signed-in device. Every OAuth login mints a fresh token
  // (rotation), other devices keep their own sessions, and sign-out deletes
  // only the calling device's row. Rows expire after SESSION_TTL_MS
  // (authHelper.ts) and are pruned on login.
  //
  // Named auth_sessions (not "sessions") because a legacy, undeclared
  // "sessions" table from the pre-Stacks-rename era still holds old rows in
  // the deployments — declaring that name fails schema validation.
  auth_sessions: defineTable({
    session_token: v.string(),
    discogs_username: v.string(),
    created_at: v.number(),
  })
    .index("by_token", ["session_token"])
    .index("by_username", ["discogs_username"]),

  users: defineTable({
    discogs_username: v.string(),
    discogs_avatar_url: v.optional(v.string()),
    access_token: v.string(),
    token_secret: v.string(),
    // LEGACY single-token session fields — still honored read-only by
    // authenticateUser so existing devices stay signed in, but new logins
    // write to the sessions table instead. Remove once all legacy tokens
    // have aged past the TTL.
    session_token: v.optional(v.string()),
    session_created_at: v.optional(v.number()),
    created_at: v.number(),
    last_synced_at: v.optional(v.number()),
    collection_value: v.optional(v.string()),
    collection_value_synced_at: v.optional(v.number()),
    shareActivity: v.optional(v.boolean()),
    // Raw Discogs instance counts observed at the last sync. Used by the
    // lightweight change-detection probe to decide whether a real sync is
    // needed. Raw (pre-vinyl-filter, pre-dedup) so they compare directly to
    // the num_collection / num_wantlist returned by the profile endpoint.
    last_collection_count: v.optional(v.number()),
    last_wantlist_count: v.optional(v.number()),
    // Discogs privacy state observed at the last sync — true when "Allow others
    // to browse my collection/wantlist" is off (the read 403s even for the
    // owner). Drives the private empty-state note on Collection/Wantlist.
    collection_private: v.optional(v.boolean()),
    wantlist_private: v.optional(v.boolean()),
    // LEGACY (Spec 6A → 6A.1): per-user drip watermark. The drip is now keyed
    // on the shared `market_values` table and orders by staleness, so there's
    // no per-user cursor. Unused; kept to avoid a schema-removal deploy dance.
    market_cursor: v.optional(v.number()),
  })
    .index("by_username", ["discogs_username"])
    .index("by_session_token", ["session_token"]),

  purge_tags: defineTable({
    discogs_username: v.string(),
    release_id: v.number(),
    tag: v.union(v.literal("keep"), v.literal("cut"), v.literal("maybe")),
    tagged_at: v.number(),
  })
    .index("by_username", ["discogs_username"])
    .index("by_release", ["discogs_username", "release_id"]),

  stacks: defineTable({
    discogs_username: v.string(),
    stack_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
    created_at: v.number(),
    last_modified: v.number(),
    // Capability-token share link. Unset = not shared. The unguessable
    // share_id IS the capability — getShared is intentionally unauthenticated.
    share_id: v.optional(v.string()),
  })
    .index("by_username", ["discogs_username"])
    .index("by_share_id", ["share_id"]),

  last_played: defineTable({
    discogs_username: v.string(),
    release_id: v.number(),
    played_at: v.number(),
  })
    .index("by_username", ["discogs_username"])
    .index("by_release", ["discogs_username", "release_id"]),

  want_priorities: defineTable({
    discogs_username: v.string(),
    release_id: v.number(),
    is_priority: v.boolean(),
  })
    .index("by_username", ["discogs_username"])
    .index("by_release", ["discogs_username", "release_id"]),

  following: defineTable({
    discogs_username: v.string(),
    following_username: v.string(),
    followed_at: v.number(),
    avatar_url: v.optional(v.string()),
    // Followed-collection sync metadata (see followed_items + discogs.syncFollowedUser)
    is_private: v.optional(v.boolean()),
    collection_synced_at: v.optional(v.number()),
  }).index("by_username", ["discogs_username"]),

  // Persisted copy of followed users' collections and wantlists (slim rows).
  // Written server-side by discogs.syncFollowedUser, read per-profile by
  // followed_items.getForUser. Replaces the old session-long client
  // hydration loop that re-downloaded every followed collection from
  // Discogs on every visit to the Following screen.
  followed_items: defineTable({
    follower_username: v.string(),
    followed_username: v.string(),
    kind: v.union(v.literal("collection"), v.literal("want")),
    release_id: v.number(),
    master_id: v.optional(v.number()),
    title: v.string(),
    artist: v.string(),
    year: v.number(),
    thumb: v.optional(v.string()),
    cover: v.string(),
    label: v.string(),
    format: v.optional(v.string()),
    dateAdded: v.string(),
  }).index("by_follower_followed", ["follower_username", "followed_username"]),

  collection: defineTable({
    discogsUsername: v.string(),
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
    // LEGACY: hardcoded "" at sync and never populated — Discogs exposes price
    // paid only as a per-user custom field, not universal data. All read/write
    // plumbing is gone. Made optional so new rows omit it; delete this line
    // after a clear-then-redeploy pass strips it from existing docs.
    pricePaid: v.optional(v.string()),
    notes: v.string(),
    customFields: v.optional(v.array(v.object({
      name: v.string(),
      value: v.string(),
      fieldId: v.optional(v.number()),
      type: v.optional(v.string()),
      options: v.optional(v.array(v.string())),
    }))),
    dateAdded: v.string(),
    // LEGACY (Spec 6A → 6A.1): market value used to live per-user on the
    // collection row. It now lives once per release in the `market_values`
    // table (see below) — a release's lowest ask is the same for everyone who
    // owns it, so storing it per-user was duplicated data + duplicated fetches.
    // These two fields are kept only so the one-time seed can migrate the
    // values already collected; nothing reads or writes them anymore. Safe to
    // drop in a future clear-then-redeploy pass.
    marketValue: v.optional(v.union(v.number(), v.null())),
    marketValueFetchedAt: v.optional(v.number()),
  })
    .index("by_username", ["discogsUsername"])
    .index("by_username_and_release", ["discogsUsername", "releaseId"]),

  // Shared per-release market value (Spec 6A.1). Keyed by Discogs `releaseId`
  // and shared across every user who owns that release — one row, one fetch.
  // `value`/`fetchedAt` are optional so a row can exist ("in the drip set")
  // before it has been priced. `value` union(number, null): null = fetched,
  // no active listings; undefined = not yet fetched. The drip orders by
  // `by_fetchedAt` (never-fetched sort first, then stalest) — no cursor needed.
  market_values: defineTable({
    releaseId: v.number(),
    value: v.optional(v.union(v.number(), v.null())),
    fetchedAt: v.optional(v.number()),
  })
    .index("by_release", ["releaseId"])
    .index("by_fetchedAt", ["fetchedAt"]),

  wantlist: defineTable({
    discogs_username: v.string(),
    release_id: v.number(),
    master_id: v.optional(v.number()),
    title: v.string(),
    artist: v.string(),
    year: v.number(),
    cover: v.string(),
    thumb: v.optional(v.string()),
    label: v.string(),
    // Raw Discogs format string (all-formats change). Optional: rows synced
    // before it read undefined → no badge, no vinyl assumption.
    format: v.optional(v.string()),
    priority: v.boolean(),
  })
    .index("by_username", ["discogs_username"])
    .index("by_username_release", ["discogs_username", "release_id"]),

  preferences: defineTable({
    discogs_username: v.string(),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    hide_purge_indicators: v.boolean(),
    // LEGACY: controlled the removed swiper gallery view; the Settings toggle
    // is gone and nothing reads or writes it anymore. Made optional so new
    // preference rows omit it. Delete this line after a clear-then-redeploy
    // pass strips the field from existing docs (same dance as market_cursor).
    hide_gallery_meta: v.optional(v.boolean()),
    shake_to_random: v.optional(v.boolean()),
    view_mode: v.optional(v.string()),
    want_view_mode: v.optional(v.string()),
    default_screen: v.optional(v.string()),
    default_collection_sort: v.optional(v.string()),
    // Look It Up recent queries — most recent first, capped at 8
    recent_searches: v.optional(v.array(v.string())),
    // All-formats display scope: "all" (default) | "vinyl". Loose string, no
    // enum — undefined reads as "all". Applied client-side at the derive.
    format_scope: v.optional(v.string()),
  }).index("by_username", ["discogs_username"]),

  // Live progress for the server-side sync loop (discogs.syncSelf). One doc
  // per user, upserted as the sync advances; the client subscribes and
  // renders "Syncing collection (150 of 300)" style messages.
  sync_status: defineTable({
    discogs_username: v.string(),
    phase: v.string(), // "collection" | "caching" | "wantlist" | "value" | "idle"
    current: v.optional(v.number()),
    total: v.optional(v.number()),
    updated_at: v.number(),
  }).index("by_username", ["discogs_username"]),

  following_feed: defineTable({
    follower_username: v.string(),
    followed_username: v.string(),
    lastSyncedAt: v.number(),
    recent_albums: v.array(
      v.object({
        release_id: v.number(),
        master_id: v.optional(v.number()),
        title: v.string(),
        artist: v.string(),
        year: v.number(),
        thumb: v.optional(v.string()),
        cover: v.string(),
        label: v.string(),
        format: v.optional(v.string()),
        dateAdded: v.string(),
      })
    ),
    recent_wants: v.optional(
      v.array(
        v.object({
          release_id: v.number(),
          master_id: v.optional(v.number()),
          title: v.string(),
          artist: v.string(),
          year: v.number(),
          thumb: v.optional(v.string()),
          cover: v.string(),
          label: v.string(),
          format: v.optional(v.string()),
          dateAdded: v.string(),
        })
      )
    ),
  })
    .index("by_follower", ["follower_username"])
    .index("by_follower_and_followed", ["follower_username", "followed_username"]),
});
