// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { MIGRATION_PAGE_SIZE, UNRESOLVED_LIST_CAP } from "./copyMigration";

const modules = import.meta.glob("./**/*.ts");

/**
 * The copy migration (DW-04a, run in DW-04b). The rules under test are the
 * ones that protect users' data:
 *   - a verdict or play moves to exactly ONE copy, never to both (a Cut on
 *     both copies would make Purge Cut remove both from Discogs);
 *   - nothing is ever deleted;
 *   - running it again changes nothing;
 *   - what can't be placed stays release-only and is counted.
 */

const ME = "collector";
const OTHER = "someone_else";

type T = TestConvex<typeof schema>;

const runChain = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function seedUser(t: T, username: string) {
  await t.run((ctx) =>
    ctx.db.insert("users", {
      discogs_username: username,
      access_token: "access",
      token_secret: "secret",
      created_at: 1,
    })
  );
}

async function seedCopy(t: T, username: string, releaseId: number, instanceId: number) {
  await t.run((ctx) =>
    ctx.db.insert("collection", {
      discogsUsername: username,
      releaseId,
      instanceId,
      artist: "A",
      title: `T${releaseId}`,
      year: 1990,
      cover: "c",
      folder: "Uncategorized",
      label: "L",
      catalogNumber: "C",
      format: "Vinyl",
      mediaCondition: "",
      sleeveCondition: "",
      notes: "",
      dateAdded: "2024-01-01",
    })
  );
}

const tag = (username: string, releaseId: number, t: "keep" | "cut" | "maybe", taggedAt: number) => ({
  discogs_username: username,
  release_id: releaseId,
  tag: t,
  tagged_at: taggedAt,
});
const play = (username: string, releaseId: number, playedAt: number) => ({
  discogs_username: username,
  release_id: releaseId,
  played_at: playedAt,
});

/** Every row the migration may touch, minus system fields, for before/after. */
const snapshot = (t: T) =>
  t.run(async (ctx) => {
    const strip = <D extends { _creationTime: number }>(d: D) => {
      const { _creationTime, ...rest } = d;
      void _creationTime;
      return rest;
    };
    return {
      tags: (await ctx.db.query("purge_tags").collect()).map(strip),
      plays: (await ctx.db.query("last_played").collect()).map(strip),
      stacks: (await ctx.db.query("stacks").collect()).map(strip),
      collection: (await ctx.db.query("collection").collect()).map(strip),
    };
  });

const report = (t: T, username = ME) => t.query(internal.copyMigration.report, { username });

async function migrate(t: T, username = ME) {
  await t.mutation(internal.copyMigration.migrateUser, { username });
  await runChain(t);
}

/**
 * The fixture the brief asks for: release 1 cached as TWO copies (an app add
 * since the last sync), release 2 as one, release 3 not owned. Release 1 has
 * a Cut and three plays; nothing about release 1 may end up on both copies.
 */
async function seedTwoCopyFixture(t: T) {
  await seedUser(t, ME);
  await seedCopy(t, ME, 1, 12); // the later copy, cached first
  await seedCopy(t, ME, 1, 11); // the default copy (lowest instance id)
  await seedCopy(t, ME, 2, 20);
  await t.run(async (ctx) => {
    await ctx.db.insert("purge_tags", tag(ME, 1, "cut", 100));
    await ctx.db.insert("purge_tags", tag(ME, 2, "keep", 100));
    await ctx.db.insert("purge_tags", tag(ME, 3, "maybe", 100)); // not owned
    for (const at of [1000, 2000, 3000]) await ctx.db.insert("last_played", play(ME, 1, at));
    await ctx.db.insert("last_played", play(ME, 2, 4000));
    await ctx.db.insert("last_played", play(ME, 3, 5000)); // not owned
    await ctx.db.insert("stacks", {
      discogs_username: ME,
      stack_id: "manual",
      name: "Friday",
      album_ids: [2, 3, 1],
      created_at: 1,
      last_modified: 1,
    });
    await ctx.db.insert("stacks", {
      discogs_username: ME,
      stack_id: "auto",
      name: "Auto",
      album_ids: [],
      kind: "auto",
      rule: { match: "all", conditions: [], sort: "artist-az", rotation: "off" },
      excluded_ids: [1],
      created_at: 1,
      last_modified: 1,
    });
  });
}

