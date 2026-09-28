// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * discogs.marketValueDrip against a stubbed Discogs (bug hunt M2). The drip
 * round-robins releases across every user's token. A revoked token failed
 * every request routed to it, and each failure advanced that release's
 * fetchedAt — marking it checked for 30 days although it was never priced,
 * run after run, for as long as the bad token stayed in the pool.
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

describe("marketValueDrip token failures", () => {
  beforeEach(() => {
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prices every release with the good token when another token is revoked", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice", "bob"], [1, 2, 3, 4]);
    stubDiscogs(new Set(["token-bob"]));
    await t.action(internal.discogs.marketValueDrip, {});
    const rows = await marketRows(t);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.value === 12.5)).toBe(true);
  });

  it("stops the revoked token after its first failure instead of retrying it every release", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice", "bob"], [1, 2, 3, 4, 5, 6]);
    const fetchMock = stubDiscogs(new Set(["token-bob"]));
    await t.action(internal.discogs.marketValueDrip, {});
    const bobCalls = fetchMock.mock.calls.filter(([, init]) =>
      String((init?.headers as Record<string, string>)?.Authorization).includes('oauth_token="token-bob"')
    );
    expect(bobCalls).toHaveLength(1);
  });

  it("leaves releases unmarked when every token is revoked", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice", "bob"], [1, 2]);
    stubDiscogs(new Set(["token-alice", "token-bob"]));
    await t.action(internal.discogs.marketValueDrip, {});
    const rows = await marketRows(t);
    // Never priced, so still "never fetched" and first in line next run.
    expect(rows.every((r) => r.fetchedAt === undefined && r.value === undefined)).toBe(true);
  });

  it("still advances fetchedAt for a release-level failure (404)", async () => {
    const t = convexTest(schema, modules);
    await seed(t, ["alice"], [1]);
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Release not found." }, 404)));
    await t.action(internal.discogs.marketValueDrip, {});
    const [row] = await marketRows(t);
    expect(row.fetchedAt).toBeTypeOf("number");
    expect(row.value).toBeUndefined();
  });
});
