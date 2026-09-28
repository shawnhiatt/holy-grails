import { describe, expect, it } from "vitest";
import { describeEndpoint, rateLimitLogEnabled, rateLimitLogLine } from "./rateLimitLog";

describe("rateLimitLogEnabled", () => {
  it("is off unless set to something truthy", () => {
    for (const v of [undefined, "", " ", "0", "false", "FALSE", "off"]) {
      expect(rateLimitLogEnabled(v)).toBe(false);
    }
    for (const v of ["1", "true", "on", "yes"]) {
      expect(rateLimitLogEnabled(v)).toBe(true);
    }
  });
});

describe("describeEndpoint", () => {
  it("masks the username and drops the query string", () => {
    expect(
      describeEndpoint("https://api.discogs.com/users/someone/collection/folders/3/releases?page=2&per_page=100")
    ).toBe("/users/:u/collection/folders/3/releases");
    expect(describeEndpoint("https://api.discogs.com/marketplace/stats/123?curr_abbr=USD")).toBe(
      "/marketplace/stats/123"
    );
    expect(describeEndpoint("not a url")).toBe("?");
  });
});

describe("rateLimitLogLine", () => {
  it("carries the three rate-limit headers, the fingerprint, and the endpoint", () => {
    const headers = new Headers({
      "X-Discogs-Ratelimit": "60",
      "X-Discogs-Ratelimit-Used": "12",
      "X-Discogs-Ratelimit-Remaining": "48",
    });
    expect(
      rateLimitLogLine({
        method: "get",
        url: "https://api.discogs.com/users/someone/wants?page=1",
        status: 200,
        tokenFingerprint: "ab12cd34",
        headers,
      })
    ).toBe("[Discogs ratelimit] token=ab12cd34 limit=60 used=12 remaining=48 status=200 GET /users/:u/wants");
  });

  it("marks missing headers instead of dropping them", () => {
    const line = rateLimitLogLine({
      method: "GET",
      url: "https://api.discogs.com/releases/1",
      status: 429,
      tokenFingerprint: "ab12cd34",
      headers: new Headers(),
    });
    expect(line).toContain("limit=- used=- remaining=- status=429");
  });
});
