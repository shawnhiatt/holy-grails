// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * discogs.marketValueDrip against a stubbed Discogs. The drip fetches with ONE
 * designated account's token, named by the HG_DRIP_USERNAME Convex env var
 * (audit D-04) rather than round-robining over every user's token. Unset var,
 * unknown user, or a token Discogs rejects (401/403) all end the run without
 * changing any row's fetchedAt, so nothing is marked "checked" unpriced.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": "60" },
  });

/** Discogs stub: requests signed with a token in `revoked` get a 401. */
function stubDiscogs(revoked: Set<string>) {
  const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
    const token = /oauth_token="([^"]+)"/.exec(auth)?.[1] ?? "";
    if (revoked.has(token)) return json({ message: "You must authenticate to access this resource." }, 401);
    return json({ lowest_price: { value: 12.5, currency: "USD" }, num_for_sale: 3 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function seed(t: ReturnType<typeof convexTest>, users: string[], releaseIds: number[]) {
  await t.run(async (ctx) => {
    for (const username of users) {
      await ctx.db.insert("users", {
        discogs_username: username,
        access_token: `token-${username}`,
        token_secret: "secret",
        created_at: Date.now(),
      });
    }
    // Every release owned by the first user; seedFromCollection builds the
    // shared market_values set from the collection cache inside the drip.
    for (const releaseId of releaseIds) {
      await ctx.db.insert("collection", {
        discogsUsername: users[0],
        releaseId,
        instanceId: releaseId * 10,
        artist: "A",
        title: `T${releaseId}`,
        year: 1990,
        cover: "c",
        folder: "Uncategorized",
        label: "L",
        catalogNumber: "C",
        format: "Vinyl, LP",
        mediaCondition: "",
        sleeveCondition: "",
        notes: "",
        dateAdded: "2024-01-01",
      });
    }
  });
}

const marketRows = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.query("market_values").collect());

const tokensUsed = (fetchMock: ReturnType<typeof stubDiscogs>) =>
  new Set(
    fetchMock.mock.calls.map(
      ([, init]) =>
        /oauth_token="([^"]+)"/.exec(String((init?.headers as Record<string, string>)?.Authorization))?.[1] ?? ""
    )
  );

describe("marketValueDrip designated account", () => {
  beforeEach(() => {
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prices the batch with the designated account's token and no one else's", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "bob");
    const t = convexTest(schema, modules);
    await seed(t, ["alice", "bob"], [1, 2, 3, 4]);
    const fetchMock = stubDiscogs(new Set());
    await t.action(internal.discogs.marketValueDrip, {});
    const rows = await marketRows(t);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.value === 12.5 && typeof r.fetchedAt === "number")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(tokensUsed(fetchMock)).toEqual(new Set(["token-bob"]));
  });

  it("matches the username case-insensitively", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "BOB");
    const t = convexTest(schema, modules);
    await seed(t, ["alice", "bob"], [1]);
    const fetchMock = stubDiscogs(new Set());
    await t.action(internal.discogs.marketValueDrip, {});
    expect(tokensUsed(fetchMock)).toEqual(new Set(["token-bob"]));
  });

  it("does nothing, and says so, when HG_DRIP_USERNAME is unset", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1, 2]);
    const fetchMock = stubDiscogs(new Set());
    await t.action(internal.discogs.marketValueDrip, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await marketRows(t)).toHaveLength(0); // not even seeded
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("HG_DRIP_USERNAME is not set"));
    warn.mockRestore();
  });

  it("does nothing, and says so, when the named user doesn't exist", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "nobody");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1, 2]);
    const fetchMock = stubDiscogs(new Set());
    await t.action(internal.discogs.marketValueDrip, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await marketRows(t)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("names no user"));
    warn.mockRestore();
  });

  it("ends the run on a 401 with no rows changed, after one request", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "alice");
    const t = convexTest(schema, modules);
    await seed(t, ["alice", "bob"], [1, 2, 3]);
    // bob's token works, but the drip must not fall back to it.
    const fetchMock = stubDiscogs(new Set(["token-alice"]));
    await t.action(internal.discogs.marketValueDrip, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = await marketRows(t);
    expect(rows).toHaveLength(3);
    // Never priced, so still "never fetched" and first in line next run.
    expect(rows.every((r) => r.fetchedAt === undefined && r.value === undefined)).toBe(true);
  });

  it("ends the run on a 403 the same way", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "alice");
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1, 2]);
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Forbidden" }, 403)));
    await t.action(internal.discogs.marketValueDrip, {});
    const rows = await marketRows(t);
    expect(rows.every((r) => r.fetchedAt === undefined && r.value === undefined)).toBe(true);
  });

  it("still advances fetchedAt for a release-level failure (404)", async () => {
    vi.stubEnv("HG_DRIP_USERNAME", "alice");
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1]);
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Release not found." }, 404)));
    await t.action(internal.discogs.marketValueDrip, {});
    const [row] = await marketRows(t);
    expect(row.fetchedAt).toBeTypeOf("number");
    expect(row.value).toBeUndefined();
  });
});

describe("marketValueDrip numForSale and wants", () => {
  beforeEach(() => {
    vi.stubEnv("HG_DRIP_USERNAME", "alice");
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores num_for_sale beside the lowest ask", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1]);
    stubDiscogs(new Set());
    await t.action(internal.discogs.marketValueDrip, {});
    const [row] = await marketRows(t);
    expect(row.value).toBe(12.5);
    expect(row.numForSale).toBe(3);
  });

  it("stores 0 for sale when there's no ask and no count", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1]);
    vi.stubGlobal("fetch", vi.fn(async () => json({ lowest_price: null })));
    await t.action(internal.discogs.marketValueDrip, {});
    const [row] = await marketRows(t);
    expect(row.value).toBeNull();
    expect(row.numForSale).toBe(0);
  });

  it("seeds and prices a wanted release nobody owns", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], []);
    await t.run(async (ctx) => {
      await ctx.db.insert("wantlist", {
        discogs_username: "alice",
        release_id: 77,
        title: "W",
        artist: "A",
        year: 2001,
        cover: "c",
        label: "L",
        priority: false,
      });
    });
    stubDiscogs(new Set());
    await t.action(internal.discogs.marketValueDrip, {});
    const [row] = await marketRows(t);
    expect(row).toMatchObject({ releaseId: 77, wanted: true, value: 12.5, numForSale: 3 });
  });
});
