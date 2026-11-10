// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { USER_DELETE_BATCH } from "./users";
import { FOLLOWED_DELETE_BATCH } from "./followed_items";
import type { MutationCtx } from "./_generated/server";

const modules = import.meta.glob("./**/*.ts");

/**
 * The big deletes, paged (audit A-11 / WO-09). Delete all data, Unfollow,
 * Clear following and the followed-sync clear each used to run in ONE
 * transaction and failed outright once an account outgrew Convex's
 * per-mutation limits. They now delete in bounded steps and schedule the
 * rest. These tests seed more rows than one step deletes and prove:
 * everything goes across steps, a run that stops partway finishes when it is
 * run again, and nothing outside the caller's own username is touched.
 */

const ME = "me";
const OTHER = "other";
const BIG = "bigcollector";
const TOKEN = "tok-me";
const OTHER_TOKEN = "tok-other";

const makeT = () => convexTest(schema, modules);
type T = ReturnType<typeof makeT>;

const item = (follower: string, followed: string, kind: "collection" | "want", id: number) => ({
  follower_username: follower,
  followed_username: followed,
  kind,
  release_id: id,
  title: `T${id}`,
  artist: "A",
  year: 1990,
  cover: "c",
  label: "L",
  dateAdded: "2024-01-01",
});

const collectionRow = (username: string, id: number) => ({
  discogsUsername: username,
  releaseId: id,
  instanceId: id * 10,
  artist: "A",
  title: `T${id}`,
  year: 1990,
  cover: "c",
  folder: "Uncategorized",
  label: "L",
  catalogNumber: "CAT",
  format: "Vinyl",
  mediaCondition: "",
  sleeveCondition: "",
  notes: "",
  dateAdded: "2024-01-01",
});

/** One user with a session and a row in every table Delete all data covers.
 *  `scale` multiplies the high-volume tables. */
async function seedAccount(ctx: MutationCtx, username: string, token: string, scale: number) {
  const now = Date.now();
  await ctx.db.insert("users", {
    discogs_username: username,
    access_token: "a",
    token_secret: "s",
    created_at: now,
    shareActivity: true,
  });
  await ctx.db.insert("auth_sessions", { session_token: token, discogs_username: username, created_at: now });
  await ctx.db.insert("auth_sessions", { session_token: `${token}-2`, discogs_username: username, created_at: now });

  for (let i = 0; i < 2 * scale; i++) {
    await ctx.db.insert("followed_items", item(username, `f${i % 3}`, i % 4 ? "collection" : "want", i));
  }
  for (let i = 0; i < scale; i++) {
    await ctx.db.insert("collection", collectionRow(username, i));
    await ctx.db.insert("purge_tags", { discogs_username: username, release_id: i, tag: "keep", tagged_at: now });
    await ctx.db.insert("last_played", { discogs_username: username, release_id: i, played_at: now });
  }
  // following_feed and bug_reports are the heavy-row tables (smaller bites).
  const heavy = Math.max(3, Math.ceil(scale / 10));
  for (let i = 0; i < heavy; i++) {
    await ctx.db.insert("following_feed", {
      follower_username: username,
      followed_username: `f${i}`,
      lastSyncedAt: now,
      recent_albums: [],
    });
    await ctx.db.insert("bug_reports", {
      discogs_username: username,
      kind: "bug",
      message: "m",
      status: "new",
      created_at: now,
      diagnostics: [],
    });
  }
  for (let i = 0; i < 3; i++) {
    await ctx.db.insert("following", { discogs_username: username, following_username: `f${i}`, followed_at: now });
  }
  await ctx.db.insert("stacks", {
    discogs_username: username,
    stack_id: "s1",
    name: "Late night",
    album_ids: [1, 2],
    created_at: now,
    last_modified: now,
  });
  await ctx.db.insert("want_priorities", { discogs_username: username, release_id: 1, is_priority: true });
  await ctx.db.insert("wantlist", {
    discogs_username: username,
    release_id: 1,
    title: "W",
    artist: "A",
    year: 1990,
    cover: "c",
    label: "L",
    priority: false,
  });
  await ctx.db.insert("preferences", { discogs_username: username, theme: "dark", hide_purge_indicators: false });
  await ctx.db.insert("collection_removals", { discogsUsername: username, releaseId: 9, instanceId: 90, removedAt: now });
  await ctx.db.insert("sync_status", { discogs_username: username, phase: "idle", updated_at: now });
  await ctx.db.insert("cover_scans", { discogs_username: username, at: now });
}

