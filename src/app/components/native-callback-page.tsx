import { useEffect, useMemo, useState } from "react";
import { getContentTokens } from "./theme";
import logoDark from "../../imports/logo-holy-grails-dark.svg";
import logoLight from "../../imports/logo-holy-grails-light.svg";

/**
 * Fallback for /auth/native-callback — the iOS app's login callback (see
 * convex/oauthCallback.ts). Normally iOS hands that URL straight back to the
 * app and the browser never loads it. It lands here only when the app isn't
 * installed or the login was opened outside it, and the verifier is useless
 * without the token secret the app holds, so all this can do is point the
 * person at the normal web login. Rendered outside AppProvider, like the
 * shared-session page. System theme only.
 */
export function NativeCallbackPage() {
  const [isDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );
  const tokens = useMemo(() => getContentTokens(isDark), [isDark]);

  // Drop the oauth_token/oauth_verifier from the address bar and history.
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <div
      style={{
        ...tokens,
        minHeight: "100dvh",
        background: "var(--c-bg)",
        color: "var(--c-text)",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <div
        className="mx-auto w-full max-w-[560px] px-5 flex flex-col items-center text-center"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 28vh)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
        }}
      >
        <img
          src={isDark ? logoDark : logoLight}
          alt="Holy Grails"
          draggable={false}
          style={{ height: "28px", width: "auto" }}
        />
        <p
          style={{
            marginTop: "28px",
            fontSize: "16px",
            fontWeight: 500,
            color: "var(--c-text-secondary)",
          }}
        >
          That login was meant for the iOS app. Log in here instead.
        </p>
        <a
          href="/"
          className="bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800] rounded-full"
          style={{
            marginTop: "20px",
            padding: "12px 28px",
            fontSize: "15px",
            fontWeight: 600,
            touchAction: "manipulation",
          }}
        >
          Log in
        </a>
      </div>
    </div>
  );
}
