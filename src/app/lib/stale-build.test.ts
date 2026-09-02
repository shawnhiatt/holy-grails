import { describe, expect, it } from "vitest";
import { isStaleBuildError } from "./stale-build";

describe("isStaleBuildError", () => {
  it("catches a Convex function the deployment no longer publishes", () => {
    expect(
      isStaleBuildError(
        new Error(
          "[CONVEX Q(users:getLatestUser)] Server Error: Could not find public function for 'users:getLatestUser'. Did you forget to run `npx convex dev` or `npx convex deploy`?"
        )
      )
    ).toBe(true);
  });

  it("catches an argument validator that has moved on", () => {
    expect(
      isStaleBuildError(
        new Error("ArgumentValidationError: Object contains extra field `formatScope` that is not in the validator.")
      )
    ).toBe(true);
    expect(
      isStaleBuildError(new Error("Object is missing the required field `sessionToken`."))
    ).toBe(true);
  });

  it("catches a lazy chunk missing from the current deploy", () => {
    expect(
      isStaleBuildError(new Error("Failed to fetch dynamically imported module: /assets/reports-screen-a1b2c3.js"))
    ).toBe(true);
    expect(
      isStaleBuildError(new TypeError("Importing a module script failed."))
    ).toBe(true);
  });

  it("matches regardless of case", () => {
    expect(isStaleBuildError(new Error("COULD NOT FIND PUBLIC FUNCTION for 'x:y'"))).toBe(true);
  });

  it("reads a plain string and a message-bearing object", () => {
    expect(isStaleBuildError("Could not find public function for 'a:b'")).toBe(true);
    expect(isStaleBuildError({ message: "ArgumentValidationError: bad" })).toBe(true);
  });

  it("matches on the stack when the message alone is bare", () => {
    const err = new Error("Server Error");
    err.stack = "Server Error\n  at ConvexError: Could not find public function for 'x:y'";
    expect(isStaleBuildError(err)).toBe(true);
  });

  // A false positive costs a needless reload, so ordinary app bugs and the
  // errors a flaky network produces must fall through to the normal boundary.
  it("ignores errors that a reload would not fix", () => {
    expect(isStaleBuildError(new Error("Cannot read properties of undefined (reading 'title')"))).toBe(false);
    expect(isStaleBuildError(new Error("Unauthorized"))).toBe(false);
    expect(isStaleBuildError(new Error("Server Error"))).toBe(false);
    expect(isStaleBuildError(new Error("Failed to fetch"))).toBe(false);
    expect(isStaleBuildError(new Error("Rendered fewer hooks than expected"))).toBe(false);
  });

  it("ignores values that carry no message", () => {
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
    expect(isStaleBuildError(42)).toBe(false);
    expect(isStaleBuildError({})).toBe(false);
    expect(isStaleBuildError({ message: 404 })).toBe(false);
  });
});