describe("copyMigration.migrateUser", () => {
  it("moves the verdict and plays of a two-copy release to the default copy only", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    await migrate(t);

    const { tags, plays, stacks } = await snapshot(t);
    expect(tags.map((r) => [r.release_id, r.instance_id, r.tag]).sort()).toEqual([
      [1, 11, "cut"],
      [2, 20, "keep"],
      [3, undefined, "maybe"],
    ]);
    // Never on the other copy.
    expect(tags.some((r) => r.instance_id === 12)).toBe(false);
    expect(plays.filter((p) => p.release_id === 1).map((p) => p.instance_id)).toEqual([11, 11, 11]);
    expect(plays.some((p) => p.instance_id === 12)).toBe(false);
    expect(plays.find((p) => p.release_id === 3)?.instance_id).toBeUndefined();

    const manual = stacks.find((s) => s.stack_id === "manual")!;
    expect(manual.copy_ids).toEqual([20, 11]);
    expect(manual.album_ids).toEqual([2, 3, 1]); // unchanged, 3 kept
    const auto = stacks.find((s) => s.stack_id === "auto")!;
    expect(auto.copy_ids).toBeUndefined();
    expect(auto.excluded_ids).toEqual([1]);
  });

  it("deletes nothing and changes no other field", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    const before = await snapshot(t);
    await migrate(t);
    const after = await snapshot(t);

    expect(after.collection).toEqual(before.collection);
    expect(after.tags.map((r) => r._id)).toEqual(before.tags.map((r) => r._id));
    expect(after.plays.map((r) => r._id)).toEqual(before.plays.map((r) => r._id));
    expect(after.stacks.map((r) => r._id)).toEqual(before.stacks.map((r) => r._id));
    // Only instance_id / copy_ids were added.
    const drop = <R extends Record<string, unknown>>(r: R, key: string) => {
      const copy: Record<string, unknown> = { ...r };
      delete copy[key];
      return copy;
    };
    expect(after.tags.map((r) => drop(r, "instance_id"))).toEqual(before.tags);
    expect(after.plays.map((r) => drop(r, "instance_id"))).toEqual(before.plays);
    expect(after.stacks.map((r) => drop(r, "copy_ids"))).toEqual(before.stacks);
  });

  it("running it twice changes nothing", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    await migrate(t);
    const once = await snapshot(t);
    await migrate(t);
    expect(await snapshot(t)).toEqual(once);
    const second = await report(t);
    expect(second?.purge_tags).toMatchObject({ seen: 3, moved: 0, already: 2, unresolved: 1 });
    expect(second?.plays).toMatchObject({ seen: 5, moved: 0, already: 4, unresolved: 1 });
    expect(second?.sessions).toMatchObject({ seen: 2, filled: 0, already: 1, auto: 1 });
  });

  it("writes a report whose counts add up", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    await migrate(t);
    const r = (await report(t))!;
    expect(r.status).toBe("done");
    expect(r.ran_at).toBeTypeOf("number");
    expect(r.purge_tags).toEqual({
      seen: 3,
      moved: 2,
      already: 0,
      duplicates: 0,
      unresolved: 1,
      unresolved_release_ids: [3],
      unresolved_truncated: false,
    });
    expect(r.plays).toEqual({
      seen: 5,
      moved: 4,
      already: 0,
      unresolved: 1,
      unresolved_release_ids: [3],
      unresolved_truncated: false,
    });
    expect(r.sessions).toEqual({
      seen: 2,
      filled: 1,
      already: 0,
      auto: 1,
      unresolved: 1,
      unresolved_release_ids: [3],
      unresolved_truncated: false,
    });
    const pt = r.purge_tags;
    expect(pt.moved + pt.already + pt.duplicates + pt.unresolved).toBe(pt.seen);
    expect(r.plays.moved + r.plays.already + r.plays.unresolved).toBe(r.plays.seen);
  });

  it("two verdicts for one release: the newest moves, the other stays release-only", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ME);
    await seedCopy(t, ME, 1, 11);
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", tag(ME, 1, "keep", 500)); // newer
      await ctx.db.insert("purge_tags", tag(ME, 1, "cut", 100));
    });
    await migrate(t);
    const { tags } = await snapshot(t);
    expect(tags.map((r) => [r.tag, r.instance_id])).toEqual([
      ["keep", 11],
      ["cut", undefined],
    ]);
    expect((await report(t))?.purge_tags).toMatchObject({ moved: 1, duplicates: 1 });
  });

  it("never gives a copy a second verdict when it already has one", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ME);
    await seedCopy(t, ME, 1, 11);
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", { ...tag(ME, 1, "keep", 900), instance_id: 11 });
      await ctx.db.insert("purge_tags", tag(ME, 1, "cut", 100));
    });
    await migrate(t);
    const { tags } = await snapshot(t);
    expect(tags.filter((r) => r.instance_id === 11).map((r) => r.tag)).toEqual(["keep"]);
  });

  it("pages through a large history in several steps", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ME);
    await seedCopy(t, ME, 1, 11);
    const count = MIGRATION_PAGE_SIZE * 2 + 37;
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) await ctx.db.insert("last_played", play(ME, 1, i));
    });
    await t.mutation(internal.copyMigration.migrateUser, { username: ME });
    // The first page ran inline; the rest is still scheduled.
    expect((await report(t))?.status).toBe("running");
    await runChain(t);
    const { plays } = await snapshot(t);
    expect(plays.every((p) => p.instance_id === 11)).toBe(true);
    expect((await report(t))?.plays).toMatchObject({ seen: count, moved: count });
  });

  it("caps the unresolved release id list but keeps the count exact", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ME);
    const count = UNRESOLVED_LIST_CAP + 5;
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) await ctx.db.insert("last_played", play(ME, 100000 + i, i));
    });
    await migrate(t);
    const r = (await report(t))!;
    expect(r.plays.unresolved).toBe(count);
    expect(r.plays.unresolved_release_ids).toHaveLength(UNRESOLVED_LIST_CAP);
    expect(r.plays.unresolved_truncated).toBe(true);
  });

  it("touches only the named user", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    await seedUser(t, OTHER);
    await seedCopy(t, OTHER, 1, 55);
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", tag(OTHER, 1, "cut", 1));
      await ctx.db.insert("last_played", play(OTHER, 1, 1));
    });
    await migrate(t, ME);
    const { tags, plays } = await snapshot(t);
    expect(tags.find((r) => r.discogs_username === OTHER)?.instance_id).toBeUndefined();
    expect(plays.find((r) => r.discogs_username === OTHER)?.instance_id).toBeUndefined();
    expect(await report(t, OTHER)).toBeNull();
  });

  it("a newer run supersedes one still in progress without double counting", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ME);
    await seedCopy(t, ME, 1, 11);
    const count = MIGRATION_PAGE_SIZE + 10;
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) await ctx.db.insert("last_played", play(ME, 1, i));
    });
    await t.mutation(internal.copyMigration.migrateUser, { username: ME });
    await t.mutation(internal.copyMigration.migrateUser, { username: ME });
    await runChain(t);
    const r = (await report(t))!;
    expect(r.status).toBe("done");
    expect(r.plays.seen).toBe(count);
    expect(r.plays.moved + r.plays.already).toBe(count);
  });
});

