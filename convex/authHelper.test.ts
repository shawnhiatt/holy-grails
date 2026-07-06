// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { SESSION_TTL_MS } from "./authHelper";

const modules = import.meta.glob("./**/*.ts");

const NOW = new Date("2026-07-06T12:00:00Z").getTime();

function newTest() {
  return convexTest(schema, modules);
}

/** Seed a user plus a sessions-table row (the fresh-login path). */
async function seedUser(
  t: ReturnType<typeof convexTest>,
  username: string,
  opts: { sessionAge?: number; shareActivity?: boolean } = {}
) {
  const token = `tok-${username}-${Math.random().toString(36).slice(2)}`;
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "oauth-access-secret",
      token_secret: "oauth-token-secret",
      created_at: NOW,
      ...(opts.shareActivity !== undefined ? { shareActivity: opts.shareActivity } : {}),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: token,
      discogs_username: username,
      created_at: NOW - (opts.sessionAge ?? 0),
    });
  });
  return token;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session token auth guard", () => {
  it("authenticates a valid sessions-table token", async () => {
    const t = newTest();
    const token = await seedUser(t, "shawn");
    const me = await t.query(api.users.getMe, { sessionToken: token });
    expect(me.discogs_username).toBe("shawn");
  });

  it("rejects an unknown token", async () => {
    const t = newTest();
    await seedUser(t, "shawn");
    await expect(
      t.query(api.users.getMe, { sessionToken: "not-a-real-token" })
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects an empty token", async () => {
    const t = newTest();
    await seedUser(t, "shawn");
    await expect(
      t.query(api.users.getMe, { sessionToken: "" })
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects a token exactly at the 90-day TTL", async () => {
    const t = newTest();
    const token = await seedUser(t, "shawn", { sessionAge: SESSION_TTL_MS });
    await expect(
      t.query(api.users.getMe, { sessionToken: token })
    ).rejects.toThrow("Unauthorized");
  });

  it("accepts a token just under the TTL", async () => {
    const t = newTest();
    const token = await seedUser(t, "shawn", { sessionAge: SESSION_TTL_MS - 1000 });
    const me = await t.query(api.users.getMe, { sessionToken: token });
    expect(me.discogs_username).toBe("shawn");
  });

  it("never returns OAuth or session tokens from getMe", async () => {
    const t = newTest();
    const token = await seedUser(t, "shawn");
    const me = await t.query(api.users.getMe, { sessionToken: token });
    const leaked = ["access_token", "token_secret", "session_token"];
    for (const key of leaked) expect(me).not.toHaveProperty(key);
  });
});

describe("getLatestUser (session restore bootstrap)", () => {
  it("returns null (not a throw) for an invalid token", async () => {
    const t = newTest();
    await seedUser(t, "shawn");
    const user = await t.query(api.users.getLatestUser, { sessionToken: "bogus" });
    expect(user).toBeNull();
  });

  it("returns the user without any token fields", async () => {
    const t = newTest();
    const token = await seedUser(t, "shawn");
    const user = await t.query(api.users.getLatestUser, { sessionToken: token });
    expect(user?.discogs_username).toBe("shawn");
    const leaked = ["access_token", "token_secret", "session_token"];
    for (const key of leaked) expect(user).not.toHaveProperty(key);
  });

  it("honors a valid LEGACY single-token session on the users table", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        discogs_username: "legacyuser",
        access_token: "a",
        token_secret: "b",
        created_at: NOW,
        session_token: "legacy-token",
        session_created_at: NOW - 1000,
      });
    });
    const user = await t.query(api.users.getLatestUser, { sessionToken: "legacy-token" });
    expect(user?.discogs_username).toBe("legacyuser");
  });

  it("rejects an expired LEGACY token", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        discogs_username: "legacyuser",
        access_token: "a",
        token_secret: "b",
        created_at: NOW,
        session_token: "legacy-token",
        session_created_at: NOW - SESSION_TTL_MS,
      });
    });
    const user = await t.query(api.users.getLatestUser, { sessionToken: "legacy-token" });
    expect(user).toBeNull();
  });

  it("rejects a LEGACY token with no created_at (pre-TTL era, forces rotation)", async () => {
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        discogs_username: "legacyuser",
        access_token: "a",
        token_secret: "b",
        created_at: NOW,
        session_token: "legacy-token",
      });
    });
    const user = await t.query(api.users.getLatestUser, { sessionToken: "legacy-token" });
    expect(user).toBeNull();
  });
});

describe("per-device sessions", () => {
  it("clearSession signs out only the calling device", async () => {
    const t = newTest();
    const phoneToken = await seedUser(t, "shawn");
    // Second device: same user, its own session row
    const laptopToken = "tok-laptop";
    await t.run(async (ctx) => {
      await ctx.db.insert("auth_sessions", {
        session_token: laptopToken,
        discogs_username: "shawn",
        created_at: NOW,
      });
    });

    await t.mutation(api.users.clearSession, { sessionToken: phoneToken });

    // Phone is signed out…
    const phone = await t.query(api.users.getLatestUser, { sessionToken: phoneToken });
    expect(phone).toBeNull();
    // …laptop is untouched, and the user record survives (OAuth tokens kept)
    const laptop = await t.query(api.users.getLatestUser, { sessionToken: laptopToken });
    expect(laptop?.discogs_username).toBe("shawn");
  });

  it("clearSession on a stale token is a silent no-op", async () => {
    const t = newTest();
    await seedUser(t, "shawn");
    await expect(
      t.mutation(api.users.clearSession, { sessionToken: "already-gone" })
    ).resolves.toBeNull();
  });

  it("deleteAllUserData removes every session for the user", async () => {
    const t = newTest();
    const token = await seedUser(t, "shawn");
    const otherToken = "tok-other-device";
    await t.run(async (ctx) => {
      await ctx.db.insert("auth_sessions", {
        session_token: otherToken,
        discogs_username: "shawn",
        created_at: NOW,
      });
    });

    await t.mutation(api.users.deleteAllUserData, { sessionToken: token });

    for (const tok of [token, otherToken]) {
      const user = await t.query(api.users.getLatestUser, { sessionToken: tok });
      expect(user).toBeNull();
    }
  });
});
