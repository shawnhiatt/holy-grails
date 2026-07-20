// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Session share links (Spec 3). getShared is a new cross-user surface, so
 * per the CLAUDE.md testing rule these protect the capability-token gate:
 *   1. The unguessable share_id is the ONLY key — no session token needed
 *   2. Unknown and revoked share_ids are both null (indistinguishable)
 *   3. enableShare/disableShare require a valid session token
 *   4. The payload never leaks username, tokens, notes, conditions, ids
 */

const NOW_ISH = 1_780_000_000_000;

function newTest() {
  return convexTest(schema, modules);
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  username: string,
  token: string
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "oauth-access-secret",
      token_secret: "oauth-token-secret",
      created_at: NOW_ISH,
    });
    await ctx.db.insert("auth_sessions", {
      session_token: token,
      discogs_username: username,
      created_at: Date.now(),
    });
  });
}

async function seedAlbum(
  t: ReturnType<typeof convexTest>,
  username: string,
  releaseId: number,
  overrides: Record<string, unknown> = {}
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("collection", {
      discogsUsername: username,
      releaseId,
      instanceId: releaseId * 10,
      artist: `Artist ${releaseId}`,
      title: `Title ${releaseId}`,
      year: 1990,
      thumb: `thumb-${releaseId}`,
      cover: `cover-${releaseId}`,
      folder: "Uncategorized",
      label: "Some Label",
      catalogNumber: "CAT-1",
      format: "Vinyl, LP",
      mediaCondition: "VG+",
      sleeveCondition: "VG",
      notes: "secret personal note",
      dateAdded: "2024-01-01T00:00:00-08:00",
      ...overrides,
    });
  });
}

async function seedStack(
  t: ReturnType<typeof convexTest>,
  username: string,
  stackId: string,
  albumIds: number[],
  shareId?: string
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("stacks", {
      discogs_username: username,
      stack_id: stackId,
      name: "Friday Night Set",
      album_ids: albumIds,
      created_at: NOW_ISH,
      last_modified: NOW_ISH,
      ...(shareId ? { share_id: shareId } : {}),
    });
  });
}

describe("enableShare / disableShare", () => {
  it("rejects a bad session token on enableShare", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedStack(t, "dj", "s1", [1]);
    await expect(
      t.mutation(api.stacks.enableShare, { sessionToken: "bogus", stack_id: "s1" })
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects a bad session token on disableShare", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedStack(t, "dj", "s1", [1], "shareabc");
    await expect(
      t.mutation(api.stacks.disableShare, { sessionToken: "bogus", stack_id: "s1" })
    ).rejects.toThrow("Unauthorized");
  });

  it("enableShare is idempotent — returns the same share_id", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedStack(t, "dj", "s1", [1]);
    const first = await t.mutation(api.stacks.enableShare, {
      sessionToken: "tok-dj",
      stack_id: "s1",
    });
    const second = await t.mutation(api.stacks.enableShare, {
      sessionToken: "tok-dj",
      stack_id: "s1",
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("getShared", () => {
  it("returns only whitelisted display fields for a valid share_id", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedAlbum(t, "dj", 2);
    await seedStack(t, "dj", "s1", [1, 2]);
    const shareId = await t.mutation(api.stacks.enableShare, {
      sessionToken: "tok-dj",
      stack_id: "s1",
    });

    const result = await t.query(api.stacks.getShared, { share_id: shareId });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Friday Night Set");
    expect(result!.albums).toHaveLength(2);
    expect(result!.albums[0]).toEqual({
      title: "Title 1",
      artist: "Artist 1",
      year: 1990,
      cover: "cover-1",
      thumb: "thumb-1",
    });
  });

  it("preserves session album order", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedAlbum(t, "dj", 2);
    await seedAlbum(t, "dj", 3);
    await seedStack(t, "dj", "s1", [3, 1, 2], "shareorder");

    const result = await t.query(api.stacks.getShared, { share_id: "shareorder" });
    expect(result!.albums.map((a) => a.title)).toEqual([
      "Title 3",
      "Title 1",
      "Title 2",
    ]);
  });

  it("silently skips albums that have left the collection", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    // releaseId 2 referenced by the stack but never in the collection cache
    await seedStack(t, "dj", "s1", [1, 2], "shareskip");

    const result = await t.query(api.stacks.getShared, { share_id: "shareskip" });
    expect(result!.albums).toHaveLength(1);
    expect(result!.albums[0].title).toBe("Title 1");
  });

  it("returns null for an unknown share_id", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedStack(t, "dj", "s1", [1], "realshare");
    expect(
      await t.query(api.stacks.getShared, { share_id: "nope-not-real" })
    ).toBeNull();
  });

  it("returns null for an empty share_id", async () => {
    const t = newTest();
    expect(await t.query(api.stacks.getShared, { share_id: "" })).toBeNull();
  });

  it("returns null after the share is revoked — unknown and revoked are indistinguishable", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedStack(t, "dj", "s1", [1]);
    const shareId = await t.mutation(api.stacks.enableShare, {
      sessionToken: "tok-dj",
      stack_id: "s1",
    });
    expect(await t.query(api.stacks.getShared, { share_id: shareId })).not.toBeNull();

    await t.mutation(api.stacks.disableShare, {
      sessionToken: "tok-dj",
      stack_id: "s1",
    });
    const revoked = await t.query(api.stacks.getShared, { share_id: shareId });
    const unknown = await t.query(api.stacks.getShared, { share_id: "never-existed" });
    expect(revoked).toBeNull();
    expect(revoked).toEqual(unknown);
  });

  it("never leaks username, tokens, notes, conditions, or ids in the payload", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedStack(t, "dj", "s1", [1], "shareleak");

    const result = await t.query(api.stacks.getShared, { share_id: "shareleak" });
    const serialized = JSON.stringify(result);
    for (const leak of [
      "dj", // discogs_username
      "oauth-access-secret",
      "oauth-token-secret",
      "tok-dj",
      "secret personal note",
      "VG+", // mediaCondition
    ]) {
      expect(serialized).not.toContain(leak);
    }
    // Album objects carry only the five display fields
    expect(Object.keys(result!.albums[0]).sort()).toEqual([
      "artist",
      "cover",
      "thumb",
      "title",
      "year",
    ]);
    for (const key of ["discogs_username", "share_id", "release_id", "releaseId"]) {
      expect(result).not.toHaveProperty(key);
    }
  });
});
