import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    discogs_username: v.string(),
    discogs_avatar_url: v.optional(v.string()),
    access_token: v.string(),
    token_secret: v.string(),
    session_token: v.optional(v.string()),
    created_at: v.number(),
    last_synced_at: v.optional(v.number()),
    collection_value: v.optional(v.string()),
    collection_value_synced_at: v.optional(v.number()),
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

  sessions: defineTable({
    discogs_username: v.string(),
    session_id: v.string(),
    name: v.string(),
    album_ids: v.array(v.number()),
    created_at: v.number(),
    last_modified: v.number(),
  }).index("by_username", ["discogs_username"]),

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
  }).index("by_username", ["discogs_username"]),

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
    pricePaid: v.string(),
    notes: v.string(),
    customFields: v.optional(v.array(v.object({
      name: v.string(),
      value: v.string(),
      fieldId: v.optional(v.number()),
      type: v.optional(v.string()),
      options: v.optional(v.array(v.string())),
    }))),
    dateAdded: v.string(),
  })
    .index("by_username", ["discogsUsername"])
    .index("by_username_and_release", ["discogsUsername", "releaseId"]),

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
    priority: v.boolean(),
  })
    .index("by_username", ["discogs_username"])
    .index("by_username_release", ["discogs_username", "release_id"]),

  preferences: defineTable({
    discogs_username: v.string(),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    hide_purge_indicators: v.boolean(),
    hide_gallery_meta: v.boolean(),
    shake_to_random: v.optional(v.boolean()),
    view_mode: v.optional(v.string()),
    want_view_mode: v.optional(v.string()),
    default_screen: v.optional(v.string()),
    default_collection_sort: v.optional(v.string()),
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
          dateAdded: v.string(),
        })
      )
    ),
  })
    .index("by_follower", ["follower_username"])
    .index("by_follower_and_followed", ["follower_username", "followed_username"]),
});
