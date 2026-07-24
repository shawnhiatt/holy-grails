// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { isAdminUsername, parseAdminUsernames } from "./admin";

const modules = import.meta.glob("./**/*.ts");

/**
 * Bug reports add the app's first admin-gated surface — one user reading every
 * other user's submissions. Per the CLAUDE.md testing rule these protect:
 *   1. Every function requires a valid session token
 *   2. listMine returns ONLY the caller's own reports
 *   3. The admin gate reads HG_ADMIN_USERNAMES and fails closed when unset
 *   4. A non-admin gets null / "Not found." — the inbox is not discoverable
 *   5. The per-reporter rate limit holds
 */

const ADMIN = "shawn";
const REPORTER = "tester";

function newTest() {
  return convexTest(schema, modules);
}

async function seedUser(
  t: ReturnType<typeof convexTest>,
  username: string,
  token: string
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: username,
      access_token: "oauth-access-secret",
      token_secret: "oauth-token-secret",
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", {
      session_token: token,
      discogs_username: username,
      created_at: Date.now(),
    });
  });
}

const DIAGNOSTICS = [
  { label: "Version", value: "0.7.0" },
  { label: "Screen", value: "crate" },
];

function submitArgs(sessionToken: string, message = "Grid went blank.") {
  return { sessionToken, kind: "bug" as const, message, diagnostics: DIAGNOSTICS };
}

afterEach(() => {
  delete process.env.HG_ADMIN_USERNAMES;
});

describe("admin allowlist", () => {
  it("parses, trims, lowercases, and drops empties", () => {
    expect(parseAdminUsernames(" Shawn , , other ")).toEqual(["shawn", "other"]);
    expect(parseAdminUsernames(undefined)).toEqual([]);
    expect(parseAdminUsernames("")).toEqual([]);
  });

  it("fails closed when the env var is unset or empty", () => {
    expect(isAdminUsername("shawn", undefined)).toBe(false);
    expect(isAdminUsername("shawn", "")).toBe(false);
    expect(isAdminUsername("shawn", " , ")).toBe(false);
  });

  it("matches case-insensitively and rejects everyone else", () => {
    expect(isAdminUsername("Shawn", "shawn")).toBe(true);
    expect(isAdminUsername("shawn", "Shawn,other")).toBe(true);
    expect(isAdminUsername("tester", "shawn")).toBe(false);
    // No substring or prefix matching
    expect(isAdminUsername("shawn2", "shawn")).toBe(false);
    expect(isAdminUsername("shaw", "shawn")).toBe(false);
  });
});

describe("submit", () => {
  it("rejects an unauthenticated caller", async () => {
    const t = newTest();
    await expect(
      t.mutation(api.bugReports.submit, submitArgs("bogus-token"))
    ).rejects.toThrow();
  });

  it("rejects an empty message", async () => {
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await expect(
      t.mutation(api.bugReports.submit, submitArgs("tok", "   "))
    ).rejects.toThrow(/empty/i);
  });

  it("stores the report against the authenticated reporter", async () => {
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await t.mutation(api.bugReports.submit, submitArgs("tok"));

    const rows = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].discogs_username).toBe(REPORTER);
    expect(rows[0].status).toBe("new");
    expect(rows[0].diagnostics).toEqual(DIAGNOSTICS);
  });

  it("caps recent errors and enforces the hourly rate limit", async () => {
    const t = newTest();
    await seedUser(t, REPORTER, "tok");

    await t.mutation(api.bugReports.submit, {
      ...submitArgs("tok"),
      recentErrors: Array.from({ length: 25 }, (_, i) => `err ${i}`),
    });
    const [row] = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());
    expect(row.recent_errors).toHaveLength(10);

    // 1 filed above + 4 more = 5, the ceiling; the 6th is refused.
    for (let i = 0; i < 4; i++) {
      await t.mutation(api.bugReports.submit, submitArgs("tok", `report ${i}`));
    }
    await expect(
      t.mutation(api.bugReports.submit, submitArgs("tok", "one too many"))
    ).rejects.toThrow(/too many/i);
  });
});

describe("listMine", () => {
  it("rejects an unauthenticated caller", async () => {
    const t = newTest();
    await expect(
      t.query(api.bugReports.listMine, { sessionToken: "bogus-token" })
    ).rejects.toThrow();
  });

  it("returns only the caller's own reports", async () => {
    const t = newTest();
    await seedUser(t, REPORTER, "tok-a");
    await seedUser(t, "someone-else", "tok-b");
    await t.mutation(api.bugReports.submit, submitArgs("tok-a", "mine"));
    await t.mutation(api.bugReports.submit, submitArgs("tok-b", "theirs"));

    const mine = await t.query(api.bugReports.listMine, { sessionToken: "tok-a" });
    expect(mine).toHaveLength(1);
    expect(mine[0].message).toBe("mine");
  });
});

