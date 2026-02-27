import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { LoadingScreen } from "./loading-screen";
import { oauthInFlight } from "./oauth-helpers";

interface AuthCallbackProps {
  onSuccess: (user: {
    username: string;
    avatarUrl: string;
    accessToken: string;
    tokenSecret: string;
  }) => void;
  onError: (error: string) => void;
}

/**
 * Handles the OAuth callback from Discogs.
 *
 * Reads oauth_token and oauth_verifier from URL params, exchanges them for
 * an access token via Convex action, fetches the user's identity, and stores
 * credentials in Convex.
 */
export function AuthCallback({ onSuccess, onError }: AuthCallbackProps) {
  const [status, setStatus] = useState<"exchanging" | "identifying" | "saving" | "done">(
    "exchanging"
  );
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

    const consumerKey = import.meta.env.VITE_DISCOGS_CONSUMER_KEY;
    const consumerSecret = import.meta.env.VITE_DISCOGS_CONSUMER_SECRET;

    if (!consumerKey || !consumerSecret) {
      onError("Discogs API credentials not configured.");
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
        setStatus("exchanging");
        const tokens = await exchangeToken({
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          oauth_token: oauthToken!,
          oauth_token_secret: tokenSecret!,
          oauth_verifier: oauthVerifier!,
        });

        if (cancelled) return;

        // Step 2: Fetch identity (username + avatar)
        setStatus("identifying");
        const identity = await fetchIdentityAction({
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          access_token: tokens.access_token,
          token_secret: tokens.token_secret,
        });

        if (cancelled) return;

        // Step 3: Store in Convex
        setStatus("saving");
        await upsertUser({
          discogs_username: identity.username,
          discogs_avatar_url: identity.avatar_url || undefined,
          access_token: tokens.access_token,
          token_secret: tokens.token_secret,
        });

        // Clean up session storage
        sessionStorage.removeItem("hg_oauth_token_secret");

        if (cancelled) return;

        // Hold at "done" for 500ms so the progress bar can animate to 100%
        // (300ms fill) and hold briefly (200ms) before the screen unmounts.
        setStatus("done");
        await new Promise<void>((r) => setTimeout(r, 500));

        if (cancelled) return;

        // Clean up URL params
        window.history.replaceState({}, "", "/");

        onSuccess({
          username: identity.username,
          avatarUrl: identity.avatar_url,
          accessToken: tokens.access_token,
          tokenSecret: tokens.token_secret,
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

  const statusText =
    status === "exchanging"
      ? "Authenticating"
      : status === "identifying"
        ? "Fetching your profile"
        : "Saving credentials";

  return <LoadingScreen message={statusText} progress={status === "done" ? 100 : undefined} />;
}
