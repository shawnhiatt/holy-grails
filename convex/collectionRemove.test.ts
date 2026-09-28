// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * discogs.proxyRemoveFromCollection against a stubbed Discogs (bug hunt L6).
 * Every 404 used to count as "already removed" — including the 404 Discogs
 * returns when the folder in the URL is stale — so the app dropped a release
 * that was still in the collection.
 */

const USER = "remover";
const TOKEN = "tok-remover";
const ARGS = { sessionToken: TOKEN, username: USER, folderId: 5, releaseId: 42, instanceId: 4200 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": "60" },
  });
const noContent = () =>
  new Response(null, { status: 204, headers: { "X-Discogs-Ratelimit-Remaining": "60" } });

type Route = (method: string, url: string) => Response;
function stub(route: Route) {
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url });
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
    await ctx.db.insert("auth_sessions", { session_token: TOKEN, discogs_username: USER, created_at: Date.now() });
  });
}

describe("proxyRemoveFromCollection", () => {
  beforeEach(() => {
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", "secret");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("deletes in one call when the folder is right", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stub(() => noContent());
    await t.action(api.discogs.proxyRemoveFromCollection, ARGS);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/folders/5/releases/42/instances/4200");
  });

  it("follows a copy that moved folders and deletes it where it actually is", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stub((method, url) => {
      if (method === "DELETE" && url.includes("/folders/5/")) return json({ message: "Not found" }, 404);
      if (method === "GET") return json({ releases: [{ instance_id: 4200, folder_id: 9 }] });
      if (method === "DELETE" && url.includes("/folders/9/")) return noContent();
      return json({}, 500);
    });
    await t.action(api.discogs.proxyRemoveFromCollection, ARGS);
    expect(calls.map((c) => c.method)).toEqual(["DELETE", "GET", "DELETE"]);
    expect(calls[2].url).toContain("/folders/9/releases/42/instances/4200");
  });

  it("treats the release as removed when Discogs no longer has it", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub(() => json({ message: "Not found" }, 404));
    await expect(t.action(api.discogs.proxyRemoveFromCollection, ARGS)).resolves.toBeNull();
  });

  it("treats it as removed when only other copies of the release remain", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub((method) =>
      method === "GET"
        ? json({ releases: [{ instance_id: 9999, folder_id: 5 }] })
        : json({ message: "Not found" }, 404)
    );
    await expect(t.action(api.discogs.proxyRemoveFromCollection, ARGS)).resolves.toBeNull();
  });

  it("fails rather than reporting success when the copy is still there", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    stub((method) =>
      method === "GET"
        ? json({ releases: [{ instance_id: 4200, folder_id: 5 }] })
        : json({ message: "Not found" }, 404)
    );
    await expect(t.action(api.discogs.proxyRemoveFromCollection, ARGS)).rejects.toThrow(/Failed to remove/);
  });
});
