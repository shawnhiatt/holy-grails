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
 *
 * Session Builder additions: an auto session stores no album_ids, so getShared
 * evaluates its rule against the sharer's collection rows. The same four
 * invariants have to hold on that path, plus a fifth — a shared link must show
 * the same set the owner sees, which is what the deterministic rotation seed
 * buys.
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


async function seedAutoStack(
  t: ReturnType<typeof convexTest>,
  username: string,
  stackId: string,
  rule: Record<string, unknown>,
  shareId?: string,
  extra: Record<string, unknown> = {}
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("stacks", {
      discogs_username: username,
      stack_id: stackId,
      name: "Jazz before 1980",
      // An auto session stores no ids — that is the point.
      album_ids: [],
      kind: "auto" as const,
      rule: rule as never,
      created_at: NOW_ISH,
      last_modified: NOW_ISH,
      ...(shareId ? { share_id: shareId } : {}),
      ...extra,
    });
  });
}

const jazzBefore1980 = {
  match: "all" as const,
  conditions: [
    { field: "genre", op: "includesAny", value: ["Jazz"] },
    { field: "year", op: "before", value: 1980 },
  ],
  sort: "year-old",
  rotation: "off" as const,
};

describe("getShared — auto sessions", () => {
  it("evaluates the rule instead of reading album_ids", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1, { genres: ["Jazz"], year: 1965 });
    await seedAlbum(t, "dj", 2, { genres: ["Rock"], year: 1965 });
    await seedAlbum(t, "dj", 3, { genres: ["Jazz"], year: 1995 });
    await seedAutoStack(t, "dj", "s1", jazzBefore1980, "shareauto");

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums.map((a) => a.title)).toEqual(["Title 1"]);
  });

  it("returns them in the rule's sort order", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1, { genres: ["Jazz"], year: 1975 });
    await seedAlbum(t, "dj", 2, { genres: ["Jazz"], year: 1961 });
    await seedAutoStack(t, "dj", "s1", jazzBefore1980, "shareauto");

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums.map((a) => a.year)).toEqual([1961, 1975]);
  });

  it("honors exclusions", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1, { genres: ["Jazz"], year: 1965 });
    await seedAlbum(t, "dj", 2, { genres: ["Jazz"], year: 1966 });
    await seedAutoStack(t, "dj", "s1", jazzBefore1980, "shareauto", {
      excluded_ids: [2],
    });

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums.map((a) => a.title)).toEqual(["Title 1"]);
  });

  it("folds in purge tags, which live in their own table", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedAlbum(t, "dj", 2);
    await t.run(async (ctx) => {
      await ctx.db.insert("purge_tags", {
        discogs_username: "dj",
        release_id: 1,
        tag: "keep" as const,
        tagged_at: NOW_ISH,
      });
    });
    await seedAutoStack(
      t,
      "dj",
      "s1",
      {
        match: "all",
        conditions: [{ field: "purgeTag", op: "is", value: "keep" }],
        sort: "artist-az",
        rotation: "off",
      },
      "shareauto"
    );

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums.map((a) => a.title)).toEqual(["Title 1"]);
  });

  it("folds in play history, which also lives in its own table", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedAlbum(t, "dj", 2);
    await t.run(async (ctx) => {
      await ctx.db.insert("last_played", {
        discogs_username: "dj",
        release_id: 1,
        played_at: NOW_ISH,
      });
    });
    await seedAutoStack(
      t,
      "dj",
      "s1",
      {
        match: "all",
        conditions: [{ field: "lastPlayed", op: "never" }],
        sort: "artist-az",
        rotation: "off",
      },
      "shareauto"
    );

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums.map((a) => a.title)).toEqual(["Title 2"]);
  });

  it("applies the cap", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    for (let i = 1; i <= 6; i++) {
      await seedAlbum(t, "dj", i, { genres: ["Jazz"], year: 1960 + i });
    }
    await seedAutoStack(
      t,
      "dj",
      "s1",
      { ...jazzBefore1980, limit: 2 },
      "shareauto"
    );

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums).toHaveLength(2);
  });

  it("is stable across reads, so a viewer sees what the owner sees", async () => {
    // Rotation is a pure function of stack_id and the period bucket — no
    // stored state — so two reads in the same period must agree. Without
    // that, a share link would show a different set than the owner's screen.
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    for (let i = 1; i <= 30; i++) {
      await seedAlbum(t, "dj", i, { genres: ["Jazz"], year: 1960 });
    }
    await seedAutoStack(
      t,
      "dj",
      "s1",
      { ...jazzBefore1980, limit: 10, rotation: "daily", sort: "artist-az" },
      "shareauto"
    );

    const a = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    const b = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(a!.albums).toHaveLength(10);
    expect(a!.albums.map((x) => x.title)).toEqual(b!.albums.map((x) => x.title));
  });

  it("returns null for an unknown share id, same as a manual session", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1, { genres: ["Jazz"], year: 1965 });
    await seedAutoStack(t, "dj", "s1", jazzBefore1980, "shareauto");
    expect(await t.query(api.stacks.getShared, { share_id: "nope" })).toBeNull();
  });

  it("returns null once the share is revoked, indistinguishable from unknown", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1, { genres: ["Jazz"], year: 1965 });
    await seedAutoStack(t, "dj", "s1", jazzBefore1980, "shareauto");
    await t.mutation(api.stacks.disableShare, { sessionToken: "tok-dj", stack_id: "s1" });
    expect(await t.query(api.stacks.getShared, { share_id: "shareauto" })).toBeNull();
  });

  it("leaks nothing extra on the rule path — same whitelist as manual", async () => {
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1, { genres: ["Jazz"], year: 1965, rating: 5 });
    await seedAutoStack(t, "dj", "s1", jazzBefore1980, "shareauto");

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    const serialized = JSON.stringify(result);
    for (const leak of [
      "dj",
      "oauth-access-secret",
      "oauth-token-secret",
      "tok-dj",
      "secret personal note",
      "VG+",
    ]) {
      expect(serialized).not.toContain(leak);
    }
    // The rule itself must not ride along. ("Jazz" is deliberately NOT in the
    // leak list above — it is in the session's own name, which is shared on
    // purpose; the invariant is that the rule OBJECT never ships.)
    for (const ruleShape of ['"field"', '"op"', '"conditions"', '"rotation"']) {
      expect(serialized).not.toContain(ruleShape);
    }
    expect(Object.keys(result!.albums[0]).sort()).toEqual([
      "artist",
      "cover",
      "thumb",
      "title",
      "year",
    ]);
    for (const key of ["rule", "kind", "excluded_ids", "discogs_username", "share_id"]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it("shows nothing rather than everything when the rule is unreadable", async () => {
    // The fail-safe direction, on the surface where it matters most: a rule
    // built by a newer client must never expose the whole collection.
    const t = newTest();
    await seedUser(t, "dj", "tok-dj");
    await seedAlbum(t, "dj", 1);
    await seedAlbum(t, "dj", 2);
    await seedAutoStack(
      t,
      "dj",
      "s1",
      {
        match: "all",
        conditions: [{ field: "runtime", op: "atMost", value: 40 }],
        sort: "artist-az",
        rotation: "off",
      },
      "shareauto"
    );

    const result = await t.query(api.stacks.getShared, { share_id: "shareauto" });
    expect(result!.albums).toHaveLength(0);
  });
});
