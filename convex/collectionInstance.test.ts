// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { toCollectionRow, type SyncedAlbum } from "./cacheRows";

const modules = import.meta.glob("./**/*.ts");

/**
 * Per-copy cache writes (WO-03 / audit A-06). A user can own two copies of one
 * release, so the cache can hold two rows with the same releaseId. removeItem
 * and updateInstance used to take `.first()` by release and could touch the
 * other copy. With an instance id they take that copy; without one they behave
 * as before.
 */

const USER = "twocopies";
const OTHER = "someoneelse";
const TOKEN = "tok-twocopies";
const RELEASE = 500;

type T = TestConvex<typeof schema>;

const album = (instanceId: number, overrides: Partial<SyncedAlbum> = {}): SyncedAlbum => ({
  release_id: RELEASE,
  instance_id: instanceId,
  folder_id: 1,
  title: "Title",
  artist: "Artist",
  year: 1990,
  thumb: "",
  cover: "cover",
  folder: "Uncategorized",
  label: "Label",
  catalogNumber: "CAT",
  format: "Vinyl, LP",
  mediaCondition: "",
  sleeveCondition: "",
  notes: "",
  dateAdded: "2024-01-01T00:00:00-08:00",
  ...overrides,
});

async function seed(t: T, copies: SyncedAlbum[]) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: USER,
      access_token: "access",
      token_secret: "secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", { session_token: TOKEN, discogs_username: USER, created_at: Date.now() });
    for (const copy of copies) {
      await ctx.db.insert("collection", { discogsUsername: USER, ...toCollectionRow(copy) });
    }
  });
}

const rows = (t: T, username = USER) =>
  t.run(async (ctx) => {
    const all = await ctx.db
      .query("collection")
      .withIndex("by_username", (q) => q.eq("discogsUsername", username))
      .collect();
    return all.sort((a, b) => a.instanceId - b.instanceId);
  });

describe("removeItem with two copies of a release", () => {
  it("removes the copy with the given instance id, not the first one", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE, instanceId: 22 });
    expect((await rows(t)).map((r) => r.instanceId)).toEqual([11]);
  });

  it("removes the first copy when that's the one asked for", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE, instanceId: 11 });
    expect((await rows(t)).map((r) => r.instanceId)).toEqual([22]);
  });

  it("logs the removal against the copy that went", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE, instanceId: 22 });
    const logged = await t.run((ctx) => ctx.db.query("collection_removals").collect());
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ releaseId: RELEASE, instanceId: 22 });
  });

  it("keeps the old behavior without an instance id: one row goes", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE });
    expect(await rows(t)).toHaveLength(1);
  });

  it("with an instance id no row has, removes the release's only row", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE, instanceId: 999 });
    expect(await rows(t)).toHaveLength(0);
  });

  it("with an instance id no row has and two copies, removes neither", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE, instanceId: 999 });
    expect(await rows(t)).toHaveLength(2);
  });

  it("never touches another user's copy with the same instance id", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11)]);
    await t.run((ctx) =>
      ctx.db.insert("collection", { discogsUsername: OTHER, ...toCollectionRow(album(11)) })
    );
    await t.mutation(api.collection.removeItem, { sessionToken: TOKEN, releaseId: RELEASE, instanceId: 11 });
    expect(await rows(t)).toHaveLength(0);
    expect(await rows(t, OTHER)).toHaveLength(1);
  });

  it("rejects a bad session token", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11)]);
    await expect(
      t.mutation(api.collection.removeItem, { sessionToken: "nope", releaseId: RELEASE, instanceId: 11 })
    ).rejects.toThrow();
  });
});

describe("updateInstance with two copies of a release", () => {
  it("patches the copy named by matchInstanceId and leaves the other alone", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11, { notes: "first" }), album(22, { notes: "second" })]);
    await t.mutation(api.collection.updateInstance, {
      sessionToken: TOKEN,
      releaseId: RELEASE,
      matchInstanceId: 22,
      notes: "edited",
      rating: 4,
    });
    const [a, b] = await rows(t);
    expect(a).toMatchObject({ instanceId: 11, notes: "first" });
    expect(a.rating).toBeUndefined();
    expect(b).toMatchObject({ instanceId: 22, notes: "edited", rating: 4 });
  });

  it("a folder move stores the new instance id on the matched copy only", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.updateInstance, {
      sessionToken: TOKEN,
      releaseId: RELEASE,
      matchInstanceId: 22,
      folder: "Jazz",
      folderId: 7,
      instanceId: 33,
    });
    const all = await rows(t);
    expect(all.map((r) => r.instanceId)).toEqual([11, 33]);
    expect(all.find((r) => r.instanceId === 33)).toMatchObject({ folder: "Jazz", folderId: 7 });
    expect(all.find((r) => r.instanceId === 11)).toMatchObject({ folder: "Uncategorized", folderId: 1 });
  });

  it("without matchInstanceId it patches one row, as before", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.updateInstance, { sessionToken: TOKEN, releaseId: RELEASE, notes: "x" });
    expect((await rows(t)).filter((r) => r.notes === "x")).toHaveLength(1);
  });

  it("the PWA's folder-move call (instanceId only) still patches a lone copy", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11)]);
    await t.mutation(api.collection.updateInstance, {
      sessionToken: TOKEN,
      releaseId: RELEASE,
      folder: "Jazz",
      folderId: 7,
      instanceId: 44,
    });
    expect(await rows(t)).toMatchObject([{ instanceId: 44, folder: "Jazz", folderId: 7 }]);
  });

  it("with a stale matchInstanceId and a lone copy, patches that copy", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11)]);
    await t.mutation(api.collection.updateInstance, {
      sessionToken: TOKEN,
      releaseId: RELEASE,
      matchInstanceId: 999,
      notes: "x",
    });
    expect((await rows(t))[0].notes).toBe("x");
  });

  it("with a stale matchInstanceId and two copies, patches neither", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [album(11), album(22)]);
    await t.mutation(api.collection.updateInstance, {
      sessionToken: TOKEN,
      releaseId: RELEASE,
      matchInstanceId: 999,
      notes: "x",
    });
    expect((await rows(t)).every((r) => r.notes === "")).toBe(true);
  });
});
