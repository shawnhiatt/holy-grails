import { describe, it, expect } from "vitest";
import { resolveUserProfileFetch } from "./userProfileOutcome";

describe("resolveUserProfileFetch", () => {
  it("returns ok for a 200", () => {
    expect(resolveUserProfileFetch(200, true, "shawn")).toEqual({ kind: "ok" });
  });

  it("classifies 404 as not_found with a friendly message", () => {
    expect(resolveUserProfileFetch(404, false, "typo-user")).toEqual({
      kind: "not_found",
      message: `User "typo-user" not found on Discogs.`,
    });
  });

  it("classifies other non-OK statuses as http_error, never a degraded success", () => {
    expect(resolveUserProfileFetch(500, false, "shawn")).toEqual({
      kind: "http_error",
      message: "Failed to fetch user profile (500)",
    });
    expect(resolveUserProfileFetch(503, false, "shawn")).toEqual({
      kind: "http_error",
      message: "Failed to fetch user profile (503)",
    });
    expect(resolveUserProfileFetch(403, false, "shawn")).toEqual({
      kind: "http_error",
      message: "Failed to fetch user profile (403)",
    });
    expect(resolveUserProfileFetch(429, false, "shawn")).toEqual({
      kind: "http_error",
      message: "Failed to fetch user profile (429)",
    });
  });

  it("prefers not_found over http_error when status is 404 regardless of ok", () => {
    // Defensive: a 404 is never `ok`, but the 404 check must win either way.
    expect(resolveUserProfileFetch(404, true, "typo-user").kind).toBe("not_found");
  });
});
