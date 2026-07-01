import { useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { oauthInFlight } from "./oauth-helpers";

interface AuthCallbackProps {
  onSuccess: (user: {
    username: string;
    avatarUrl: string;
    sessionToken: string;
    is_new: boolean;
  }) => void;
  onError: (error: string) => void;
  onStatusChange?: (message: string) => void;
}

/**
 * Handles the OAuth callback from Discogs.
 *
 * Reads oauth_token and oauth_verifier from URL params and passes them to a
 * single server-side Convex action (oauth.completeLogin) that exchanges the
 * verifier, derives the username from Discogs /oauth/identity, and stores
 * credentials — all server-side. The client never sees raw OAuth tokens and
 * never supplies a username. Renders nothing — the parent shows the
 * LoadingScreen.
 */
export function AuthCallback({ onSuccess, onError, onStatusChange }: AuthCallbackProps) {
  const completeLogin = useAction(api.oauth.completeLogin);

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
        onStatusChange?.("Authenticating");
        const result = await completeLogin({
          oauth_token: oauthToken!,
          oauth_token_secret: tokenSecret!,
          oauth_verifier: oauthVerifier!,
        });

        // Clean up session storage
        sessionStorage.removeItem("hg_oauth_token_secret");

        if (cancelled) return;

        // Clean up URL params
        window.history.replaceState({}, "", "/");

        onSuccess({
          username: result.username,
          avatarUrl: result.avatar_url,
          sessionToken: result.session_token,
          is_new: result.is_new,
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
