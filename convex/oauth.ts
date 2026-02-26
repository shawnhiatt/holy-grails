"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT = "HolyGrails/1.0";

/**
 * Build an OAuth 1.0a Authorization header.
 *
 * Discogs OAuth 1.0a requires these parameters in the Authorization header.
 * For the request-token and access-token exchange steps we use an empty
 * oauth_signature (consumer secret + "&" + token secret) since Discogs
 * uses PLAINTEXT signature method for simplicity.
 */
function buildOAuthHeader(params: Record<string, string>): string {
  const parts = Object.entries(params)
    .map(([k, v]) => `${k}="${encodeURIComponent(v)}"`)
    .join(", ");
  return `OAuth ${parts}`;
}

/**
 * Step 1: Request a temporary request token from Discogs.
 *
 * POST https://api.discogs.com/oauth/request_token
 *
 * Returns { oauth_token, oauth_token_secret } which the client uses to
 * redirect the user to Discogs for authorization.
 */
export const requestToken = action({
  args: {
    consumer_key: v.string(),
    consumer_secret: v.string(),
    callback_url: v.string(),
  },
  handler: async (_ctx, args) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");

    const authHeader = buildOAuthHeader({
      oauth_consumer_key: args.consumer_key,
      oauth_nonce: nonce,
      oauth_signature: `${args.consumer_secret}&`,
      oauth_signature_method: "PLAINTEXT",
      oauth_timestamp: timestamp,
      oauth_callback: args.callback_url,
    });

    const res = await fetch(`${DISCOGS_BASE}/oauth/request_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Discogs request_token failed (${res.status}): ${body}`
      );
    }

    const text = await res.text();
    const params = new URLSearchParams(text);
    const oauthToken = params.get("oauth_token");
    const oauthTokenSecret = params.get("oauth_token_secret");

    if (!oauthToken || !oauthTokenSecret) {
      throw new Error(
        `Discogs request_token response missing expected fields: ${text}`
      );
    }

    return {
      oauth_token: oauthToken,
      oauth_token_secret: oauthTokenSecret,
    };
  },
});

/**
 * Step 2: Exchange the verifier for a permanent access token.
 *
 * POST https://api.discogs.com/oauth/access_token
 *
 * After the user authorizes on Discogs, they're redirected back with
 * oauth_token and oauth_verifier. We combine those with the request
 * token secret to get a permanent access token.
 */
export const accessToken = action({
  args: {
    consumer_key: v.string(),
    consumer_secret: v.string(),
    oauth_token: v.string(),
    oauth_token_secret: v.string(),
    oauth_verifier: v.string(),
  },
  handler: async (_ctx, args) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");

    const authHeader = buildOAuthHeader({
      oauth_consumer_key: args.consumer_key,
      oauth_nonce: nonce,
      oauth_token: args.oauth_token,
      oauth_signature: `${args.consumer_secret}&${args.oauth_token_secret}`,
      oauth_signature_method: "PLAINTEXT",
      oauth_timestamp: timestamp,
      oauth_verifier: args.oauth_verifier,
    });

    const res = await fetch(`${DISCOGS_BASE}/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Discogs access_token failed (${res.status}): ${body}`
      );
    }

    const text = await res.text();
    const params = new URLSearchParams(text);
    const accessTokenValue = params.get("oauth_token");
    const accessTokenSecret = params.get("oauth_token_secret");

    if (!accessTokenValue || !accessTokenSecret) {
      throw new Error(
        `Discogs access_token response missing expected fields: ${text}`
      );
    }

    return {
      access_token: accessTokenValue,
      token_secret: accessTokenSecret,
    };
  },
});

/**
 * Step 3: Fetch the authenticated user's identity from Discogs.
 *
 * GET https://api.discogs.com/oauth/identity
 *
 * Uses the permanent access token to discover the username. Then fetches
 * the user profile to get their avatar URL.
 */
export const fetchIdentity = action({
  args: {
    consumer_key: v.string(),
    consumer_secret: v.string(),
    access_token: v.string(),
    token_secret: v.string(),
  },
  handler: async (_ctx, args) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");

    const authHeader = buildOAuthHeader({
      oauth_consumer_key: args.consumer_key,
      oauth_nonce: nonce,
      oauth_token: args.access_token,
      oauth_signature: `${args.consumer_secret}&${args.token_secret}`,
      oauth_signature_method: "PLAINTEXT",
      oauth_timestamp: timestamp,
    });

    // Get identity (username)
    const identityRes = await fetch(`${DISCOGS_BASE}/oauth/identity`, {
      headers: {
        Authorization: authHeader,
        "User-Agent": USER_AGENT,
      },
    });

    if (!identityRes.ok) {
      const body = await identityRes.text().catch(() => "");
      throw new Error(
        `Discogs identity failed (${identityRes.status}): ${body}`
      );
    }

    const identityData = await identityRes.json();
    const username = identityData.username as string;

    if (!username) {
      throw new Error("Discogs identity response missing username");
    }

    // Fetch user profile for avatar
    const profileNonce = crypto.randomUUID().replace(/-/g, "");
    const profileTimestamp = Math.floor(Date.now() / 1000).toString();

    const profileAuthHeader = buildOAuthHeader({
      oauth_consumer_key: args.consumer_key,
      oauth_nonce: profileNonce,
      oauth_token: args.access_token,
      oauth_signature: `${args.consumer_secret}&${args.token_secret}`,
      oauth_signature_method: "PLAINTEXT",
      oauth_timestamp: profileTimestamp,
    });

    let avatarUrl = "";
    try {
      const profileRes = await fetch(
        `${DISCOGS_BASE}/users/${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: profileAuthHeader,
            "User-Agent": USER_AGENT,
          },
        }
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        avatarUrl = (profileData.avatar_url as string) || "";
      }
    } catch {
      // Avatar is non-critical — proceed without it
    }

    return {
      username,
      avatar_url: avatarUrl,
    };
  },
});
