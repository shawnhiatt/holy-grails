/**
 * Client-side OAuth helpers for initiating the Discogs OAuth 1.0a flow.
 *
 * This module handles step 1: requesting a temporary token via a Convex action
 * and redirecting the user to Discogs for authorization.
 *
 * Consumer credentials are stored server-side in Convex environment variables —
 * the client never sees or sends them.
 *
 * sessionStorage is used only for the transient request-token secret that
 * bridges the redirect. It is cleared immediately after the callback completes.
 * All persistent data lives in Convex — no localStorage is used anywhere.
 */

/**
 * In-memory flag that is true between the moment the OAuth redirect begins
 * and the moment auth-callback.tsx confirms a successful return.
 *
 * Used by App.tsx to distinguish abandonment (flag still true when the page
 * becomes visible again) from success (flag cleared by auth-callback before
 * visibilitychange can fire).
 *
 * This is a module-level object (not React state/localStorage) so that:
 *  - It is shared between App.tsx and auth-callback.tsx without prop-drilling.
 *  - It survives iOS Safari bfcache restores, where the JS heap is preserved
 *    exactly as it was when the page was cached.
 */
export const oauthInFlight = { current: false };

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";

/**
 * Initiate the Discogs OAuth flow.
 *
 * 1. Calls the Convex `oauth.requestToken` action to get a temporary token
 *    (consumer credentials are resolved server-side from env vars)
 * 2. Stores the token secret in sessionStorage (needed after redirect)
 * 3. Redirects the user to Discogs authorization page
 */
export async function initiateDiscogsOAuth(): Promise<void> {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;

  if (!convexUrl) {
    throw new Error(
      "Convex URL not configured. Set VITE_CONVEX_URL."
    );
  }

  const callbackUrl = `${window.location.origin}/auth/callback`;

  // Use ConvexHttpClient for one-off action calls outside of React tree
  const client = new ConvexHttpClient(convexUrl);

  const result = await client.action(api.oauth.requestToken, {
    callback_url: callbackUrl,
  });

  // Store token secret in sessionStorage for the callback to use.
  // This is transient — cleared as soon as the callback completes.
  sessionStorage.setItem("hg_oauth_token_secret", result.oauth_token_secret);

  // Redirect user to Discogs authorization page
  window.location.href = `https://www.discogs.com/oauth/authorize?oauth_token=${result.oauth_token}`;
}
