// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * discogs.syncFollowedUser against a stubbed Discogs (bug hunt M1). A
 * transient wantlist failure used to be swallowed into an empty list, which
 * then cleared the followed user's cached wantlist — and the sync still
 * stamped collection_synced_at, so nothing retried it for 24h.
 */

const FOLLOWER = "follower";
const FOLLOWED = "followed";
const TOKEN = "tok-follower";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": "60" },
  });

const release = (id: number) => ({
  id,
  instance_id: id * 10,
  folder_id: 0,
  rating: 0,
  date_added: "2024-01-01T00:00:00-08:00",
  basic_information: {
    id,
    title: `Title ${id}`,
    year: 1990,
    artists: [{ name: `Artist ${id}`, anv: "" }],
    labels: [{ name: "Label", catno: "CAT" }],
    formats: [{ name: "Vinyl", qty: "1" }],
    cover_image: `cover-${id}`,
    thumb: "",
  },
});

const want = (id: number) => ({
  id,
  date_added: "2024-01-01T00:00:00-08:00",
  basic_information: { ...release(id).basic_information },
});

/** Route a Discogs URL to a canned response; `wantlist` decides that endpoint. */
function stubDiscogs(wantlist: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/collection/folders/0/releases")) {
        return json({ pagination: { pages: 1, page: 1, items: 1 }, releases: [release(1)] });
      }
      if (url.includes("/wants")) return wantlist();
      if (url.endsWith(`/users/${FOLLOWED}`)) return json({ username: FOLLOWED, avatar_url: "a.jpg" });
      return json({ message: "unexpected" }, 404);
    })
  );
}

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: FOLLOWER,
      access_token: "access",
      token_secret: "secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: TOKEN,
      discogs_username: FOLLOWER,
      created_at: Date.now(),
    });
    await ctx.db.insert("following", {
      discogs_username: FOLLOWER,
      following_username: FOLLOWED,
      followed_at: Date.now(),
    });
    // A previously cached wantlist of two items.
    for (const id of [501, 502]) {
      await ctx.db.insert("followed_items", {
        follower_username: FOLLOWER,
        followed_username: FOLLOWED,
        kind: "want",
        release_id: id,
        title: `Want ${id}`,
        artist: "Someone",
        year: 1990,
        cover: "c",
        label: "L",
        dateAdded: "2023-01-01",
      });
    }
  });
}

const cachedWants = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) =>
    (await ctx.db.query("followed_items").collect())
      .filter((r) => r.kind === "want")
      .map((r) => r.release_id)
      .sort()
  );

describe("syncFollowedUser wantlist handling", () => {
  beforeEach(() => {
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps the cached wantlist when the wantlist fetch fails transiently", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stubDiscogs(() => json({ message: "Internal Server Error" }, 500));
    const result = await t.action(api.discogs.syncFollowedUser, { sessionToken: TOKEN, username: FOLLOWED });
    expect(result.albums).toBe(1);
    expect(await cachedWants(t)).toEqual([501, 502]);
  });

  it("clears the cached wantlist when the wantlist is private (403)", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stubDiscogs(() => json({ message: "Forbidden" }, 403));
    await t.action(api.discogs.syncFollowedUser, { sessionToken: TOKEN, username: FOLLOWED });
    expect(await cachedWants(t)).toEqual([]);
  });

  it("replaces the cached wantlist when the fetch succeeds", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stubDiscogs(() => json({ pagination: { pages: 1, page: 1, items: 1 }, wants: [want(777)] }));
    const result = await t.action(api.discogs.syncFollowedUser, { sessionToken: TOKEN, username: FOLLOWED });
    expect(result.wants).toBe(1);
    expect(await cachedWants(t)).toEqual([777]);
  });
});
