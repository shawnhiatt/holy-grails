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

    // ── Session Builder: sessions that fill themselves ──
    // There is no second object type. A session is either hand-filled or
    // rule-filled, and that is a property, not a category — undefined reads
    // as "manual", so every pre-existing row is already correct.
    kind: v.optional(v.union(v.literal("manual"), v.literal("auto"))),
    // The saved query. `field`/`op` are loose strings on purpose (the same
    // call as `view_mode`): a new operator ships without a schema deploy, and
    // the pure evaluator ignores conditions it doesn't recognize.
    //
    // Membership is DERIVED from this, never stored: `album_ids` stays [] for
    // an auto session so there is exactly one source of truth and a newly
    // added record joins with no write path at all.
    rule: v.optional(
      v.object({
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
        rotation: v.union(
          v.literal("off"),
          v.literal("daily"),
          v.literal("weekly")
        ),
      })
    ),
    // Records kicked out of an auto session by hand. Keyed on release_id to
    // match album_ids' semantics.
    excluded_ids: v.optional(v.array(v.number())),
    // The last title the generator produced. While `name` still equals it the
    // title keeps regenerating as the rule is edited; the moment the user
    // types their own it diverges and freezes. Stored rather than recomputed
    // so the freeze survives a change to the generator.
    name_generated: v.optional(v.string()),
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
    // ── Free data (Session Builder phase 1) ──
    // All five arrive on the collection response the sync already makes and
    // were previously discarded. All optional: a row synced before this
    // change simply reads undefined, and backfills on that user's next sync.
    // Styles ("Hard Bop") are the session-shaped half; genres ("Jazz") are
    // the coarse one. `rating` is the user's own 1–5 stars — Discogs sends 0
    // for UNRATED and the mapper drops it, so undefined means unrated and a
    // stored value is always a real star count (never write 0 here).
    genres: v.optional(v.array(v.string())),
    styles: v.optional(v.array(v.string())),
    rating: v.optional(v.number()),
    discCount: v.optional(v.number()),
    artistIds: v.optional(v.array(v.number())),
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
    // Discogs `date_added`, normalized to "YYYY-MM-DD" so it matches the shape
    // `collection` stores and one parser serves both. Optional: rows synced
    // before this read undefined and simply don't count toward the recent-adds
    // delta until the next sync backfills them.
    dateAdded: v.optional(v.string()),
    // Free data (Session Builder phase 1), same as `collection` above minus
    // `rating` — Discogs only rates copies you own, so a want has none.
    genres: v.optional(v.array(v.string())),
    styles: v.optional(v.array(v.string())),
    discCount: v.optional(v.number()),
    artistIds: v.optional(v.array(v.number())),
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
    // Session Builder defaults, both loose strings per the `view_mode`
    // precedent (new values need no deploy). `session_cap` is one of
    // "10"|"25"|"50"|"none"; `session_rotation` is "off"|"daily"|"weekly".
    // A per-session override, when set, always wins over these.
    session_cap: v.optional(v.string()),
    session_rotation: v.optional(v.string()),
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

  // In-app bug reports and ideas. One row per submission, authored by the
  // authenticated reporter; only an admin (see admin.ts) can read other
  // people's rows. `status` closes the loop — the reporter sees it on their
  // own reports in Settings.
  //
  // `diagnostics` is a label/value list rather than a typed object on purpose:
  // it is captured by the client, rendered verbatim in the inbox, and never
  // queried on. Adding a new diagnostic line is a client change with no schema
  // deploy and no optional-field archaeology.
  bug_reports: defineTable({
    discogs_username: v.string(),
    kind: v.union(v.literal("bug"), v.literal("idea")),
    message: v.string(),
    status: v.union(v.literal("new"), v.literal("known"), v.literal("fixed")),
    created_at: v.number(),
    updated_at: v.optional(v.number()),
    // Admin's short reply, shown back to the reporter beside the status chip.
    resolution_note: v.optional(v.string()),
    screenshot_id: v.optional(v.id("_storage")),
    diagnostics: v.array(v.object({ label: v.string(), value: v.string() })),
    // Last few client-side errors captured before the report was filed (see
    // report-error.ts). Present even when Sentry is not configured.
    recent_errors: v.optional(v.array(v.string())),
  })
    .index("by_username", ["discogs_username"])
    .index("by_status", ["status"]),

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
