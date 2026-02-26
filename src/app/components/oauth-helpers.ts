/**
 * Client-side OAuth helpers for initiating the Discogs OAuth 1.0a flow.
 *
 * This module handles step 1: requesting a temporary token via a Convex action,
 * storing the token secret in sessionStorage, and redirecting the user to
 * Discogs for authorization.
 *
 * sessionStorage is used only for the transient request-token secret that
 * bridges the redirect. It is cleared immediately after the callback completes.
 * All persistent data lives in Convex — no localStorage is used anywhere.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

/**
 * Initiate the Discogs OAuth flow.
 *
 * 1. Calls the Convex `oauth.requestToken` action to get a temporary token
 * 2. Stores the token secret in sessionStorage (needed after redirect)
 * 3. Redirects the user to Discogs authorization page
 */
export async function initiateDiscogsOAuth(): Promise<void> {
  const consumerKey = import.meta.env.VITE_DISCOGS_CONSUMER_KEY;
  const consumerSecret = import.meta.env.VITE_DISCOGS_CONSUMER_SECRET;
  const convexUrl = import.meta.env.VITE_CONVEX_URL;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "Discogs API credentials not configured. Set VITE_DISCOGS_CONSUMER_KEY and VITE_DISCOGS_CONSUMER_SECRET."
    );
  }

  if (!convexUrl) {
    throw new Error(
      "Convex URL not configured. Set VITE_CONVEX_URL."
    );
  }

  const callbackUrl = `${window.location.origin}/auth/callback`;

  // Use ConvexHttpClient for one-off action calls outside of React tree
  const client = new ConvexHttpClient(convexUrl);

  const result = await client.action(api.oauth.requestToken, {
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
    callback_url: callbackUrl,
  });

  // Store token secret in sessionStorage for the callback to use.
  // This is transient — cleared as soon as the callback completes.
  sessionStorage.setItem("hg_oauth_token_secret", result.oauth_token_secret);

  // Redirect user to Discogs authorization page
  window.location.href = `https://www.discogs.com/oauth/authorize?oauth_token=${result.oauth_token}`;
}