describe("the admin gate", () => {
  it("hides the inbox from a non-admin and from an unset allowlist", async () => {
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await seedUser(t, ADMIN, "admin-tok");
    await t.mutation(api.bugReports.submit, submitArgs("tok"));

    // Nobody is an admin while the env var is unset — including Shawn.
    expect(await t.query(api.bugReports.listAll, { sessionToken: "admin-tok" })).toBeNull();
    expect(await t.query(api.bugReports.amIAdmin, { sessionToken: "admin-tok" })).toBe(false);

    process.env.HG_ADMIN_USERNAMES = ADMIN;
    expect(await t.query(api.bugReports.listAll, { sessionToken: "tok" })).toBeNull();
    expect(await t.query(api.bugReports.amIAdmin, { sessionToken: "tok" })).toBe(false);
  });

  it("rejects unauthenticated callers even with a configured allowlist", async () => {
    process.env.HG_ADMIN_USERNAMES = ADMIN;
    const t = newTest();
    await expect(
      t.query(api.bugReports.listAll, { sessionToken: "" })
    ).rejects.toThrow();
    await expect(
      t.query(api.bugReports.amIAdmin, { sessionToken: "bogus" })
    ).rejects.toThrow();
  });

  it("gives an admin every report with diagnostics", async () => {
    process.env.HG_ADMIN_USERNAMES = `other, ${ADMIN}`;
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await seedUser(t, ADMIN, "admin-tok");
    await t.mutation(api.bugReports.submit, submitArgs("tok"));

    const all = await t.query(api.bugReports.listAll, { sessionToken: "admin-tok" });
    expect(all).toHaveLength(1);
    expect(all![0].discogs_username).toBe(REPORTER);
    expect(all![0].diagnostics).toEqual(DIAGNOSTICS);
    expect(all![0].screenshot_url).toBeNull();
  });

  it("refuses status changes and deletes from a non-admin", async () => {
    process.env.HG_ADMIN_USERNAMES = ADMIN;
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await t.mutation(api.bugReports.submit, submitArgs("tok"));
    const [row] = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());

    await expect(
      t.mutation(api.bugReports.setStatus, {
        sessionToken: "tok",
        reportId: row._id,
        status: "fixed",
      })
    ).rejects.toThrow(/not found/i);
    await expect(
      t.mutation(api.bugReports.remove, { sessionToken: "tok", reportId: row._id })
    ).rejects.toThrow(/not found/i);

    const still = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());
    expect(still).toHaveLength(1);
    expect(still[0].status).toBe("new");
  });

  it("lets an admin set status with a note the reporter can read back", async () => {
    process.env.HG_ADMIN_USERNAMES = ADMIN;
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await seedUser(t, ADMIN, "admin-tok");
    await t.mutation(api.bugReports.submit, submitArgs("tok"));
    const [row] = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());

    await t.mutation(api.bugReports.setStatus, {
      sessionToken: "admin-tok",
      reportId: row._id,
      status: "fixed",
      resolutionNote: "Fixed in 0.7.1.",
    });

    const mine = await t.query(api.bugReports.listMine, { sessionToken: "tok" });
    expect(mine[0].status).toBe("fixed");
    expect(mine[0].resolution_note).toBe("Fixed in 0.7.1.");
  });

  it("lets an admin delete a report", async () => {
    process.env.HG_ADMIN_USERNAMES = ADMIN;
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await seedUser(t, ADMIN, "admin-tok");
    await t.mutation(api.bugReports.submit, submitArgs("tok"));
    const [row] = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());

    await t.mutation(api.bugReports.remove, {
      sessionToken: "admin-tok",
      reportId: row._id,
    });
    expect(await t.run(async (ctx) => ctx.db.query("bug_reports").collect())).toHaveLength(0);
  });
});

describe("wiping all user data", () => {
  it("takes the reporter's bug reports with it", async () => {
    const t = newTest();
    await seedUser(t, REPORTER, "tok");
    await seedUser(t, "bystander", "tok-b");
    await t.mutation(api.bugReports.submit, submitArgs("tok", "mine"));
    await t.mutation(api.bugReports.submit, submitArgs("tok-b", "theirs"));

    await t.mutation(api.users.deleteAllUserData, { sessionToken: "tok" });

    const rows = await t.run(async (ctx) => ctx.db.query("bug_reports").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].discogs_username).toBe("bystander");
  });
});
