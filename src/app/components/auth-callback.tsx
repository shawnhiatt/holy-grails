import { useEffect } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { oauthInFlight } from "./oauth-helpers";

interface AuthCallbackProps {
  onSuccess: (user: {
    username: string;
    avatarUrl: string;
    accessToken: string;
    tokenSecret: string;
    sessionToken: string;
  }) => void;
  onError: (error: string) => void;
  onStatusChange?: (message: string) => void;
}

/**
 * Handles the OAuth callback from Discogs.
 *
 * Reads oauth_token and oauth_verifier from URL params, exchanges them for
 * an access token via Convex action, fetches the user's identity, and stores
 * credentials in Convex. Renders nothing — the parent shows the LoadingScreen.
 *
 * Consumer credentials are resolved server-side in Convex actions —
 * the client never sends them.
 */
export function AuthCallback({ onSuccess, onError, onStatusChange }: AuthCallbackProps) {
  const exchangeToken = useAction(api.oauth.accessToken);
  const fetchIdentityAction = useAction(api.oauth.fetchIdentity);
  const upsertUser = useMutation(api.users.upsert);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("oauth_token");
    const oauthVerifier = params.get("oauth_verifier");

    if (!oauthToken || !oauthVerifier) {
      onError("Missing OAuth parameters. Please try logging in again.");
      return;
    }

    // Retrieve the request token secret stored before redirect
    const tokenSecret = sessionStorage.getItem("hg_oauth_token_secret");
    if (!tokenSecret) {
      onError("OAuth session expired. Please try logging in again.");
      return;
    }

    let cancelled = false;

    async function completeOAuth() {
      // Clear the in-flight flag immediately — this is a successful return, not
      // an abandonment. Clearing before the exchange ensures visibilitychange
      // (if it fires during the async exchange) finds the flag already false
      // and does not trigger an incorrect abandonment reset.
      oauthInFlight.current = false;

      try {
        // Step 1: Exchange verifier for access token
        onStatusChange?.("Authenticating");
        const tokens = await exchangeToken({
          oauth_token: oauthToken!,
          oauth_token_secret: tokenSecret!,
          oauth_verifier: oauthVerifier!,
        });

        if (cancelled) return;

        // Step 2: Fetch identity (username + avatar)
        onStatusChange?.("Fetching your profile");
        const identity = await fetchIdentityAction({
          access_token: tokens.access_token,
          token_secret: tokens.token_secret,
        });

        if (cancelled) return;

        // Step 3: Store in Convex
        onStatusChange?.("Saving credentials");
        const { session_token } = await upsertUser({
          discogs_username: identity.username,
          discogs_avatar_url: identity.avatar_url || undefined,
          access_token: tokens.access_token,
          token_secret: tokens.token_secret,
        });

        // Clean up session storage
        sessionStorage.removeItem("hg_oauth_token_secret");

        if (cancelled) return;

        // Clean up URL params
        window.history.replaceState({}, "", "/");

        onSuccess({
          username: identity.username,
          avatarUrl: identity.avatar_url,
          accessToken: tokens.access_token,
          tokenSecret: tokens.token_secret,
          sessionToken: session_token,
        });
      } catch (err: any) {
        if (cancelled) return;
        console.error("[OAuth] Error:", err);
        sessionStorage.removeItem("hg_oauth_token_secret");
        window.history.replaceState({}, "", "/");
        onError(err?.message || "Authentication failed. Please try again.");
      }
    }

    completeOAuth();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
