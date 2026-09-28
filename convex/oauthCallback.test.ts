import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  isAllowedCallbackUrl,
  parseAllowedOrigins,
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
