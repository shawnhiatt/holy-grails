import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authenticateUser } from "./authHelper";
import { copyInstanceFor, resolveCopy } from "./copies";

export const getByUsername = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("purge_tags")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
  },
});

export const getByRelease = query({
  args: { sessionToken: v.string(), release_id: v.number() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q
          .eq("discogs_username", user.discogs_username)
          .eq("release_id", args.release_id)
      )
      .first();
  },
});

/**
 * Set a copy's verdict. `instance_id` names the copy (new clients). Without
 * it (an old client, which only knows the release) the server picks the
 * release's default copy (copies.ts) and stores both ids, so a verdict always
 * lands on exactly one copy. A release-only row for the release (from before
 * the copy migration) is adopted rather than joined by a second row. When the
 * release isn't cached at all the row stays release-only, as before copies.
 */
export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
    tag: v.union(v.literal("keep"), v.literal("cut"), v.literal("maybe")),
    instance_id: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const username = user.discogs_username;
    const instanceId = await copyInstanceFor(ctx, username, args.release_id, args.instance_id);
    const now = Date.now();
    const releaseRows = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q.eq("discogs_username", username).eq("release_id", args.release_id)
      )
      .collect();

    if (instanceId !== undefined) {
      const mine = await ctx.db
        .query("purge_tags")
        .withIndex("by_instance", (q) =>
          q.eq("discogs_username", username).eq("instance_id", instanceId)
        )
        .first();
      if (mine) {
        await ctx.db.patch(mine._id, { tag: args.tag, tagged_at: now });
        return mine._id;
      }
      const releaseOnly = releaseRows.find((r) => r.instance_id === undefined);
      if (releaseOnly) {
        await ctx.db.patch(releaseOnly._id, { tag: args.tag, tagged_at: now, instance_id: instanceId });
        return releaseOnly._id;
      }
      return await ctx.db.insert("purge_tags", {
        discogs_username: username,
        release_id: args.release_id,
        tag: args.tag,
        tagged_at: now,
        instance_id: instanceId,
      });
    }

    // Not cached and no copy named: the pre-copies behaviour, preferring a
    // release-only row over one that belonged to a copy that has left.
    const existing = releaseRows.find((r) => r.instance_id === undefined) ?? releaseRows[0];
    if (existing) {
      await ctx.db.patch(existing._id, { tag: args.tag, tagged_at: now });
      return existing._id;
    }
    return await ctx.db.insert("purge_tags", {
      discogs_username: username,
      release_id: args.release_id,
      tag: args.tag,
      tagged_at: now,
    });
  },
});

/**
 * Clear a copy's verdict. With `instance_id`: that copy's row(s). Without it
 * (an old client): the default copy's row plus any release-only row for the
 * release — an old client folds verdicts by release, so leaving the
 * release-only row would make the verdict it just cleared reappear. When the
 * release isn't cached: one row by release, as before copies.
 */
export const remove = mutation({
  args: {
    sessionToken: v.string(),
    release_id: v.number(),
    instance_id: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const username = user.discogs_username;
    const byInstance = (instanceId: number) =>
      ctx.db
        .query("purge_tags")
        .withIndex("by_instance", (q) =>
          q.eq("discogs_username", username).eq("instance_id", instanceId)
        )
        .collect();

    if (args.instance_id !== undefined) {
      await resolveCopy(ctx, username, args.release_id, args.instance_id);
      for (const row of await byInstance(args.instance_id)) await ctx.db.delete(row._id);
      return;
    }

    const releaseRows = await ctx.db
      .query("purge_tags")
      .withIndex("by_release", (q) =>
        q.eq("discogs_username", username).eq("release_id", args.release_id)
      )
      .collect();
    const copy = await resolveCopy(ctx, username, args.release_id);
    if (copy) {
      for (const row of releaseRows) {
        if (row.instance_id === undefined || row.instance_id === copy.instanceId) {
          await ctx.db.delete(row._id);
        }
      }
      return;
    }
    const existing = releaseRows.find((r) => r.instance_id === undefined) ?? releaseRows[0];
    if (existing) await ctx.db.delete(existing._id);
  },
});