/** Every row the account owns, table by table. */
async function countsFor(t: T, username: string) {
  return t.run(async (ctx) => {
    const by = async <R>(rows: Promise<R[]>) => (await rows).length;
    return {
      users: await by(ctx.db.query("users").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      auth_sessions: await by(ctx.db.query("auth_sessions").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      followed_items: await by(ctx.db.query("followed_items").withIndex("by_follower_followed", (q) => q.eq("follower_username", username)).collect()),
      collection: await by(ctx.db.query("collection").withIndex("by_username", (q) => q.eq("discogsUsername", username)).collect()),
      purge_tags: await by(ctx.db.query("purge_tags").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      last_played: await by(ctx.db.query("last_played").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      following_feed: await by(ctx.db.query("following_feed").withIndex("by_follower", (q) => q.eq("follower_username", username)).collect()),
      bug_reports: await by(ctx.db.query("bug_reports").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      following: await by(ctx.db.query("following").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      stacks: await by(ctx.db.query("stacks").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      want_priorities: await by(ctx.db.query("want_priorities").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      wantlist: await by(ctx.db.query("wantlist").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      preferences: await by(ctx.db.query("preferences").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      collection_removals: await by(ctx.db.query("collection_removals").withIndex("by_username_and_removedAt", (q) => q.eq("discogsUsername", username)).collect()),
      sync_status: await by(ctx.db.query("sync_status").withIndex("by_username", (q) => q.eq("discogs_username", username)).collect()),
      cover_scans: await by(ctx.db.query("cover_scans").withIndex("by_username_at", (q) => q.eq("discogs_username", username)).collect()),
    };
  });
}

const total = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

/** Cancel every pending continuation: the chain "stops partway". */
async function dropScheduled(t: T) {
  await t.run(async (ctx) => {
    for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
      if (job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
    }
  });
}

const pendingJobs = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter((j) => j.state.kind === "pending").length
  );

const runChain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// The large account: several steps' worth of followed_items and collection
// rows, and more feed snapshots / bug reports than one heavy-row bite.
const SCALE = Math.ceil(USER_DELETE_BATCH * 1.3);

describe("users.deleteAllUserData, paged", () => {
  it("deletes a large account fully across several steps", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await seedAccount(ctx, ME, TOKEN, SCALE);
      await seedAccount(ctx, OTHER, OTHER_TOKEN, 5);
      // Someone else's cache OF my collection is theirs, not mine.
      await ctx.db.insert("followed_items", item(OTHER, ME, "collection", 1));
    });
    const before = await countsFor(t, ME);
    expect(total(before)).toBeGreaterThan(4 * USER_DELETE_BATCH);
    const otherBefore = await countsFor(t, OTHER);

    await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });

    // One step's worth is gone, the rest is scheduled, and the account can
    // still authenticate: the sessions and user row go last.
    const afterFirst = await countsFor(t, ME);
    expect(total(before) - total(afterFirst)).toBe(USER_DELETE_BATCH);
    expect(afterFirst.users).toBe(1);
    expect(afterFirst.auth_sessions).toBe(2);
    expect(await t.query(api.users.getMe, { sessionToken: TOKEN })).not.toBeNull();
    expect(await pendingJobs(t)).toBe(1);

    await runChain(t);

    const after = await countsFor(t, ME);
    expect(total(after)).toBe(0);
    await expect(t.query(api.users.getMe, { sessionToken: TOKEN })).rejects.toThrow();
    expect(await countsFor(t, OTHER)).toEqual(otherBefore);
    expect(await t.query(api.users.getMe, { sessionToken: OTHER_TOKEN })).not.toBeNull();
    const othersCacheOfMe = await t.run(async (ctx) =>
      ctx.db
        .query("followed_items")
        .withIndex("by_follower_followed", (q) => q.eq("follower_username", OTHER).eq("followed_username", ME))
        .collect()
    );
    expect(othersCacheOfMe).toHaveLength(1);
  });

  it("a run that stops partway finishes when Delete all data is run again", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await seedAccount(ctx, ME, TOKEN, SCALE);
      await seedAccount(ctx, OTHER, OTHER_TOKEN, 5);
    });
    const otherBefore = await countsFor(t, OTHER);

    // Every run is cut off after its first step. The session survives each
    // stop, so the next press of the button picks up where the last stopped.
    let presses = 0;
    for (;;) {
      const remaining = total(await countsFor(t, ME));
      if (remaining === 0) break;
      await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });
      await dropScheduled(t);
      presses++;
      expect(total(await countsFor(t, ME))).toBeLessThan(remaining);
      expect(presses).toBeLessThan(50);
    }
    expect(presses).toBeGreaterThan(3);
    await expect(t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN })).rejects.toThrow();
    expect(await countsFor(t, OTHER)).toEqual(otherBefore);
  });

  it("a re-run while a chain is still going finishes cleanly", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await seedAccount(ctx, ME, TOKEN, SCALE);
    });
    await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });
    await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });
    await runChain(t);
    expect(total(await countsFor(t, ME))).toBe(0);
  });

  it("a small account is gone when the mutation returns, with nothing scheduled", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await seedAccount(ctx, ME, TOKEN, 5);
    });
    await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });
    expect(total(await countsFor(t, ME))).toBe(0);
    expect(await pendingJobs(t)).toBe(0);
  });

  it("rejects a bad session token and deletes nothing", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await seedAccount(ctx, ME, TOKEN, 5);
    });
    const before = await countsFor(t, ME);
    await expect(t.mutation(api.users.deleteAllUserData, { sessionToken: "nope" })).rejects.toThrow();
    await expect(t.mutation(api.users.deleteAllUserData, { sessionToken: "" })).rejects.toThrow();
    expect(await countsFor(t, ME)).toEqual(before);
  });
});

