// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { isDiscogsUnauthorized } from "./userProfileOutcome";

const modules = import.meta.glob("./**/*.ts");

/**
 * WO-07, errors as values. Prod redacts thrown error text to "Server Error",
 * so a client can't tell a revoked Discogs login, a mistyped username or a
 * skipped field from any other failure. These tests pin the values the iOS
 * app reads, and that the old behavior is untouched when a caller doesn't ask.
 */

const USER = "valuer";
const TOKEN = "tok-valuer";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": "60" },
  });

type Route = (method: string, url: string) => Response;
function stub(route: Route) {
  const calls: { method: string; url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
      return route(method, url);
    })
  );
  return calls;
}

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: USER,
      access_token: "access",
      token_secret: "secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: TOKEN,
      discogs_username: USER,
      created_at: Date.now(),
    });
  });
}

beforeEach(() => {
  vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
  vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("isDiscogsUnauthorized", () => {
  it("matches the (401) the fetch helpers put in their messages", () => {
    expect(isDiscogsUnauthorized(new Error("Failed to fetch folders (401)"))).toBe(true);
    expect(isDiscogsUnauthorized(new Error("Failed to fetch collection folder 3 page 1 (401)"))).toBe(true);
    expect(isDiscogsUnauthorized("Failed to fetch wantlist page 1 (401)")).toBe(true);
  });
  it("does not match other statuses, bare numbers or non-errors", () => {
    expect(isDiscogsUnauthorized(new Error("Failed to fetch folders (403)"))).toBe(false);
    expect(isDiscogsUnauthorized(new Error("Failed to fetch folders (500)"))).toBe(false);
    expect(isDiscogsUnauthorized(new Error("Failed to fetch collection folder 401 page 1 (500)"))).toBe(false);
    expect(isDiscogsUnauthorized(undefined)).toBe(false);
    expect(isDiscogsUnauthorized({})).toBe(false);
  });
});

describe("syncSelf needsReconnect", () => {
  const revoked: Route = () => json({ message: "You must authenticate to access this resource." }, 401);

  it("returns needsReconnect: true with an empty result on a 401 when asked", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(revoked);
    const result = await t.action(api.discogs.syncSelf, { sessionToken: TOKEN, errorsAsValues: true });
    expect(result).toEqual({
      profile: null,
      folders: [],
      albumCount: 0,
      wantCount: 0,
      collDiff: { added: 0, removed: 0, updated: 0 },
      wantDiff: { added: 0, removed: 0, updated: 0 },
      crossovers: [],
      collectionValue: null,
      collectionPrivate: false,
      wantlistPrivate: false,
      needsReconnect: true,
    });
  });

  it("still throws on a 401 when the caller doesn't ask (old builds, the PWA)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(revoked);
    await expect(t.action(api.discogs.syncSelf, { sessionToken: TOKEN })).rejects.toThrow(/\(401\)/);
  });

  it("still throws other failures when asked: only a 401 becomes a value", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(() => json({ message: "Internal Server Error" }, 500));
    await expect(
      t.action(api.discogs.syncSelf, { sessionToken: TOKEN, errorsAsValues: true })
    ).rejects.toThrow(/\(500\)/);
  });

  it("returns needsReconnect: false on a good sync", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub((_m, url) => {
      if (url.endsWith("/collection/folders")) return json({ folders: [{ id: 0, name: "All", count: 0 }] });
      if (url.includes("/collection/fields")) return json({ fields: [] });
      if (url.includes("/collection/folders/0/releases"))
        return json({ pagination: { pages: 1, page: 1, items: 0 }, releases: [] });
      if (url.includes("/wants")) return json({ pagination: { pages: 1, page: 1, items: 0 }, wants: [] });
      if (url.includes("/collection/value")) return json({ minimum: "$1", median: "$2", maximum: "$3" });
      if (url.endsWith(`/users/${USER}`)) return json({ username: USER, num_collection: 0, num_wantlist: 0 });
      return json({ message: "unexpected" }, 404);
    });
    for (const args of [
      { sessionToken: TOKEN },
      { sessionToken: TOKEN, errorsAsValues: true },
    ]) {
      const result = await t.action(api.discogs.syncSelf, args);
      expect(result.needsReconnect).toBe(false);
    }
  });
});

