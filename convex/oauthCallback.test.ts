import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  NATIVE_HTTPS_CALLBACK,
  isAllowedCallbackUrl,
  parseAllowedOrigins,
  parseNativeCallbacks,
} from "./oauthCallback";

describe("isAllowedCallbackUrl with the default origins", () => {
  it.each(DEFAULT_ALLOWED_ORIGINS)("accepts %s/auth/callback", (origin) => {
    expect(isAllowedCallbackUrl(`${origin}/auth/callback`, undefined)).toBe(true);
  });

  it("rejects an attacker's origin", () => {
    expect(isAllowedCallbackUrl("https://evil.example/auth/callback", undefined)).toBe(false);
  });

  it("rejects look-alike hosts that a prefix or substring match would pass", () => {
    for (const url of [
      "https://holygrails.app.evil.example/auth/callback",
      "https://evilholygrails.app/auth/callback",
      "https://evil.example/auth/callback?next=https://holygrails.app",
      "https://holygrails.app@evil.example/auth/callback",
    ]) {
      expect(isAllowedCallbackUrl(url, undefined)).toBe(false);
    }
  });

  it("rejects a different scheme or port on an allowed host", () => {
    expect(isAllowedCallbackUrl("http://holygrails.app/auth/callback", undefined)).toBe(false);
    expect(isAllowedCallbackUrl("https://holygrails.app:8443/auth/callback", undefined)).toBe(false);
    expect(isAllowedCallbackUrl("http://localhost:5173/auth/callback", undefined)).toBe(false);
  });

  it("rejects any other path, a query string, a fragment, or credentials", () => {
    for (const url of [
      "https://holygrails.app/",
      "https://holygrails.app/auth/callback/",
      "https://holygrails.app/auth/callback?x=1",
      "https://holygrails.app/auth/callback#x",
      "https://user:pw@holygrails.app/auth/callback",
    ]) {
      expect(isAllowedCallbackUrl(url, undefined)).toBe(false);
    }
  });

  it("rejects things that are not URLs", () => {
    expect(isAllowedCallbackUrl("", undefined)).toBe(false);
    expect(isAllowedCallbackUrl("/auth/callback", undefined)).toBe(false);
    expect(isAllowedCallbackUrl("javascript:alert(1)", undefined)).toBe(false);
  });
});

describe("isAllowedCallbackUrl with HG_ALLOWED_ORIGINS set", () => {
  const env = "https://preview-123.vercel.app, http://localhost:1234";

  it("accepts the configured origins", () => {
    expect(isAllowedCallbackUrl("https://preview-123.vercel.app/auth/callback", env)).toBe(true);
    expect(isAllowedCallbackUrl("http://localhost:1234/auth/callback", env)).toBe(true);
  });

  it("replaces the defaults rather than adding to them", () => {
    expect(isAllowedCallbackUrl("https://holygrails.app/auth/callback", env)).toBe(false);
  });
});

describe("parseAllowedOrigins", () => {
  it("returns null when unset or blank, so the defaults apply", () => {
    expect(parseAllowedOrigins(undefined)).toBeNull();
    expect(parseAllowedOrigins("")).toBeNull();
    expect(parseAllowedOrigins(" , ")).toBeNull();
  });

  it("normalizes entries to origins and drops junk", () => {
    expect(parseAllowedOrigins("https://holygrails.app/some/path, not a url")).toEqual([
      "https://holygrails.app",
    ]);
  });
});