// ─── Unfollow, Clear following, the followed-sync clear ───

const BIG_ROWS = Math.ceil(FOLLOWED_DELETE_BATCH * 2.5);

async function seedFollowing(t: T) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (const [u, tok] of [[ME, TOKEN], [OTHER, OTHER_TOKEN]] as const) {
      await ctx.db.insert("users", { discogs_username: u, access_token: "a", token_secret: "s", created_at: now });
      await ctx.db.insert("auth_sessions", { session_token: tok, discogs_username: u, created_at: now });
    }
    for (const followed of [BIG, "small"]) {
      await ctx.db.insert("following", { discogs_username: ME, following_username: followed, followed_at: now });
      await ctx.db.insert("following_feed", {
        follower_username: ME,
        followed_username: followed,
        lastSyncedAt: now,
        recent_albums: [],
      });
    }
    await ctx.db.insert("following", { discogs_username: OTHER, following_username: BIG, followed_at: now });
    for (let i = 0; i < BIG_ROWS; i++) {
      await ctx.db.insert("followed_items", item(ME, BIG, i % 5 ? "collection" : "want", i));
    }
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("followed_items", item(ME, "small", "collection", i));
      await ctx.db.insert("followed_items", item(OTHER, BIG, "collection", i));
    }
  });
}

const pairRows = (t: T, follower: string, followed: string, kind?: "collection" | "want") =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query("followed_items")
        .withIndex("by_follower_followed", (q) =>
          q.eq("follower_username", follower).eq("followed_username", followed)
        )
        .collect()
    ).filter((r) => !kind || r.kind === kind)
  );

describe("following.remove, paged", () => {
  it("clears a large followed collection across steps and leaves everyone else's", async () => {
    const t = makeT();
    await seedFollowing(t);
    await t.mutation(api.following.remove, { sessionToken: TOKEN, following_username: BIG });
    expect(await pairRows(t, ME, BIG)).toHaveLength(BIG_ROWS - FOLLOWED_DELETE_BATCH);
    await runChain(t);
    expect(await pairRows(t, ME, BIG)).toHaveLength(0);
    expect(await pairRows(t, ME, "small")).toHaveLength(10);
    expect(await pairRows(t, OTHER, BIG)).toHaveLength(10);
  });

  it("stops clearing if the user is followed again before it finishes", async () => {
    const t = makeT();
    await seedFollowing(t);
    await t.mutation(api.following.remove, { sessionToken: TOKEN, following_username: BIG });
    await t.mutation(api.following.add, { sessionToken: TOKEN, following_username: BIG });
    await runChain(t);
    // The re-follow's own sync replaces these (clearForUser); the unfollow's
    // clear must not race it.
    expect(await pairRows(t, ME, BIG)).toHaveLength(BIG_ROWS - FOLLOWED_DELETE_BATCH);
  });

  it("rejects a bad session token", async () => {
    const t = makeT();
    await seedFollowing(t);
    await expect(
      t.mutation(api.following.remove, { sessionToken: "nope", following_username: BIG })
    ).rejects.toThrow();
    expect(await pairRows(t, ME, BIG)).toHaveLength(BIG_ROWS);
  });
});

