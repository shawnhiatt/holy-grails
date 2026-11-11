// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  foldByCopy,
  isInstanceId,
  pickDefaultCopy,
  rebuildCopyIds,
  releaseIdsForCopies,
  resolveCopy,
} from "./copies";

const modules = import.meta.glob("./**/*.ts");

/**
 * Every copy (DW-04a): the default-copy rule and the server paths that accept
 * a copy's instance id while old-shaped calls (release only) keep working —
 * the shipped iOS build and the current PWA send release ids alone.
 */

const USER = "collector";
const TOKEN = "tok-collector";
const OTHER = "someone_else";
const OTHER_TOKEN = "tok-other";

type T = TestConvex<typeof schema>;

async function seedUser(t: T, username = USER, token = TOKEN) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "access",
      token_secret: "secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", { session_token: token, discogs_username: username, created_at: Date.now() });
  });
}

async function seedCopy(t: T, releaseId: number, instanceId: number, username = USER, extra: Record<string, unknown> = {}) {
  await t.run(async (ctx) => {
    await ctx.db.insert("collection", {
      discogsUsername: username,
      releaseId,
      instanceId,
      artist: `Artist ${releaseId}`,
      title: `Title ${releaseId}`,
      year: 1990,
      cover: `cover-${releaseId}`,
      thumb: `thumb-${releaseId}`,
      folder: "Uncategorized",
      label: "Label",
      catalogNumber: "CAT",
      format: "Vinyl, LP",
      mediaCondition: "",
      sleeveCondition: "",
      notes: "",
      dateAdded: "2024-01-01",
      ...extra,
    });
  });
}

const tags = (t: T) => t.run((ctx) => ctx.db.query("purge_tags").collect());
const plays = (t: T) => t.run((ctx) => ctx.db.query("last_played").collect());
const stackDoc = (t: T, stackId: string) =>
  t.run(async (ctx) => (await ctx.db.query("stacks").collect()).find((s) => s.stack_id === stackId)!);

// ─── Pure helpers ───

describe("copies: pure helpers", () => {
  it("accepts only positive safe integers as instance ids", () => {
    expect(isInstanceId(123)).toBe(true);
    for (const bad of [NaN, 0, -4, 1.5, Infinity, Number("c-12"), "12"]) expect(isInstanceId(bad)).toBe(false);
  });

  it("the default copy is the lowest instance id", () => {
    expect(pickDefaultCopy([{ instanceId: 30 }, { instanceId: 12 }, { instanceId: 40 }])).toEqual({ instanceId: 12 });
    expect(pickDefaultCopy([])).toBeNull();
  });

  it("releaseIdsForCopies lists each copy's release once, in first-appearance order", () => {
    const releaseOf = new Map([[11, 1], [12, 1], [20, 2], [30, 3]]);
    expect(releaseIdsForCopies([20, 12, 11, 99, 30], releaseOf)).toEqual([2, 1, 3]);
  });

  it("rebuildCopyIds follows album_ids, keeps held copies, adds default copies, drops removed ones", () => {
    const releaseOf = new Map([[11, 1], [12, 1], [20, 2], [30, 3]]);
    const defaults = new Map([[1, 11], [2, 20], [3, 30], [4, 40]]);
    // The session held copy 12 of release 1 and copy 20; an old client
    // reorders, drops release 2, and adds releases 3, 4 and an unowned 5.
    expect(rebuildCopyIds([20, 12], [3, 1, 4, 5], releaseOf, defaults)).toEqual([30, 12, 40]);
    // Both copies of a release held: both kept, in their existing order.
    expect(rebuildCopyIds([12, 11], [1], releaseOf, defaults)).toEqual([12, 11]);
    // Nothing held yet (a session that predates copies).
    expect(rebuildCopyIds([], [2, 1], releaseOf, defaults)).toEqual([20, 11]);
  });

  it("foldByCopy puts instance rows on their copy and release-only rows on the default copy only", () => {
    const rows = [
      { releaseId: 1, instanceId: 12 },
      { releaseId: 1, instanceId: 11 },
      { releaseId: 2, instanceId: 20 },
    ];
    const fold = foldByCopy(
      rows,
      [
        { release_id: 1, tag: "cut" }, // release-only → default copy 11
        { release_id: 2, instance_id: 20, tag: "keep" },
        { release_id: 2, tag: "maybe" }, // loses to the instance row
      ],
      [
        { release_id: 1, played_at: 100 },
        { release_id: 1, instance_id: 12, played_at: 300 },
        { release_id: 1, instance_id: 999, played_at: 400 }, // a copy that left
        { release_id: 2, played_at: 50 },
      ]
    );
    expect(fold.get(11)).toEqual({ purgeTag: "cut", playCount: 1, lastPlayedAt: 100 });
    expect(fold.get(12)).toEqual({ purgeTag: null, playCount: 1, lastPlayedAt: 300 });
    expect(fold.get(20)).toEqual({ purgeTag: "keep", playCount: 1, lastPlayedAt: 50 });
  });
});

