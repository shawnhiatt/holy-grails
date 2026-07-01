"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const DISCOGS_BASE = "https://api.discogs.com";
const USER_AGENT = "HolyGrails/1.0";

/**
 * Consumer credentials are read from Convex environment variables.
 * Set via `npx convex env set DISCOGS_CONSUMER_KEY <value>` and
 * `npx convex env set DISCOGS_CONSUMER_SECRET <value>` for both
 * dev and prod deployments.
 */
function getConsumerKey(): string {
  const k = process.env.DISCOGS_CONSUMER_KEY;
  if (!k) throw new Error("DISCOGS_CONSUMER_KEY env var not set");
  return k;
}

function getConsumerSecret(): string {
  const s = process.env.DISCOGS_CONSUMER_SECRET;
  if (!s) throw new Error("DISCOGS_CONSUMER_SECRET env var not set");
  return s;
}

/**
 * Build an OAuth 1.0a Authorization header.
 *
 * Discogs OAuth 1.0a requires these parameters in the Authorization header.
 * For the request-token and access-token exchange steps we use PLAINTEXT
 * signature method (consumer secret + "&" + token secret).
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
    callback_url: v.string(),
  },
  handler: async (_ctx, args) => {
    const consumerKey = getConsumerKey();
    const consumerSecret = getConsumerSecret();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, "");

    const authHeader = buildOAuthHeader({
      oauth_consumer_key: consumerKey,
      oauth_nonce: nonce,
      oauth_signature: `${consumerSecret}&`,
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
 * Step 2 (internal helper): Exchange the verifier for a permanent access token.
 *
 * POST https://api.discogs.com/oauth/access_token
 */
async function exchangeAccessToken(args: {
  oauth_token: string;
  oauth_token_secret: string;
  oauth_verifier: string;
}): Promise<{ access_token: string; token_secret: string }> {
  const consumerKey = getConsumerKey();
  const consumerSecret = getConsumerSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const authHeader = buildOAuthHeader({
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_token: args.oauth_token,
    oauth_signature: `${consumerSecret}&${args.oauth_token_secret}`,
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
    throw new Error(`Discogs access_token failed (${res.status}): ${body}`);
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
}

/**
 * Step 3 (internal helper): Fetch the authenticated user's identity.
 *
 * GET https://api.discogs.com/oauth/identity
 *
 * Uses the permanent access token to discover the username — this is the
 * ONLY source of truth for which account the caller controls. Then fetches
 * the user profile for the avatar URL.
 */
async function fetchDiscogsIdentity(args: {
  access_token: string;
  token_secret: string;
}): Promise<{ username: string; avatar_url: string }> {
  const consumerKey = getConsumerKey();
  const consumerSecret = getConsumerSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const authHeader = buildOAuthHeader({
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_token: args.access_token,
    oauth_signature: `${consumerSecret}&${args.token_secret}`,
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
    throw new Error(`Discogs identity failed (${identityRes.status}): ${body}`);
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
    oauth_consumer_key: consumerKey,
    oauth_nonce: profileNonce,
    oauth_token: args.access_token,
    oauth_signature: `${consumerSecret}&${args.token_secret}`,
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

  return { username, avatar_url: avatarUrl };
}

/**
 * Steps 2+3+4 in one server-side action: exchange the verifier for an
 * access token, derive the username from Discogs /oauth/identity, and
 * upsert the user record via an internal mutation.
 *
 * Security properties:
 *  - The client NEVER receives raw OAuth access tokens.
 *  - The client CANNOT supply a username — identity is derived entirely
 *    server-side from the token Discogs just issued, so a caller can only
 *    ever mint a session for the Discogs account they actually control.
 */
export const completeLogin = action({
  args: {
    oauth_token: v.string(),
    oauth_token_secret: v.string(),
    oauth_verifier: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    username: string;
    avatar_url: string;
    session_token: string;
    is_new: boolean;
  }> => {
    const tokens = await exchangeAccessToken(args);
    const identity = await fetchDiscogsIdentity(tokens);

    const result: { session_token: string; is_new: boolean } =
      await ctx.runMutation(internal.users.upsert, {
        discogs_username: identity.username,
        discogs_avatar_url: identity.avatar_url || undefined,
        access_token: tokens.access_token,
        token_secret: tokens.token_secret,
      });

    return {
      username: identity.username,
      avatar_url: identity.avatar_url,
      session_token: result.session_token,
      is_new: result.is_new,
    };
  },
});
