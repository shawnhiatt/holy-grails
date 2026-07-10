import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Disc3, AlertTriangle } from "./icons";
import { DURATION_FAST } from "./motion-tokens";
import { UnicornScene } from "./unicorn-scene";
import logoSplash from "../../imports/logo-holy-grails-splash.svg";

interface SplashScreenProps {
  isDarkMode: boolean;
  onLoginWithDiscogs: () => Promise<void>;
}

export function SplashScreen({
  onLoginWithDiscogs,
}: SplashScreenProps) {
  const mutedColor = "#868C96";

  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showDataNote, setShowDataNote] = useState(false);

  const handleLoginClick = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      await onLoginWithDiscogs();
      // If successful, page redirects to Discogs — loading state doesn't matter
    } catch (err: any) {
      setLoginLoading(false);
      setLoginError(err?.message || "Failed to connect to Discogs.");
    }
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        position: "absolute",
        height: "calc(100dvh + 200px)",
        inset: 0,
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#101318",
        background: "radial-gradient(ellipse 120% 60% at 50% 0%, #181B21 0%, #101318 100%)",
      }}
    >
      {/* Fullscreen WebGL scene background */}
      <UnicornScene className="absolute inset-0 w-full h-full" />

      {/* Logo + button group — centered vertically within a min-height container
          so the button sits close to the wordmark and doesn't float to the
          bottom of the viewport on tall screens */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6"
        style={{ position: "relative", zIndex: 1, top: -100 }}
      >
        <div
          className="flex flex-col items-center w-full max-w-[400px]"
          style={{ minHeight: "60vh", justifyContent: "center" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center w-full"
          >
            {/* Splash logo with crown accent */}
            <img src={logoSplash} alt="Holy Grails" className="w-full max-w-[400px] h-auto" draggable={false} />

            {/* Tagline */}
            <p
              className="mt-4"
              style={{
                fontSize: "14px",
                fontWeight: 400,
                color: mutedColor,
                textAlign: "center",
                lineHeight: 1.4,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              Your Discogs companion app.
            </p>
          </motion.div>

          {/* Login button — sits naturally below the wordmark */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center w-full"
            style={{ marginTop: 40 }}
          >
            {/* Primary: Log in with Discogs */}
            <button
              onClick={handleLoginClick}
              disabled={loginLoading}
              className="w-full py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer flex-shrink-0"
              style={{
                backgroundColor: "#EBFD00",
                color: "#16181C",
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                lineHeight: 1.5,
                border: "1px solid rgba(22,24,28,0.25)",
                opacity: loginLoading ? 0.85 : 1,
              }}
            >
              {loginLoading ? (
                <Disc3 size={16} className="disc-spinner" />
              ) : (
                <Disc3 size={16} />
              )}
              {loginLoading ? "Connecting..." : "Log in with Discogs"}
            </button>

            {/* Sign up link */}
            <a
              href="https://www.discogs.com/register"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "13px",
                fontWeight: 400,
                color: "#D1D8DF",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                marginTop: "24px",
                textDecoration: "underline",
              }}
            >
              Create a Discogs account
            </a>

            {/* Privacy note — one line, tappable for the fuller version */}
            <p
              style={{
                fontSize: "12px",
                fontWeight: 400,
                color: mutedColor,
                textAlign: "center",
                lineHeight: 1.5,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                marginTop: "16px",
              }}
            >
              Logs in with Discogs — we never see your password.{" "}
              <button
                onClick={() => setShowDataNote((v) => !v)}
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  color: "#D1D8DF",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  textDecoration: "underline",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                What we store
              </button>
            </p>
            <AnimatePresence>
              {showDataNote && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION_FAST }}
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    color: mutedColor,
                    textAlign: "center",
                    lineHeight: 1.6,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    marginTop: "8px",
                    maxWidth: "340px",
                  }}
                >
                  Your OAuth token and a cached copy of your collection and wantlist, so the app loads fast. Purge tags, sessions, and follows live only here. Nothing changes on Discogs unless you tap the button that does it. Delete All My Data in Settings removes everything.
                </motion.p>
              )}
            </AnimatePresence>

            {/* Login error */}
            {loginError && (
              <div
                className="w-full mt-3 rounded-[8px] p-3 flex items-start gap-2"
                style={{
                  backgroundColor: "var(--c-destructive-tint)",
                  border: "1px solid rgba(255,51,182,0.2)",
                }}
              >
                <AlertTriangle size={14} style={{ color: "var(--c-destructive)", flexShrink: 0, marginTop: "1px" }} />
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 400,
                    color: "var(--c-destructive)",
                    wordBreak: "break-word",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    lineHeight: 1.5,
                  }}
                >
                  {loginError}
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