// ─── resolveCopy ───

describe("copies: resolveCopy", () => {
  it("names the default copy, the named copy, or nothing", async () => {
    const t = convexTest(schema, modules);
    await seedCopy(t, 1, 12);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 1, 5, OTHER); // another user's copy never counts
    await t.run(async (ctx) => {
      expect((await resolveCopy(ctx, USER, 1))?.instanceId).toBe(11);
      expect((await resolveCopy(ctx, USER, 1, 12))?.instanceId).toBe(12);
      expect(await resolveCopy(ctx, USER, 1, 77)).toBeNull();
      expect(await resolveCopy(ctx, USER, 2)).toBeNull();
      expect(await resolveCopy(ctx, USER, 1, 5)).toBeNull();
    });
  });

  it("refuses a bad id and a copy of a different release", async () => {
    const t = convexTest(schema, modules);
    await seedCopy(t, 1, 11);
    await t.run(async (ctx) => {
      await expect(resolveCopy(ctx, USER, 1, NaN)).rejects.toThrow("Invalid copy.");
      await expect(resolveCopy(ctx, USER, 2, 11)).rejects.toThrow(/another release/);
    });
  });
});

// ─── Purge verdicts ───

describe("purge_tags with copies", () => {
  it("an old-shaped upsert {release_id} stores the cached copy's instance id", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 1, tag: "cut" });
    expect((await tags(t)).map((r) => [r.release_id, r.instance_id, r.tag])).toEqual([[1, 11, "cut"]]);
    // A second old-shaped call patches the same row.
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 1, tag: "keep" });
    expect((await tags(t)).map((r) => [r.instance_id, r.tag])).toEqual([[11, "keep"]]);
  });

  it("an old-shaped upsert for a release that isn't cached stays release-only", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 9, tag: "maybe" });
    const [row] = await tags(t);
    expect(row.instance_id).toBeUndefined();
  });

  it("adopts a release-only row instead of adding a second one", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await t.run((ctx) =>
      ctx.db.insert("purge_tags", { discogs_username: USER, release_id: 1, tag: "cut", tagged_at: 1 })
    );
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 1, tag: "keep" });
    expect((await tags(t)).map((r) => [r.instance_id, r.tag])).toEqual([[11, "keep"]]);
  });

  it("with two copies, each keeps its own verdict", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 1, 12);
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 1, tag: "cut", instance_id: 12 });
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 1, tag: "keep", instance_id: 11 });
    const rows = (await tags(t)).map((r) => [r.instance_id, r.tag]).sort();
    expect(rows).toEqual([[11, "keep"], [12, "cut"]]);
    // Clearing one copy leaves the other.
    await t.mutation(api.purge_tags.remove, { sessionToken: TOKEN, release_id: 1, instance_id: 12 });
    expect((await tags(t)).map((r) => [r.instance_id, r.tag])).toEqual([[11, "keep"]]);
  });

  it("refuses NaN and a copy of another release, writing nothing", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await expect(
      t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 1, tag: "cut", instance_id: NaN })
    ).rejects.toThrow("Invalid copy.");
    await expect(
      t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 2, tag: "cut", instance_id: 11 })
    ).rejects.toThrow(/another release/);
    expect(await tags(t)).toEqual([]);
  });

  it("an old-shaped remove clears the default copy's verdict and any release-only one", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", { discogs_username: USER, release_id: 1, tag: "cut", tagged_at: 1, instance_id: 11 });
      await ctx.db.insert("purge_tags", { discogs_username: USER, release_id: 1, tag: "maybe", tagged_at: 2 });
      // A verdict of a copy that has left stays: it isn't the default copy's.
      await ctx.db.insert("purge_tags", { discogs_username: USER, release_id: 1, tag: "keep", tagged_at: 3, instance_id: 99 });
    });
    await t.mutation(api.purge_tags.remove, { sessionToken: TOKEN, release_id: 1 });
    expect((await tags(t)).map((r) => r.instance_id)).toEqual([99]);
  });

  it("an old-shaped remove for an uncached release removes one row, as before", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, release_id: 9, tag: "cut" });
    await t.mutation(api.purge_tags.remove, { sessionToken: TOKEN, release_id: 9 });
    expect(await tags(t)).toEqual([]);
  });

  it("rejects a bad session token on the new-shaped call", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await expect(
      t.mutation(api.purge_tags.upsert, { sessionToken: "bogus", release_id: 1, tag: "cut", instance_id: 11 })
    ).rejects.toThrow("Unauthorized");
  });
});

