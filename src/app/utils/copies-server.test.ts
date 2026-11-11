// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import { evaluateStackRule, type RuleAlbum, type StackRule } from "../../../convex/stackRules";
import {
  buildPlayMaps,
  cacheRemoveArgs,
  copyArgs,
  copyKey,
  deriveAlbums,
  needsReleaseOnlyTagClear,
  sessionMemberArgs,
  sessionMemberKeys,
} from "./copies";

/* Every copy (DW-04c), end to end: the PWA's own write arguments (utils/
   copies.ts) sent to the real Convex functions, over a collection that owns
   two copies of one release. Release 7 is owned twice — copy 71 (the default,
   lowest id) and copy 72 — and release 8 once (copy 81). The two copies get
   different covers here only so the share page can tell them apart. */

const modules = import.meta.glob("../../../convex/**/*.ts");
const TOKEN = "tok-dj";

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: "dj",
      access_token: "oauth-access-secret",
      token_secret: "oauth-token-secret",
      created_at: 1_780_000_000_000,
    });
    await ctx.db.insert("auth_sessions", {
      session_token: TOKEN,
      discogs_username: "dj",
      created_at: Date.now(),
    });
    const copy = (releaseId: number, instanceId: number, cover: string) =>
      ctx.db.insert("collection", {
        discogsUsername: "dj",
        releaseId,
        instanceId,
        artist: `Artist ${releaseId}`,
        title: `Title ${releaseId}`,
        year: 1990,
        cover,
        folder: "Uncategorized",
        label: "Label",
        catalogNumber: "CAT",
        format: "Vinyl, LP",
        mediaCondition: "VG+",
        sleeveCondition: "VG",
        notes: "",
        dateAdded: "2024-01-01T00:00:00-08:00",
      });
    await copy(7, 71, "cover-copy-71");
    await copy(7, 72, "cover-copy-72");
    await copy(8, 81, "cover-81");
  });
  return t;
}

/** What the PWA derives on screen right now. */
async function onScreen(t: Awaited<ReturnType<typeof setup>>) {
  const rows = await t.query(api.collection.getCopies, { sessionToken: TOKEN });
  const tags = await t.query(api.purge_tags.getByUsername, { sessionToken: TOKEN });
  const plays = await t.query(api.last_played.getByUsername, { sessionToken: TOKEN });
  const albums = deriveAlbums(rows, tags);
  const byId = (id: string) => albums.find((a) => a.id === id)!;
  return { rows, tags, plays, albums, byId, playMaps: buildPlayMaps(plays, rows) };
}

describe("two copies of one release", () => {
  it("are two cards", async () => {
    const t = await setup();
    const { albums } = await onScreen(t);
    expect(albums.map((a) => a.id).sort()).toEqual(["c-71", "c-72", "c-81"]);
  });

  it("keep separate verdicts", async () => {
    const t = await setup();
    const { byId } = await onScreen(t);
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, ...copyArgs(byId("c-72")), tag: "cut" });
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, ...copyArgs(byId("c-71")), tag: "keep" });
    const after = await onScreen(t);
    expect(after.byId("c-72").purgeTag).toBe("cut");
    expect(after.byId("c-71").purgeTag).toBe("keep");
    expect(after.byId("c-81").purgeTag).toBeNull();
  });

  /* The data-loss case the whole change exists for: before copies, a Cut on
     one copy showed on both, and Purge Cut removed both from the cache (and
     from Discogs). */
  it("Purge Cut removes only the Cut copy and leaves the other's verdict", async () => {
    const t = await setup();
    const { byId } = await onScreen(t);
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, ...copyArgs(byId("c-72")), tag: "cut" });
    await t.mutation(api.purge_tags.upsert, { sessionToken: TOKEN, ...copyArgs(byId("c-71")), tag: "keep" });

    const { albums } = await onScreen(t);
    const toCut = albums.filter((a) => a.purgeTag === "cut");
    expect(toCut.map((a) => a.id)).toEqual(["c-72"]);
    // executePurgeCut's two cache writes per copy, in its order.
    for (const album of toCut) {
      await t.mutation(api.purge_tags.remove, { sessionToken: TOKEN, ...copyArgs(album) });
      await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, ...cacheRemoveArgs(album) });
    }

    const after = await onScreen(t);
    expect(after.albums.map((a) => a.id).sort()).toEqual(["c-71", "c-81"]);
    expect(after.byId("c-71").purgeTag).toBe("keep");
    // The removal is logged per copy.
    const removals = await t.run((ctx) => ctx.db.query("collection_removals").collect());
    expect(removals.map((r) => [r.releaseId, r.instanceId])).toEqual([[7, 72]]);
  });

  it("log a play on the copy that was played", async () => {
    const t = await setup();
    const { byId } = await onScreen(t);
    await t.mutation(api.last_played.logPlay, { sessionToken: TOKEN, ...copyArgs(byId("c-72")), played_at: 5000 });

    const after = await onScreen(t);
    expect(after.playMaps.countMap).toEqual({ "c-72": 1 });
    const historyB = await t.query(api.last_played.getHistoryByCopy, { sessionToken: TOKEN, instance_id: 72 });
    const historyA = await t.query(api.last_played.getHistoryByCopy, { sessionToken: TOKEN, instance_id: 71 });
    expect(historyB.map((h) => h.played_at)).toEqual([5000]);
    expect(historyA).toEqual([]);
  });

  it("clearing the default copy's release-only verdict leaves the twin's own verdict", async () => {
    const t = await setup();
    // A release-only "cut" (written before copies) folds onto copy 71; copy
    // 72 has its own "keep".
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", { discogs_username: "dj", release_id: 7, tag: "cut", tagged_at: 1 });
      await ctx.db.insert("purge_tags", {
        discogs_username: "dj", release_id: 7, instance_id: 72, tag: "keep", tagged_at: 2,
      });
    });
    const before = await onScreen(t);
    expect(before.byId("c-71").purgeTag).toBe("cut");
    expect(before.byId("c-72").purgeTag).toBe("keep");

    // app-context clearCopyTagOnServer, for copy 71.
    const a = before.byId("c-71");
    expect(needsReleaseOnlyTagClear(a, before.albums, before.tags)).toBe(true);
    await t.mutation(api.purge_tags.remove, { sessionToken: TOKEN, ...copyArgs(a) });
    await t.mutation(api.purge_tags.remove, { sessionToken: TOKEN, release_id: a.release_id });

    const after = await onScreen(t);
    expect(after.byId("c-71").purgeTag).toBeNull();
    expect(after.byId("c-72").purgeTag).toBe("keep");
  });
});