describe("following.clearAll, paged", () => {
  it("clears follows, the feed and every followed collection across steps", async () => {
    const t = makeT();
    await seedFollowing(t);
    await t.mutation(api.following.clearAll, { sessionToken: TOKEN });
    await runChain(t);
    const counts = await countsFor(t, ME);
    expect(counts.following).toBe(0);
    expect(counts.following_feed).toBe(0);
    expect(counts.followed_items).toBe(0);
    // The account itself is untouched, and so is everyone else.
    expect(counts.users).toBe(1);
    expect(await pairRows(t, OTHER, BIG)).toHaveLength(10);
    const otherFollows = await countsFor(t, OTHER);
    expect(otherFollows.following).toBe(1);
  });

  it("someone followed again mid-clear keeps their follow and new cache", async () => {
    const t = makeT();
    await seedFollowing(t);
    await t.mutation(api.following.clearAll, { sessionToken: TOKEN });
    // Follow someone new while the clear is still running, and their sync
    // writes a cache.
    vi.advanceTimersByTime(5);
    await t.mutation(api.following.add, { sessionToken: TOKEN, following_username: "fresh" });
    await t.mutation(internal.followed_items.appendItems, {
      follower_username: ME,
      followed_username: "fresh",
      kind: "collection",
      items: [1, 2, 3].map((i) => {
        const { follower_username: _f, followed_username: _g, kind: _k, ...rest } = item(ME, "fresh", "collection", i);
        return rest;
      }),
    });
    await runChain(t);
    expect((await countsFor(t, ME)).following).toBe(1);
    expect(await pairRows(t, ME, "fresh")).toHaveLength(3);
    expect(await pairRows(t, ME, BIG)).toHaveLength(0);
  });

  it("rejects a bad session token", async () => {
    const t = makeT();
    await seedFollowing(t);
    await expect(t.mutation(api.following.clearAll, { sessionToken: "nope" })).rejects.toThrow();
    expect((await countsFor(t, ME)).following).toBe(2);
  });
});

describe("followed_items.clearForUser, paged", () => {
  const fresh = (i: number) => {
    const { follower_username: _f, followed_username: _g, kind: _k, ...rest } = item(ME, BIG, "collection", i);
    return rest;
  };

  it("clears one kind across steps without touching the rows the sync writes next", async () => {
    const t = makeT();
    await seedFollowing(t);
    const wantsBefore = (await pairRows(t, ME, BIG, "want")).length;

    await t.mutation(internal.followed_items.clearForUser, {
      follower_username: ME,
      followed_username: BIG,
      kind: "collection",
    });
    // The sync action appends the fresh rows right away, before the clear's
    // scheduled steps have run.
    await t.mutation(internal.followed_items.appendItems, {
      follower_username: ME,
      followed_username: BIG,
      kind: "collection",
      items: [100001, 100002].map(fresh),
    });
    await runChain(t);

    const collection = await pairRows(t, ME, BIG, "collection");
    expect(collection.map((r) => r.release_id).sort()).toEqual([100001, 100002]);
    expect(await pairRows(t, ME, BIG, "want")).toHaveLength(wantsBefore);
    expect(await pairRows(t, ME, "small")).toHaveLength(10);
    expect(await pairRows(t, OTHER, BIG)).toHaveLength(10);
  });

  it("clears the whole pair, paged, once the follow is gone", async () => {
    const t = makeT();
    await seedFollowing(t);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("following")
        .withIndex("by_username", (q) => q.eq("discogs_username", ME))
        .filter((q) => q.eq(q.field("following_username"), BIG))
        .first();
      await ctx.db.delete(row!._id);
    });
    await t.mutation(internal.followed_items.clearForUser, {
      follower_username: ME,
      followed_username: BIG,
      kind: "want",
    });
    await runChain(t);
    expect(await pairRows(t, ME, BIG)).toHaveLength(0);
    expect(await pairRows(t, OTHER, BIG)).toHaveLength(10);
  });
});
