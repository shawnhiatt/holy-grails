// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * The cross-user data gate (see "Cross-User Data Pattern" in CLAUDE.md).
 * These tests protect the security invariants:
 *   1. Unauthenticated viewers get an error (or null), never data
 *   2. Only shareActivity === true users are ever exposed
 *   3. "Not found" and "not opted in" are indistinguishable to callers
 *   4. No token fields leak through the return types
 */

const NOW_ISH = 1_780_000_000_000;

function newTest() {
  return convexTest(schema, modules);
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  username: string,
  opts: { shareActivity?: boolean; withSession?: boolean } = {}
) {
  const token = `tok-${username}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "oauth-access-secret",
      token_secret: "oauth-token-secret",
      created_at: NOW_ISH,
      ...(opts.shareActivity !== undefined ? { shareActivity: opts.shareActivity } : {}),
    });
    if (opts.withSession !== false) {
      await ctx.db.insert("auth_sessions", {
        session_token: token,
        discogs_username: username,
        created_at: Date.now(),
      });
    }
  });
  return token;
}

async function seedPlays(
  t: ReturnType<typeof convexTest>,
  username: string,
  plays: { release_id: number; played_at: number }[]
) {
  await t.run(async (ctx) => {
    for (const p of plays) {
      await ctx.db.insert("last_played", { discogs_username: username, ...p });
    }
  });
}

describe("getHolyGrailsUsers", () => {
  it("throws for an unauthenticated viewer", async () => {
    const t = newTest();
    await seedUser(t, "target", { shareActivity: true });
    await expect(
      t.query(api.users.getHolyGrailsUsers, {
        sessionToken: "bogus",
        usernames: ["target"],
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("returns only users with shareActivity === true", async () => {
    const t = newTest();
    const viewerToken = await seedUser(t, "viewer");
    await seedUser(t, "optedin", { shareActivity: true, withSession: false });
    await seedUser(t, "optedout", { shareActivity: false, withSession: false });
    await seedUser(t, "undecided", { withSession: false }); // shareActivity undefined

    const result = await t.query(api.users.getHolyGrailsUsers, {
      sessionToken: viewerToken,
      usernames: ["optedin", "optedout", "undecided", "not-a-user"],
    });

    expect(result.map((u) => u.discogs_username)).toEqual(["optedin"]);
  });

  it("never leaks token fields in results", async () => {
    const t = newTest();
    const viewerToken = await seedUser(t, "viewer");
    await seedUser(t, "optedin", { shareActivity: true, withSession: false });

    const [row] = await t.query(api.users.getHolyGrailsUsers, {
      sessionToken: viewerToken,
      usernames: ["optedin"],
    });

    for (const key of ["access_token", "token_secret", "session_token"]) {
      expect(row).not.toHaveProperty(key);
    }
  });
});

describe("getPublicActivitySummary", () => {
  it("returns null for an unauthenticated viewer, even against an opted-in target", async () => {
    const t = newTest();
    await seedUser(t, "target", { shareActivity: true });
    await seedPlays(t, "target", [{ release_id: 1, played_at: NOW_ISH }]);

    const result = await t.query(api.last_played.getPublicActivitySummary, {
      sessionToken: "bogus",
      targetUsername: "target",
    });
    expect(result).toBeNull();
  });

  it("'not found' and 'not opted in' are indistinguishable (both null)", async () => {
    const t = newTest();
    const viewerToken = await seedUser(t, "viewer");
    await seedUser(t, "optedout", { shareActivity: false, withSession: false });

    const missing = await t.query(api.last_played.getPublicActivitySummary, {
      sessionToken: viewerToken,
      targetUsername: "ghost-user",
    });
    const notOptedIn = await t.query(api.last_played.getPublicActivitySummary, {
      sessionToken: viewerToken,
      targetUsername: "optedout",
    });

    expect(missing).toBeNull();
    expect(notOptedIn).toBeNull();
    expect(missing).toEqual(notOptedIn);
  });

  it("shareActivity undefined (pre-prompt users) is treated as not opted in", async () => {
    const t = newTest();
    const viewerToken = await seedUser(t, "viewer");
    await seedUser(t, "undecided", { withSession: false });
    await seedPlays(t, "undecided", [{ release_id: 1, played_at: NOW_ISH }]);

    const result = await t.query(api.last_played.getPublicActivitySummary, {
      sessionToken: viewerToken,
      targetUsername: "undecided",
    });
    expect(result).toBeNull();
  });

  it("a viewer on a fresh login (auth_sessions token) can read an opted-in target", async () => {
    const t = newTest();
    // seedUser mints the token as an auth_sessions row — the ONLY path new
    // logins get since the per-device sessions migration. This is the normal
    // case in production, not an edge case.
    const viewerToken = await seedUser(t, "viewer");
    await seedUser(t, "target", { shareActivity: true, withSession: false });
    await seedPlays(t, "target", [
      { release_id: 10, played_at: NOW_ISH - 100 },
      { release_id: 10, played_at: NOW_ISH - 50 },
      { release_id: 20, played_at: NOW_ISH },
    ]);

    const result = await t.query(api.last_played.getPublicActivitySummary, {
      sessionToken: viewerToken,
      targetUsername: "target",
    });

    expect(result).not.toBeNull();
    expect(result!.totalPlays).toBe(3);
    // Recent plays sorted newest first
    expect(result!.recentPlays[0]).toEqual({ release_id: 20, played_at: NOW_ISH });
    // Top played ranked by play count
    expect(result!.topPlayed[0]).toEqual({ release_id: 10, playCount: 2 });
  });

  it("caps recentPlays at 10 and topPlayed at 5", async () => {
    const t = newTest();
    const viewerToken = await seedUser(t, "viewer");
    await seedUser(t, "target", { shareActivity: true, withSession: false });
    const plays = Array.from({ length: 14 }, (_, i) => ({
      release_id: 100 + i, // 14 distinct releases
      played_at: NOW_ISH + i,
    }));
    await seedPlays(t, "target", plays);

    const result = await t.query(api.last_played.getPublicActivitySummary, {
      sessionToken: viewerToken,
      targetUsername: "target",
    });

    expect(result!.totalPlays).toBe(14);
    expect(result!.recentPlays).toHaveLength(10);
    expect(result!.topPlayed).toHaveLength(5);
  });
});