describe("sessions hold copies", () => {
  it("a manual session holds the chosen copy, and its share page shows that copy", async () => {
    const t = await setup();
    const { albums } = await onScreen(t);
    await t.mutation(api.stacks.create, {
      sessionToken: TOKEN,
      stack_id: "s1",
      name: "Friday",
      ...sessionMemberArgs(["c-72"], albums),
    });

    const [stored] = await t.query(api.stacks.getByUsername, { sessionToken: TOKEN });
    expect(stored.copy_ids).toEqual([72]);
    expect(stored.album_ids).toEqual([7]);
    // What the PWA hydrates back: the same copy, not the release's default.
    const rows = await t.query(api.collection.getCopies, { sessionToken: TOKEN });
    expect(sessionMemberKeys(stored, rows)).toEqual(["c-72"]);

    const shareId = await t.mutation(api.stacks.enableShare, { sessionToken: TOKEN, stack_id: "s1" });
    const shared = await t.query(api.stacks.getShared, { share_id: shareId });
    expect(shared!.albums.map((a) => a.cover)).toEqual(["cover-copy-72"]);
  });

  it("reordering and adding keep copies apart", async () => {
    const t = await setup();
    const { albums } = await onScreen(t);
    await t.mutation(api.stacks.create, {
      sessionToken: TOKEN, stack_id: "s1", name: "Friday", ...sessionMemberArgs(["c-72"], albums),
    });
    await t.mutation(api.stacks.update, {
      sessionToken: TOKEN, stack_id: "s1", ...sessionMemberArgs(["c-81", "c-72", "c-71"], albums),
    });
    const [stored] = await t.query(api.stacks.getByUsername, { sessionToken: TOKEN });
    expect(stored.copy_ids).toEqual([81, 72, 71]);
    expect(stored.album_ids).toEqual([8, 7]);
  });

  /* The owner's auto session (evaluated in the PWA) and its share link /
     the native app (evaluated server-side) must hold the same copies. */
  it("an auto session's copies agree with the server's, exclusions included", async () => {
    const t = await setup();
    const rule: StackRule = {
      match: "all",
      conditions: [{ field: "artist", op: "contains", value: "Artist" }],
      sort: "artist-az",
      rotation: "off",
    };
    await t.mutation(api.stacks.create, {
      sessionToken: TOKEN, stack_id: "auto1", name: "All", album_ids: [], kind: "auto", rule,
    });
    await t.mutation(api.last_played.logPlay, { sessionToken: TOKEN, release_id: 7, instance_id: 72, played_at: 10 });
    await t.mutation(api.stacks.update, { sessionToken: TOKEN, stack_id: "auto1", excluded_copy_ids: [81] });

    const { albums, playMaps } = await onScreen(t);
    const ruleAlbums: RuleAlbum[] = albums.map((a) => ({
      releaseId: a.release_id,
      instanceId: a.instance_id,
      artist: a.artist,
      title: a.title,
      label: a.label,
      year: a.year,
      format: a.format,
      folder: a.folder,
      mediaCondition: a.mediaCondition,
      dateAdded: a.dateAdded,
      purgeTag: a.purgeTag,
      lastPlayedAt: playMaps.lastPlayedMap[a.id] ? new Date(playMaps.lastPlayedMap[a.id]).getTime() : null,
      playCount: playMaps.countMap[a.id] ?? 0,
    }));
    const client = evaluateStackRule(ruleAlbums, rule, { stackId: "auto1", excludedCopyIds: [81] });
    const server = await t.query(api.stacks.getMembership, { sessionToken: TOKEN });
    expect(client.albums.map((a) => copyKey(a.instanceId!))).toEqual(server.auto1.copyIds.map(copyKey));
    expect(server.auto1.copyIds).toEqual([71, 72]);
  });
});
