// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { parseMinNativeBuild } from "./minNativeBuild";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseMinNativeBuild", () => {
  it("fails open to 0 when unset or blank", () => {
    expect(parseMinNativeBuild(undefined)).toBe(0);
    expect(parseMinNativeBuild("")).toBe(0);
    expect(parseMinNativeBuild("   ")).toBe(0);
  });

  it("fails open to 0 on junk, negatives, and fractions", () => {
    for (const raw of ["abc", "12abc", "1e3", "-3", "-0", "12.5", "0x10", "1,000", "Infinity", "NaN"]) {
      expect(parseMinNativeBuild(raw)).toBe(0);
    }
  });

  it("fails open to 0 past the safe-integer range", () => {
    expect(parseMinNativeBuild("99999999999999999999")).toBe(0);
  });

  it("passes a whole number through, trimmed", () => {
    expect(parseMinNativeBuild("0")).toBe(0);
    expect(parseMinNativeBuild("42")).toBe(42);
    expect(parseMinNativeBuild(" 107 ")).toBe(107);
  });
});

describe("clientConfig.get", () => {
  it("needs no session token and returns only minNativeBuild", async () => {
    vi.stubEnv("HG_MIN_NATIVE_BUILD", "");
    const t = convexTest(schema, modules);
    expect(await t.query(api.clientConfig.get, {})).toEqual({ minNativeBuild: 0 });
  });

  it("reads HG_MIN_NATIVE_BUILD", async () => {
    vi.stubEnv("HG_MIN_NATIVE_BUILD", "12");
    const t = convexTest(schema, modules);
    const config = await t.query(api.clientConfig.get, {});
    expect(config).toEqual({ minNativeBuild: 12 });
    expect(Object.keys(config)).toEqual(["minNativeBuild"]);
  });

  it("returns 0 for an invalid value rather than blocking anyone", async () => {
    vi.stubEnv("HG_MIN_NATIVE_BUILD", "-5");
    const t = convexTest(schema, modules);
    expect(await t.query(api.clientConfig.get, {})).toEqual({ minNativeBuild: 0 });
  });
});
