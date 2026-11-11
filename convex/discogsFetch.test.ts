// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { primaryImageUrl } from "./discogs";
import { userAgentFor } from "./userAgent";

const modules = import.meta.glob("./**/*.ts");

/**
 * DW-07, Discogs fetch hygiene (audit D-07, I-03, I-04, I-05, I-06, I-08).
 * `discogsFetch` isn't exported, so these drive it through real actions with a
 * stubbed `fetch` — a GET action (the followed-user wantlist page), a POST
 * action (create folder) and the two sync loops.
 */

const USER = "hygiene";
const TOKEN = "tok-hygiene";

const json = (body: unknown, status = 200, remaining = "60") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": remaining },
  });

const wantsPage = { pagination: { pages: 1, page: 1, items: 0 }, wants: [] as unknown[] };

type Route = (method: string, url: string, init?: RequestInit) => Response | Promise<Response>;
function stub(route: Route) {
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string> });
      return route(method, url, init);
    })
  );
  return calls;
}

// Record every sleep discogsFetch asks for, and run it immediately so the
// tests don't wait out a real 2 s or 5 s. Only delays of 400ms and up are
// kept: those are the throttle and retry waits, not convex-test's own timers.
let sleeps: number[] = [];
const realSetTimeout = globalThis.setTimeout;

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

const getWants = (t: ReturnType<typeof convexTest>) =>
  t.action(api.discogs.proxyFetchUserWantlistPage, { sessionToken: TOKEN, username: "friend" });
const createFolder = (t: ReturnType<typeof convexTest>) =>
  t.action(api.discogs.proxyCreateFolder, { sessionToken: TOKEN, username: USER, name: "New" });

beforeEach(() => {
  sleeps = [];
  vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
  vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  vi.stubGlobal("setTimeout", ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if ((ms ?? 0) >= 400) {
      sleeps.push(ms as number);
      return realSetTimeout(fn, 0, ...rest);
    }
    return realSetTimeout(fn, ms, ...rest);
  }) as typeof setTimeout);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("5xx retry (I-04)", () => {
  it("a GET that gets a 503 is retried once after ~2s and succeeds", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    let n = 0;
    const calls = stub(() => (++n === 1 ? json({ message: "busy" }, 503) : json(wantsPage)));
    await expect(getWants(t)).resolves.toEqual([]);
    expect(calls.filter((c) => c.method === "GET" && c.url.includes("/wants"))).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("a GET retries after a thrown network error too", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    let n = 0;
    stub(() => {
      if (++n === 1) throw new TypeError("fetch failed");
      return json(wantsPage);
    });
    await expect(getWants(t)).resolves.toEqual([]);
    expect(n).toBe(2);
  });

  it("a GET gets only ONE retry: a second 503 is returned as the failure", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stub(() => json({ message: "busy" }, 503));
    await expect(getWants(t)).rejects.toThrow(/\(503\)/);
    expect(calls).toHaveLength(2);
  });

  it("a POST that gets a 503 fails once, with no retry", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stub(() => json({ message: "busy" }, 503));
    await expect(createFolder(t)).rejects.toThrow(/\(503\)/);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("a POST that throws a network error is not retried", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    let n = 0;
    stub(() => {
      n++;
      throw new TypeError("fetch failed");
    });
    await expect(createFolder(t)).rejects.toThrow();
    expect(n).toBe(1);
  });

  it("a 404 is not retried", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stub(() => json({ message: "nope" }, 404));
    await expect(getWants(t)).rejects.toThrow(/\(404\)/);
    expect(calls).toHaveLength(1);
  });
});

describe("followed wantlist page (I-03)", () => {
  it("returns [] for a private wantlist (403)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(() => json({ message: "Forbidden" }, 403));
    await expect(getWants(t)).resolves.toEqual([]);
  });

  it("throws on a 500 instead of returning an empty list", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(() => json({ message: "boom" }, 500));
    await expect(getWants(t)).rejects.toThrow(/\(500\)/);
  });

  it("throws on a 429 once the rate-limit retries are spent", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(() => json({ message: "slow down" }, 429, "0"));
    await expect(getWants(t)).rejects.toThrow(/\(429\)/);
    // Leave the shared counter full for whoever runs next.
    stub(() => json(wantsPage));
    await getWants(t);
  });
});

describe("rate-limit counter goes stale after 60s (I-05)", () => {
  it("sleeps while the low count is fresh, and not once 60s have passed", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-02T10:00:00Z"));

    // First call: Discogs says 2 left. That's the counter now.
    stub(() => json(wantsPage, 200, "2"));
    await getWants(t);
    expect(sleeps).toEqual([]);

    // Right after, the low count is believed: the 5s backoff.
    await getWants(t);
    expect(sleeps).toEqual([5000]);

    // Re-arm the low count, then let a quiet minute pass.
    sleeps = [];
    await getWants(t); // sleeps 5000 again and re-stamps the counter at 2
    sleeps = [];
    vi.setSystemTime(new Date("2026-12-02T10:01:05Z"));
    stub(() => json(wantsPage, 200, "60"));
    await getWants(t);
    expect(sleeps).toEqual([]);
  });
});

