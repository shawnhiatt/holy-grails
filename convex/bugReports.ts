import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { authenticateUser } from "./authHelper";
import { isAdminUsername } from "./admin";

/**
 * Bug reports and ideas filed from inside the app.
 *
 * Two audiences, two access levels:
 *   - The reporter: submits, and reads back only their OWN reports (status +
 *     any reply), via `submit` / `listMine`.
 *   - The admin: reads every report with its diagnostics, sets status, deletes.
 *     `listAll`/`setStatus`/`remove` gate on the HG_ADMIN_USERNAMES allowlist
 *     (admin.ts) AFTER authenticating, and a non-admin caller gets `null` or a
 *     plain "Not found." — the same answer an empty inbox gives, so the inbox's
 *     existence isn't discoverable (Cross-User Data Pattern).
 */

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NOTE_LENGTH = 500;
const MAX_RECENT_ERRORS = 10;
const MAX_ERROR_LENGTH = 600;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const INBOX_PAGE_SIZE = 200;

const kindValidator = v.union(v.literal("bug"), v.literal("idea"));
const statusValidator = v.union(
  v.literal("new"),
  v.literal("known"),
  v.literal("fixed")
);

/** Upload target for an optional screenshot. Authed so anonymous callers can't
    write into the deployment's file storage. */
export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await authenticateUser(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    sessionToken: v.string(),
    kind: kindValidator,
    message: v.string(),
    diagnostics: v.array(v.object({ label: v.string(), value: v.string() })),
    recentErrors: v.optional(v.array(v.string())),
    screenshotId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);

    const message = args.message.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (message.length === 0) {
      if (args.screenshotId) await ctx.storage.delete(args.screenshotId);
      throw new Error("Report is empty.");
    }

    // Rate limit per reporter. A stuck retry loop or a frustrated tester
    // shouldn't be able to flood the inbox (or file storage).
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    const recent = await ctx.db
      .query("bug_reports")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .collect();
    if (recent.filter((r) => r.created_at > cutoff).length >= RATE_LIMIT_MAX) {
      // Drop the just-uploaded screenshot rather than orphaning it in storage.
      if (args.screenshotId) await ctx.storage.delete(args.screenshotId);
      throw new Error("Too many reports. Try again later.");
    }

    return await ctx.db.insert("bug_reports", {
      discogs_username: user.discogs_username,
      kind: args.kind,
      message,
      status: "new",
      created_at: Date.now(),
      screenshot_id: args.screenshotId,
      diagnostics: args.diagnostics,
      recent_errors: args.recentErrors
        ?.slice(0, MAX_RECENT_ERRORS)
        .map((e) => e.slice(0, MAX_ERROR_LENGTH)),
    });
  },
});

/** The reporter's own reports — newest first. Diagnostics are deliberately
    omitted: the reporter has no use for them and they only add payload. */
export const listMine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("bug_reports")
      .withIndex("by_username", (q) =>
        q.eq("discogs_username", user.discogs_username)
      )
      .order("desc")
      .collect();

    return rows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      message: row.message,
      status: row.status,
      created_at: row.created_at,
      resolution_note: row.resolution_note,
    }));
  },
});

/** Whether the caller may see the inbox. Drives one Settings row — it reveals
    only the caller's own status, never who else is an admin. */
export const amIAdmin = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    return isAdminUsername(user.discogs_username);
  },
});

/** Badge count for the Settings inbox row. 0 for non-admins — so the row can
    subscribe to a number instead of pulling every report's diagnostics. */
export const newCount = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    if (!isAdminUsername(user.discogs_username)) return 0;
    const rows = await ctx.db
      .query("bug_reports")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .collect();
    return rows.length;
  },
});

/** Full inbox. `null` for non-admins — indistinguishable from "nothing here". */
export const listAll = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    if (!isAdminUsername(user.discogs_username)) return null;

    const rows = await ctx.db
      .query("bug_reports")
      .order("desc")
      .take(INBOX_PAGE_SIZE);

    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        discogs_username: row.discogs_username,
        kind: row.kind,
        message: row.message,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        resolution_note: row.resolution_note,
        diagnostics: row.diagnostics,
        recent_errors: row.recent_errors,
        screenshot_url: row.screenshot_id
          ? await ctx.storage.getUrl(row.screenshot_id)
          : null,
      }))
    );
  },
});

export const setStatus = mutation({
  args: {
    sessionToken: v.string(),
    reportId: v.id("bug_reports"),
    status: statusValidator,
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    if (!isAdminUsername(user.discogs_username)) throw new Error("Not found.");

    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Not found.");

    const note = args.resolutionNote?.trim().slice(0, MAX_NOTE_LENGTH);
    await ctx.db.patch(args.reportId, {
      status: args.status,
      updated_at: Date.now(),
      ...(args.resolutionNote !== undefined
        ? { resolution_note: note || undefined }
        : {}),
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), reportId: v.id("bug_reports") },
  handler: async (ctx, args) => {
    const user = await authenticateUser(ctx, args.sessionToken);
    if (!isAdminUsername(user.discogs_username)) throw new Error("Not found.");

    const report = await ctx.db.get(args.reportId);
    if (!report) return;
    if (report.screenshot_id) await ctx.storage.delete(report.screenshot_id);
    await ctx.db.delete(args.reportId);
  },
});

/** Called by users.deleteAllUserData so "removes everything on our side" stays
    literally true — a reporter's rows and screenshots leave with them. */
export async function deleteReportsForUser(
  ctx: MutationCtx,
  username: string
): Promise<void> {
  const rows = await ctx.db
    .query("bug_reports")
    .withIndex("by_username", (q) => q.eq("discogs_username", username))
    .collect();
  for (const row of rows) {
    if (row.screenshot_id) await ctx.storage.delete(row.screenshot_id);
    await ctx.db.delete(row._id);
  }
}