// ─── Plays ───

describe("last_played with copies", () => {
  it("an old-shaped logPlay goes on the default copy; a named copy gets its own", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 12);
    await seedCopy(t, 1, 11);
    await t.mutation(api.last_played.logPlay, { sessionToken: TOKEN, release_id: 1, played_at: 100 });
    await t.mutation(api.last_played.logPlay, { sessionToken: TOKEN, release_id: 1, played_at: 200, instance_id: 12 });
    await t.mutation(api.last_played.logPlay, { sessionToken: TOKEN, release_id: 9, played_at: 300 });
    expect((await plays(t)).map((p) => [p.release_id, p.instance_id, p.played_at])).toEqual([
      [1, 11, 100],
      [1, 12, 200],
      [9, undefined, 300],
    ]);

    const history12 = await t.query(api.last_played.getHistoryByCopy, { sessionToken: TOKEN, instance_id: 12 });
    expect(history12.map((h) => h.played_at)).toEqual([200]);
    // The release-level history old clients read still sees every play of it.
    const byRelease = await t.query(api.last_played.getHistoryByRelease, { sessionToken: TOKEN, release_id: 1 });
    expect(byRelease.map((h) => h.played_at)).toEqual([200, 100]);
  });

  it("getHistoryByCopy is scoped to the caller and rejects bad tokens", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedUser(t, OTHER, OTHER_TOKEN);
    await seedCopy(t, 1, 11, OTHER);
    await t.mutation(api.last_played.logPlay, { sessionToken: OTHER_TOKEN, release_id: 1, played_at: 5 });
    expect(await t.query(api.last_played.getHistoryByCopy, { sessionToken: TOKEN, instance_id: 11 })).toEqual([]);
    await expect(
      t.query(api.last_played.getHistoryByCopy, { sessionToken: "bogus", instance_id: 11 })
    ).rejects.toThrow("Unauthorized");
  });
});

// ─── Collection cache ───