describe("copyMigration.runAll", () => {
  it("migrates every user", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    await seedUser(t, OTHER);
    await seedCopy(t, OTHER, 7, 70);
    await t.run((ctx) => ctx.db.insert("purge_tags", tag(OTHER, 7, "keep", 1)));
    await t.mutation(internal.copyMigration.runAll, {});
    await runChain(t);
    expect((await report(t, ME))?.status).toBe("done");
    expect((await report(t, OTHER))?.status).toBe("done");
    const { tags } = await snapshot(t);
    expect(tags.find((r) => r.discogs_username === OTHER)?.instance_id).toBe(70);
  });
});

describe("copyMigration.orphans", () => {
  it("lists release-only rows before the run, and copies that left after", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    const before = await t.query(internal.copyMigration.orphans, { username: ME });
    expect(before.purgeTags.releaseOnly.sort()).toEqual([1, 2, 3]);
    expect(before.sessionsNotMigrated).toBe(1);

    await migrate(t);
    let after = await t.query(internal.copyMigration.orphans, { username: ME });
    expect(after.purgeTags).toEqual({ total: 3, releaseOnly: [3], missingCopy: [] });
    expect(after.plays).toMatchObject({ releaseOnly: 1, releaseOnlyReleaseIds: [3], missingCopy: 0 });
    expect(after.sessions).toEqual([{ stack_id: "manual", missingCopies: [], releasesWithoutCopy: [3] }]);
    expect(after.sessionsNotMigrated).toBe(0);

    // Copy 11 leaves the collection: its verdict and plays stay, now listed.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("collection").collect()).find((r) => r.instanceId === 11)!;
      await ctx.db.delete(row._id);
    });
    after = await t.query(internal.copyMigration.orphans, { username: ME });
    expect(after.purgeTags.missingCopy).toEqual([{ release_id: 1, instance_id: 11 }]);
    expect(after.plays).toMatchObject({ missingCopy: 3, missingCopyReleaseIds: [1] });
    expect(after.sessions[0].missingCopies).toEqual([11]);
  });
});

describe("copyMigration and Delete all data", () => {
  it("users.deleteAllUserData removes the caller's report and no one else's", async () => {
    const t = convexTest(schema, modules);
    await seedTwoCopyFixture(t);
    await seedUser(t, OTHER);
    await t.run((ctx) =>
      ctx.db.insert("auth_sessions", { session_token: "tok-me", discogs_username: ME, created_at: Date.now() })
    );
    await migrate(t, ME);
    await migrate(t, OTHER);
    expect(await report(t, ME)).not.toBeNull();

    await t.mutation(api.users.deleteAllUserData, { sessionToken: "tok-me" });
    await runChain(t);
    expect(await report(t, ME)).toBeNull();
    expect(await report(t, OTHER)).not.toBeNull();
  });

  it("a run scheduled for an account deleted since writes nothing", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.copyMigration.migrateUser, { username: "gone" })).toBeNull();
    await runChain(t);
    expect(await report(t, "gone")).toBeNull();
  });
});