describe("401 logging (D-04 follow-up, the Dec 1 check)", () => {
  it("logs the response body and never the signature or token", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stub(() => json({ message: "Invalid consumer signature BODYMARK" }, 401));
    await expect(getWants(t)).rejects.toThrow(/\(401\)/);
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("401");
    expect(logged).toContain("BODYMARK");
    expect(logged).not.toMatch(/oauth_signature|oauth_token|access|secret/i);
  });

  it("leaves the body readable for the caller after logging it", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The 401 still surfaces as the usual "(401)" error, so reconnect handling
    // keyed on that text (isDiscogsUnauthorized) keeps working.
    stub(() => json({ message: "x" }, 401));
    await expect(getWants(t)).rejects.toThrow("Failed to fetch wantlist page for @friend (401)");
  });
});

describe("typed 403 on the sync loops (I-08)", () => {
  const route403 = (what: "wants" | "collection"): Route => (_m, url) => {
    if (url.endsWith("/collection/folders")) return json({ folders: [{ id: 0, name: "All", count: 0 }, { id: 1, name: "Uncategorized", count: 1 }] });
    if (url.includes("/collection/fields")) return json({ fields: [] });
    if (url.includes("/collection/folders/") && url.includes("/releases"))
      return what === "collection"
        ? json({ message: "Forbidden" }, 403)
        : json({ pagination: { pages: 1, page: 1, items: 0 }, releases: [] });
    if (url.includes("/wants"))
      return what === "wants" ? json({ message: "Forbidden" }, 403) : json(wantsPage);
    if (url.includes("/collection/value")) return json({ minimum: "$1", median: "$2", maximum: "$3" });
    if (url.endsWith(`/users/${USER}`)) return json({ username: USER, num_collection: 0, num_wantlist: 0 });
    if (url.endsWith("/users/friend")) return json({ username: "friend", avatar_url: "a.jpg" });
    return json({ message: "unexpected" }, 404);
  };

  it("syncSelf marks the wantlist private on a 403", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(route403("wants"));
    const result = await t.action(api.discogs.syncSelf, { sessionToken: TOKEN });
    expect(result.wantlistPrivate).toBe(true);
    expect(result.collectionPrivate).toBe(false);
  });

  it("syncSelf marks the collection private on a 403", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(route403("collection"));
    const result = await t.action(api.discogs.syncSelf, { sessionToken: TOKEN });
    expect(result.collectionPrivate).toBe(true);
  });

  it("syncSelf does NOT treat a 500 as private (and a message that merely says 403 isn't one)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub((m, url) =>
      url.includes("/wants") ? json({ message: "error 403 in body" }, 500) : route403("none" as never)(m, url)
    );
    await expect(t.action(api.discogs.syncSelf, { sessionToken: TOKEN })).rejects.toThrow(/\(500\)/);
  });

  it("syncFollowedUser marks a private collection on a 403", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("following", {
        discogs_username: USER,
        following_username: "friend",
        followed_at: Date.now(),
      });
    });
    stub((_m, url) =>
      url.includes("/collection/folders/0/releases") ? json({ message: "Forbidden" }, 403) : route403("none" as never)(_m, url)
    );
    const result = await t.action(api.discogs.syncFollowedUser, { sessionToken: TOKEN, username: "friend" });
    expect(result.isPrivate).toBe(true);
  });
});

describe("User-Agent (D-07)", () => {
  it("names the app, its version and a URL; prod has no -dev marker", () => {
    expect(userAgentFor("https://unique-sturgeon-566.convex.cloud")).toBe(
      "HolyGrails/0.8 +https://www.holygrails.app"
    );
    expect(userAgentFor(undefined)).toBe("HolyGrails/0.8 +https://www.holygrails.app");
  });

  it("marks the dev deployment", () => {
    expect(userAgentFor("https://adventurous-crow-499.convex.cloud")).toBe(
      "HolyGrails/0.8-dev +https://www.holygrails.app"
    );
  });

  it("is what discogsFetch sends", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stub(() => json(wantsPage));
    await getWants(t);
    expect(calls[0].headers["User-Agent"]).toMatch(/^HolyGrails\/\d+\.\d+(-dev)? \+https:\/\/www\.holygrails\.app$/);
  });
});

describe("cover on add (I-06)", () => {
  const images = [
    { type: "secondary", uri: "https://i.discogs.com/second/h:600/w:600/x.jpeg" },
    { type: "primary", uri: "https://i.discogs.com/prime/h:600/w:600/y.jpeg" },
  ];
  it("takes the primary image even when it isn't listed first", () => {
    expect(primaryImageUrl(images)).toBe("https://i.discogs.com/prime/h:600/w:600/y.jpeg");
  });
  it("falls back to the first image with a URL when none is primary", () => {
    expect(primaryImageUrl([{ type: "secondary", uri: "" }, { type: "secondary", uri: "u2" }])).toBe("u2");
  });
  it("is empty with no images", () => {
    expect(primaryImageUrl(undefined)).toBe("");
    expect(primaryImageUrl([])).toBe("");
  });
});