describe("collection with copies", () => {
  const addArgs = (instanceId: number, notes = "") => ({
    sessionToken: TOKEN,
    releaseId: 1,
    instanceId,
    artist: "A",
    title: "T",
    year: 1990,
    cover: "c",
    folder: "Uncategorized",
    label: "L",
    catalogNumber: "C",
    format: "Vinyl",
    mediaCondition: "",
    sleeveCondition: "",
    notes,
    dateAdded: "2024-01-01",
  });

  it("addItem is idempotent per copy, and a second copy is its own row", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await t.mutation(api.collection.addItem, addArgs(11));
    await t.mutation(api.collection.addItem, addArgs(11, "again"));
    await t.mutation(api.collection.addItem, addArgs(12));
    const rows = await t.query(api.collection.getCopies, { sessionToken: TOKEN });
    expect(rows.map((r) => [r.instanceId, r.notes])).toEqual([[11, "again"], [12, ""]]);
    // getCopies is getByUsername under its own name.
    expect(await t.query(api.collection.getByUsername, { sessionToken: TOKEN })).toEqual(rows);
  });

  it("getCopies rejects a bad session token", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.collection.getCopies, { sessionToken: "bogus" })).rejects.toThrow("Unauthorized");
  });
});

// ─── Sessions ───

describe("stacks with copies: album_ids and copy_ids stay in step", () => {
  it("an old-shaped create fills copy_ids with each release's default copy", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 12);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 2, 20);
    await t.mutation(api.stacks.create, { sessionToken: TOKEN, stack_id: "s", name: "S", album_ids: [2, 1, 7] });
    const doc = await stackDoc(t, "s");
    expect(doc.album_ids).toEqual([2, 1, 7]);
    expect(doc.copy_ids).toEqual([20, 11]); // 7 isn't owned: no copy
  });

  it("a new-shaped create derives album_ids from copy_ids", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 1, 12);
    await seedCopy(t, 2, 20);
    await t.mutation(api.stacks.create, {
      sessionToken: TOKEN,
      stack_id: "s",
      name: "S",
      album_ids: [],
      copy_ids: [12, 20, 11],
    });
    const doc = await stackDoc(t, "s");
    expect(doc.copy_ids).toEqual([12, 20, 11]);
    expect(doc.album_ids).toEqual([1, 2]);
  });

  it("an old-shaped update keeps the copy the session held", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 1, 12);
    await seedCopy(t, 2, 20);
    await seedCopy(t, 3, 30);
    await t.mutation(api.stacks.create, { sessionToken: TOKEN, stack_id: "s", name: "S", album_ids: [], copy_ids: [12, 20] });
    // An old build reorders, drops release 2 and adds release 3.
    await t.mutation(api.stacks.update, { sessionToken: TOKEN, stack_id: "s", album_ids: [3, 1] });
    const doc = await stackDoc(t, "s");
    expect(doc.album_ids).toEqual([3, 1]);
    expect(doc.copy_ids).toEqual([30, 12]); // 12, not the default 11
  });

  it("a new-shaped update sets both, and excluded_copy_ids is stored", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 2, 20);
    await t.mutation(api.stacks.create, { sessionToken: TOKEN, stack_id: "s", name: "S", album_ids: [1] });
    await t.mutation(api.stacks.update, { sessionToken: TOKEN, stack_id: "s", copy_ids: [20, 11] });
    let doc = await stackDoc(t, "s");
    expect([doc.album_ids, doc.copy_ids]).toEqual([[2, 1], [20, 11]]);

    await t.mutation(api.stacks.create, {
      sessionToken: TOKEN,
      stack_id: "auto",
      name: "Auto",
      album_ids: [],
      kind: "auto",
      rule: { match: "all", conditions: [{ field: "year", op: "after", value: 1900 }], sort: "artist-az", rotation: "off" },
    });
    await t.mutation(api.stacks.update, { sessionToken: TOKEN, stack_id: "auto", excluded_copy_ids: [20], copy_ids: [11] });
    doc = await stackDoc(t, "auto");
    expect(doc.excluded_copy_ids).toEqual([20]);
    // An auto session never stores members, either way.
    expect(doc.album_ids).toEqual([]);
    expect(doc.copy_ids).toBeUndefined();
  });

  it("refuses a bad copy id", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await expect(
      t.mutation(api.stacks.create, { sessionToken: TOKEN, stack_id: "s", name: "S", album_ids: [], copy_ids: [NaN] })
    ).rejects.toThrow("Invalid copy.");
  });

  it("freeze stores both, from copies or from releases", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11);
    await seedCopy(t, 1, 12);
    await t.mutation(api.stacks.create, { sessionToken: TOKEN, stack_id: "s", name: "S", album_ids: [] });
    await t.mutation(api.stacks.freeze, { sessionToken: TOKEN, stack_id: "s", album_ids: [1] });
    let doc = await stackDoc(t, "s");
    expect([doc.album_ids, doc.copy_ids, doc.kind]).toEqual([[1], [11], "manual"]);
    await t.mutation(api.stacks.freeze, { sessionToken: TOKEN, stack_id: "s", album_ids: [], copy_ids: [12, 11] });
    doc = await stackDoc(t, "s");
    expect([doc.album_ids, doc.copy_ids]).toEqual([[1], [12, 11]]);
  });

  it("a shared manual session shows the copies it holds", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 11, USER, { title: "First copy" });
    await seedCopy(t, 1, 12, USER, { title: "Second copy" });
    await t.run((ctx) =>
      ctx.db.insert("stacks", {
        discogs_username: USER,
        stack_id: "s",
        name: "S",
        album_ids: [1],
        copy_ids: [12, 99],
        created_at: 1,
        last_modified: 1,
        share_id: "share-copies",
      })
    );
    const shared = await t.query(api.stacks.getShared, { share_id: "share-copies" });
    // 99 left the collection: skipped. Only whitelisted fields.
    expect(shared?.albums).toEqual([
      { title: "Second copy", artist: "Artist 1", year: 1990, cover: "cover-1", thumb: "thumb-1" },
    ]);
  });

  it("an auto session plays both copies, each with its own verdict, and getShared agrees", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCopy(t, 1, 12, USER, { title: "Copy B" });
    await seedCopy(t, 1, 11, USER, { title: "Copy A" });
    await seedCopy(t, 2, 20);
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", { discogs_username: USER, release_id: 1, instance_id: 12, tag: "cut", tagged_at: 1 });
      await ctx.db.insert("stacks", {
        discogs_username: USER,
        stack_id: "keepers",
        name: "Not cut",
        album_ids: [],
        kind: "auto",
        rule: { match: "all", conditions: [{ field: "purgeTag", op: "isNot", value: "cut" }], sort: "artist-az", rotation: "off" },
        created_at: 1,
        last_modified: 1,
        share_id: "share-auto",
      });
      await ctx.db.insert("stacks", {
        discogs_username: USER,
        stack_id: "everything",
        name: "Everything",
        album_ids: [],
        kind: "auto",
        rule: { match: "all", conditions: [{ field: "year", op: "after", value: 1900 }], sort: "artist-az", rotation: "off" },
        created_at: 1,
        last_modified: 1,
      });
    });
    const membership = await t.query(api.stacks.getMembership, { sessionToken: TOKEN });
    // Copy 12 is cut; its sibling 11 is not, and stays.
    expect(membership.keepers).toMatchObject({ ids: [1, 2], copyIds: [11, 20], poolSize: 2 });
    // Both copies match a rule that doesn't tell them apart: both play (Q3),
    // the lower instance id first.
    expect(membership.everything).toMatchObject({ ids: [1, 1, 2], copyIds: [11, 12, 20], poolSize: 3 });
    const shared = await t.query(api.stacks.getShared, { share_id: "share-auto" });
    expect(shared?.albums.map((a) => a.title)).toEqual(["Copy A", "Title 2"]);
  });
});
