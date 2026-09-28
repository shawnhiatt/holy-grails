// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  COVER_IMAGE_MAX_BASE64,
  COVER_SCAN_LIMIT_PER_HOUR,
  COVER_SCAN_WINDOW_MS,
} from "./coverIdentity";

const modules = import.meta.glob("./**/*.ts");

/**
 * The cover-scan budget (bug hunt M4). vision.identifyCover is a paid Claude
 * vision call on one shared key; it had no per-user limit and no payload cap,
 * so any signed-in session could loop it with arbitrarily large images.
 */

const USER = "scanner";
const TOKEN = "tok-scanner";
const NOW = 1_780_000_000_000;

async function seedUser(t: ReturnType<typeof convexTest>, username = USER, token = TOKEN) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "access",
      token_secret: "secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: token,
      discogs_username: username,
      created_at: Date.now(),
    });
  });
}

const scanRows = (t: ReturnType<typeof convexTest>, username = USER) =>
  t.run(async (ctx) =>
    (await ctx.db.query("cover_scans").collect()).filter((r) => r.discogs_username === username)
  );

async function spend(t: ReturnType<typeof convexTest>, n: number, now = NOW, username = USER) {
  const results: boolean[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await t.mutation(internal.coverScans.consume, { username, now: now + i }));
  }
  return results;
}

describe("coverScans.consume", () => {
  it("allows the hourly budget and refuses the next scan", async () => {
    const t = convexTest(schema, modules);
    const results = await spend(t, COVER_SCAN_LIMIT_PER_HOUR + 1);
    expect(results.slice(0, COVER_SCAN_LIMIT_PER_HOUR).every(Boolean)).toBe(true);
    expect(results[COVER_SCAN_LIMIT_PER_HOUR]).toBe(false);
    // A refused scan records nothing.
    expect(await scanRows(t)).toHaveLength(COVER_SCAN_LIMIT_PER_HOUR);
  });

  it("frees the budget once the window has passed, pruning the old rows", async () => {
    const t = convexTest(schema, modules);
    await spend(t, COVER_SCAN_LIMIT_PER_HOUR);
    const later = NOW + COVER_SCAN_WINDOW_MS + COVER_SCAN_LIMIT_PER_HOUR;
    expect(await t.mutation(internal.coverScans.consume, { username: USER, now: later })).toBe(true);
    expect(await scanRows(t)).toHaveLength(1);
  });

  it("keeps each user's budget separate", async () => {
    const t = convexTest(schema, modules);
    await spend(t, COVER_SCAN_LIMIT_PER_HOUR);
    expect(await t.mutation(internal.coverScans.consume, { username: "someone_else", now: NOW })).toBe(true);
  });
});

describe("vision.identifyCover guards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.vision.identifyCover, { sessionToken: "nope", imageBase64: "abc" })
    ).rejects.toThrow();
  });

  it("refuses an oversized image before any paid call, spending no budget", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await t.action(api.vision.identifyCover, {
      sessionToken: TOKEN,
      imageBase64: "a".repeat(COVER_IMAGE_MAX_BASE64 + 1),
    });
    expect(result).toEqual({ ok: false, reason: "error" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await scanRows(t)).toHaveLength(0);
  });

  it("returns rate_limited once the budget is spent, without calling the API", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    await spend(t, COVER_SCAN_LIMIT_PER_HOUR, Date.now());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await t.action(api.vision.identifyCover, { sessionToken: TOKEN, imageBase64: "abc" });
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("spends no budget when the deployment has no API key", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const result = await t.action(api.vision.identifyCover, { sessionToken: TOKEN, imageBase64: "abc" });
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
    expect(await scanRows(t)).toHaveLength(0);
  });
});

describe("users.deleteAllUserData", () => {
  it("removes the caller's cover-scan rows", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await spend(t, 3);
    await t.mutation(api.users.deleteAllUserData, { sessionToken: TOKEN });
    expect(await scanRows(t)).toHaveLength(0);
  });
});
