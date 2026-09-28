import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { COVER_SCAN_LIMIT_PER_HOUR, COVER_SCAN_WINDOW_MS } from "./coverIdentity";

/** Old rows removed per call. Bounded so a user returning after a long gap
 *  doesn't turn one scan into an unbounded delete; the rest go next time. */
const PRUNE_BATCH = 100;

/**
 * Spend one cover scan from the caller's rolling hourly budget. Returns false
 * (and records nothing) when the budget is spent. Called by
 * vision.identifyCover only once the request is otherwise going to reach the
 * Claude API, so an unconfigured deployment or a rejected payload costs
 * nothing. Internal: the username comes from the action's own credential
 * lookup, never from a client.
 */
export const consume = internalMutation({
  args: { username: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const windowStart = args.now - COVER_SCAN_WINDOW_MS;
    const recent = await ctx.db
      .query("cover_scans")
      .withIndex("by_username_at", (q) =>
        q.eq("discogs_username", args.username).gt("at", windowStart)
      )
      .take(COVER_SCAN_LIMIT_PER_HOUR);
    if (recent.length >= COVER_SCAN_LIMIT_PER_HOUR) return false;

    await ctx.db.insert("cover_scans", { discogs_username: args.username, at: args.now });

    const stale = await ctx.db
      .query("cover_scans")
      .withIndex("by_username_at", (q) =>
        q.eq("discogs_username", args.username).lte("at", windowStart)
      )
      .take(PRUNE_BATCH);
    for (const row of stale) await ctx.db.delete(row._id);
    return true;
  },
});
