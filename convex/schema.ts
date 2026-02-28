import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    discogs_username: v.string(),
    discogs_avatar_url: v.optional(v.string()),
    access_token: v.string(),
    token_secret: v.string(),
    created_at: v.number(),
    last_synced_at: v.optional(v.number()),
  }).index("by_username", ["discogs_username"]),

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
  }).index("by_username", ["discogs_username"]),

  collection: defineTable({
    discogsUsername: v.string(),
    releaseId: v.number(),
    instanceId: v.number(),
    artist: v.string(),
    title: v.string(),
    year: v.number(),
    cover: v.string(),
    folder: v.string(),
    label: v.string(),
    catalogNumber: v.string(),
    format: v.string(),
    mediaCondition: v.string(),
    sleeveCondition: v.string(),
    pricePaid: v.string(),
    notes: v.string(),
    customFields: v.optional(v.array(v.object({ name: v.string(), value: v.string() }))),
    dateAdded: v.string(),
  })
    .index("by_username", ["discogsUsername"])
    .index("by_username_and_release", ["discogsUsername", "releaseId"]),

  preferences: defineTable({
    discogs_username: v.string(),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    hide_purge_indicators: v.boolean(),
    hide_gallery_meta: v.boolean(),
    shake_to_random: v.optional(v.boolean()),
  }).index("by_username", ["discogs_username"]),
});