describe("isAllowedCallbackUrl with native callbacks", () => {
  const native = "holygrails://auth/callback";

  it("accepts the scheme callback when HG_NATIVE_CALLBACKS lists it (dev)", () => {
    expect(isAllowedCallbackUrl(native, undefined, native)).toBe(true);
  });

  it("rejects the scheme callback when HG_NATIVE_CALLBACKS is unset (prod)", () => {
    expect(isAllowedCallbackUrl(native, undefined, undefined)).toBe(false);
    expect(isAllowedCallbackUrl(native, undefined, "")).toBe(false);
  });

  it("matches the exact string only", () => {
    for (const url of [
      "holygrails://auth/callback/",
      "holygrails://auth/callback?x=1",
      "holygrails://auth/callback#x",
      "holygrails://auth/other",
      "holygrails://evil/callback",
      "HOLYGRAILS://auth/callback",
      "holygrails://AUTH/callback",
      "holygrails://Auth/Callback",
      " holygrails://auth/callback",
      "holygrails:auth/callback",
      "evilgrails://auth/callback",
    ]) {
      expect(isAllowedCallbackUrl(url, undefined, native)).toBe(false);
    }
  });

  it("leaves the web callbacks unchanged when it is set", () => {
    expect(isAllowedCallbackUrl("https://holygrails.app/auth/callback", undefined, native)).toBe(true);
    expect(isAllowedCallbackUrl("https://evil.example/auth/callback", undefined, native)).toBe(false);
  });

  it("is not reachable through HG_ALLOWED_ORIGINS", () => {
    expect(isAllowedCallbackUrl(native, native, undefined)).toBe(false);
  });
});

describe("parseNativeCallbacks", () => {
  it("returns an empty list when unset or blank, so it fails closed", () => {
    expect(parseNativeCallbacks(undefined)).toEqual([]);
    expect(parseNativeCallbacks("")).toEqual([]);
    expect(parseNativeCallbacks(" , ")).toEqual([]);
  });

  it("trims entries and drops junk", () => {
    expect(parseNativeCallbacks(" holygrails://auth/callback , not a url")).toEqual([
      "holygrails://auth/callback",
    ]);
  });

  it("drops http(s) entries, which must go through the origin allowlist", () => {
    expect(
      parseNativeCallbacks("https://evil.example/auth/callback, http://evil.example/x")
    ).toEqual([]);
    expect(
      isAllowedCallbackUrl("https://evil.example/auth/callback", undefined, "https://evil.example/auth/callback")
    ).toBe(false);
  });
});

describe("isAllowedCallbackUrl with the https native callback", () => {
  const url = "https://holygrails.app/auth/native-callback";

  it("is the URL the iOS app sends", () => {
    expect(NATIVE_HTTPS_CALLBACK).toBe(url);
  });

  it("is accepted with no env vars set (prod)", () => {
    expect(isAllowedCallbackUrl(url, undefined, undefined)).toBe(true);
  });

  it("is still accepted when HG_ALLOWED_ORIGINS replaces the defaults", () => {
    expect(isAllowedCallbackUrl(url, "https://preview-123.vercel.app", undefined)).toBe(true);
    expect(isAllowedCallbackUrl(url, undefined, "holygrails://auth/callback")).toBe(true);
  });

  it("matches the exact string only", () => {
    for (const near of [
      "https://holygrails.app/auth/native-callback/",
      "https://holygrails.app/auth/native-callback?x=1",
      "https://holygrails.app/auth/native-callback?",
      "https://holygrails.app/auth/native-callback#x",
      "https://holygrails.app/auth/native-callback/extra",
      "https://holygrails.app/auth/native",
      "https://holygrails.app/auth/Native-Callback",
      "https://HOLYGRAILS.app/auth/native-callback",
      "HTTPS://holygrails.app/auth/native-callback",
      "http://holygrails.app/auth/native-callback",
      "https://holygrails.app:443/auth/native-callback",
      "https://holygrails.app:8443/auth/native-callback",
      "https://www.holygrails.app/auth/native-callback",
      "https://holy-grails.vercel.app/auth/native-callback",
      "http://localhost:1234/auth/native-callback",
      "https://holygrails.app.evil.example/auth/native-callback",
      "https://evil.example/auth/native-callback",
      "https://user:pw@holygrails.app/auth/native-callback",
      " https://holygrails.app/auth/native-callback",
      "https://holygrails.app/auth/native-callback ",
    ]) {
      expect(isAllowedCallbackUrl(near, undefined, undefined)).toBe(false);
    }
  });

  it("leaves the PWA callbacks unchanged", () => {
    for (const origin of DEFAULT_ALLOWED_ORIGINS) {
      expect(isAllowedCallbackUrl(`${origin}/auth/callback`, undefined, undefined)).toBe(true);
    }
    expect(isAllowedCallbackUrl("https://evil.example/auth/callback", undefined, undefined)).toBe(false);
    expect(isAllowedCallbackUrl("holygrails://auth/callback", undefined, undefined)).toBe(false);
  });
});
