// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * discogs.proxySearchDatabase against a stubbed Discogs that checks the OAuth
 * signature the way Discogs does. The signer used to leave the URL's query
 * parameters out of the base string; Discogs doesn't reject that, it serves
 * the request as anonymous and blanks every thumb and cover_image — so Look It
 * Up showed placeholder art on every result.
 */

const USER = "searcher";
const TOKEN = "tok-searcher";
const CONSUMER_SECRET = "c-secret";
const TOKEN_SECRET = "t-secret";

const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...sig));
}

/** Verify an OAuth 1.0a HMAC-SHA1 header per RFC 5849 §3.4, query included. */
async function isValidSignature(method: string, url: string, header: string): Promise<boolean> {
  const oauth: Record<string, string> = {};
  for (const m of header.replace(/^OAuth /, "").matchAll(/(\w+)="([^"]*)"/g)) {
    oauth[m[1]] = decodeURIComponent(m[2]);
  }
  const given = oauth.oauth_signature;
  delete oauth.oauth_signature;
  const u = new URL(url);
  const pairs: [string, string][] = Object.entries(oauth);
  u.searchParams.forEach((v, k) => pairs.push([k, v]));
  const norm = pairs
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, av], [b, bv]) => (a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [method, enc(`${u.origin}${u.pathname}`), enc(norm)].join("&");
  return given === (await hmacSha1Base64(`${enc(CONSUMER_SECRET)}&${enc(TOKEN_SECRET)}`, base));
}

const THUMB = "https://i.discogs.com/thumb-150.jpeg";
const COVER = "https://i.discogs.com/cover-600.jpeg";

function stubDiscogs() {
  const calls: { url: string; signed: boolean }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      const signed = await isValidSignature(init?.method ?? "GET", url, auth);
      calls.push({ url, signed });
      // Discogs serves a badly signed request as anonymous: 200, images blanked.
      const body = {
        pagination: { page: 1, pages: 1, items: 2 },
        results: [
          {
            id: 5460, type: "master", master_id: 5460, title: "Miles Davis - Kind Of Blue",
            year: "1959", thumb: signed ? THUMB : "", cover_image: signed ? COVER : "",
            label: ["Columbia"], catno: "CL 1355", country: "US", format: ["Vinyl", "LP"],
            community: { have: 10, want: 3 },
          },
          {
            id: 777, type: "release", master_id: 0, title: "Someone - No Cover",
            year: "", thumb: signed ? THUMB : "", cover_image: "",
          },
        ],
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Discogs-Ratelimit-Remaining": "60" },
      });
    })
  );
  return calls;
}

async function seed(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      discogs_username: USER,
      access_token: "access",
      token_secret: TOKEN_SECRET,
      created_at: Date.now(),
    });
    await ctx.db.insert("auth_sessions", { session_token: TOKEN, discogs_username: USER, created_at: Date.now() });
  });
}

describe("proxySearchDatabase artwork", () => {
  beforeEach(() => {
    vi.stubEnv("DISCOGS_CONSUMER_KEY", "c-key");
    vi.stubEnv("DISCOGS_CONSUMER_SECRET", CONSUMER_SECRET);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("signs the query string, so results carry thumb and cover", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stubDiscogs();
    const res = await t.action(api.discogs.proxySearchDatabase, { sessionToken: TOKEN, query: "kind of blue" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("q=kind%20of%20blue");
    expect(calls[0].signed).toBe(true);
    expect(res.results[0]).toMatchObject({
      id: 5460, type: "master", masterId: 5460, artist: "Miles Davis", title: "Kind Of Blue",
      year: 1959, thumb: THUMB, cover: COVER, label: "Columbia", format: "Vinyl, LP", have: 10, want: 3,
    });
    // cover falls back to thumb when Discogs has no cover_image
    expect(res.results[1]).toMatchObject({ type: "release", masterId: 0, year: 0, thumb: THUMB, cover: THUMB });
  });

  it("signs queries with characters encodeURIComponent leaves bare, plus filters", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const calls = stubDiscogs();
    const res = await t.action(api.discogs.proxySearchDatabase, {
      sessionToken: TOKEN, query: "Don't (Stop)! * & more", searchType: "release", page: 2,
      format: "Vinyl", genre: "Funk / Soul",
    });
    expect(calls[0].signed).toBe(true);
    expect(res.results[0].thumb).toBe(THUMB);
  });
});
