import { describe, expect, it } from "vitest";
import { isConvexQueryError } from "./session-check";

describe("isConvexQueryError", () => {
  it("matches a failed query as Convex relays it, redacted or not", () => {
    expect(isConvexQueryError(new Error("[CONVEX Q(stacks:getByUsername)] Server Error\n  Called by client"))).toBe(true);
    expect(isConvexQueryError(new Error("[CONVEX Q(users:getMe)] [Request ID: abc] Server Error Uncaught Error: Unauthorized"))).toBe(true);
  });

  it("ignores mutations, actions, and ordinary render errors", () => {
    expect(isConvexQueryError(new Error("[CONVEX M(stacks:update)] Server Error"))).toBe(false);
    expect(isConvexQueryError(new Error("[CONVEX A(discogs:syncSelf)] Server Error"))).toBe(false);
    expect(isConvexQueryError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });

  it("handles non-Error throwables", () => {
    expect(isConvexQueryError("[CONVEX Q(users:getMe)] Server Error")).toBe(true);
    expect(isConvexQueryError(undefined)).toBe(false);
    expect(isConvexQueryError({ message: "[CONVEX Q(x)]" })).toBe(false);
  });
});
