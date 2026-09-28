// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * preferences.upsert (bug hunt L4). recent_searches was capped at 8 only by
 * the Look It Up sheet; the mutation stored whatever array it was handed.
 */

async function seedUser(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: "prefs_user",
      access_token: "a",
      token_secret: "s",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: "tok",
      discogs_username: "prefs_user",
      created_at: Date.now(),
    });
  });
}

const stored = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query("preferences").first())?.recent_searches);

const many = Array.from({ length: 50 }, (_, i) => `query ${i}`.padEnd(1000, "x"));

describe("preferences.upsert recent_searches", () => {
  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.preferences.upsert, { sessionToken: "nope", recent_searches: ["a"] })
    ).rejects.toThrow();
  });

  it("caps the list and each entry when the row is created", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await t.mutation(api.preferences.upsert, { sessionToken: "tok", recent_searches: many });
    const saved = await stored(t);
    expect(saved).toHaveLength(8);
    expect(saved?.every((q) => q.length <= 200)).toBe(true);
    expect(saved?.[0].startsWith("query 0")).toBe(true);
  });

  it("caps the list when an existing row is updated", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await t.mutation(api.preferences.upsert, { sessionToken: "tok", theme: "dark" });
    await t.mutation(api.preferences.upsert, { sessionToken: "tok", recent_searches: many });
    expect(await stored(t)).toHaveLength(8);
  });

  it("stores a normal list unchanged", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await t.mutation(api.preferences.upsert, { sessionToken: "tok", recent_searches: ["miles davis", "can"] });
    expect(await stored(t)).toEqual(["miles davis", "can"]);
  });
});