describe("proxyFetchUserProfile notFound", () => {
  const route: Route = (_m, url) =>
    url.endsWith("/users/typo") ? json({ message: "User does not exist or may have been deleted." }, 404)
    : url.endsWith("/users/real") ? json({ username: "real", avatar_url: "a.jpg", rank: 3 })
    : json({ message: "boom" }, 500);

  it("returns notFound: true on a 404 when asked", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(route);
    const result = await t.action(api.discogs.proxyFetchUserProfile, {
      sessionToken: TOKEN,
      username: "typo",
      errorsAsValues: true,
    });
    expect(result.notFound).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.username).toBe("typo");
    expect(result.avatar).toBe("");
  });

  it("still throws the not-found message on a 404 when the caller doesn't ask", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(route);
    await expect(
      t.action(api.discogs.proxyFetchUserProfile, { sessionToken: TOKEN, username: "typo" })
    ).rejects.toThrow(/not found on Discogs/);
  });

  it("still throws other HTTP errors when asked: a 500 is never a notFound", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(route);
    await expect(
      t.action(api.discogs.proxyFetchUserProfile, { sessionToken: TOKEN, username: "other", errorsAsValues: true })
    ).rejects.toThrow(/\(500\)/);
  });

  it("returns notFound: false on a found profile and on the degraded network path", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(route);
    const found = await t.action(api.discogs.proxyFetchUserProfile, {
      sessionToken: TOKEN,
      username: "real",
      errorsAsValues: true,
    });
    expect(found.notFound).toBe(false);
    expect(found.degraded).toBe(false);
    expect(found.rank).toBe(3);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const degraded = await t.action(api.discogs.proxyFetchUserProfile, { sessionToken: TOKEN, username: "real" });
    expect(degraded.degraded).toBe(true);
    expect(degraded.notFound).toBe(false);
  });
});

describe("proxyUpdateCollectionInstance skippedFields", () => {
  const ARGS = { sessionToken: TOKEN, username: USER, folderId: 1, releaseId: 42, instanceId: 4200 };

  function stubFields(fields: { id: number; name: string }[]) {
    return stub((method, url) => {
      if (method === "GET" && url.endsWith("/collection/fields"))
        return json({ fields: fields.map((f) => ({ ...f, type: "text", public: false })) });
      return json({});
    });
  }

  it("returns no skipped fields when every named field exists", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stubFields([
      { id: 1, name: "Media Condition" },
      { id: 2, name: "Sleeve Condition" },
      { id: 3, name: "Notes" },
    ]);
    const result = await t.action(api.discogs.proxyUpdateCollectionInstance, {
      ...ARGS,
      fields: { mediaCondition: "Mint (M)", sleeveCondition: "Near Mint (NM or M-)", notes: "hi" },
    });
    expect(result).toEqual({ skippedFields: [] });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(3);
  });

  it("names the fields that were not written because Discogs has no such field", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stubFields([{ id: 1, name: "Media Condition" }]);
    const result = await t.action(api.discogs.proxyUpdateCollectionInstance, {
      ...ARGS,
      fields: { mediaCondition: "Mint (M)", sleeveCondition: "Very Good (VG)", notes: "hi" },
    });
    expect(result).toEqual({ skippedFields: ["sleeveCondition", "notes"] });
    // The one that exists was still written.
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual([
      expect.stringContaining("/instances/4200/fields/1"),
    ]);
  });

  it("does not report a field the caller didn't send, nor a rating", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stubFields([]);
    const result = await t.action(api.discogs.proxyUpdateCollectionInstance, {
      ...ARGS,
      fields: { rating: 4 },
    });
    expect(result).toEqual({ skippedFields: [] });
  });

  it("reports an empty-string edit to a missing field as skipped too", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stubFields([]);
    const result = await t.action(api.discogs.proxyUpdateCollectionInstance, {
      ...ARGS,
      fields: { notes: "" },
    });
    expect(result.skippedFields).toEqual(["notes"]);
  });
});
