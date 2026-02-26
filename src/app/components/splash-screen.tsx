import { useState } from "react";
import { motion } from "motion/react";
import { Disc3, AlertTriangle } from "lucide-react";
import { WordmarkLogo } from "./navigation";
import { SplashVideo } from "./splash-video";

interface SplashScreenProps {
  isDarkMode: boolean;
  onSkipToFeed?: () => void;
  onDevSync?: (username: string, token: string) => Promise<void>;
  isSyncing?: boolean;
  syncProgress?: string;
  onLoginWithDiscogs: () => Promise<void>;
}

export function SplashScreen({
  isDarkMode,
  onLoginWithDiscogs,
}: SplashScreenProps) {
  const mutedColor = "#7D92A8";
  const logoFill = "#E2E8F0";

  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#0C1A2E",
        background: "radial-gradient(ellipse 120% 60% at 50% 0%, #132B44 0%, #0C1A2E 100%)",
        position: "relative",
      }}
    >
      {/* Fullscreen looping video background */}
      <SplashVideo />

      {/* Upper section — Logo group */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-8 pb-6"
        style={{ position: "relative", zIndex: 1 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center"
        >
          {/* Wordmark logo — same as app header */}
          <WordmarkLogo
            className="w-[300px] lg:w-[480px] h-auto"
            fillColor={logoFill}
            isDarkMode={isDarkMode}
          />

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
      </div>

      {/* Lower section — Login button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center justify-start max-w-[400px] mx-auto w-full"
        style={{ paddingTop: 0, paddingRight: 24, paddingBottom: 48, paddingLeft: 24, position: "relative", zIndex: 1 }}
      >
        {/* Primary: Log in with Discogs */}
        <button
          onClick={handleLoginClick}
          disabled={loginLoading}
          className="w-full py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer flex-shrink-0"
          style={{
            backgroundColor: "#EBFD00",
            color: "#0C284A",
            fontSize: "14px",
            fontWeight: 600,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.5,
            border: "1px solid rgba(12,40,74,0.25)",
            opacity: loginLoading ? 0.85 : 1,
          }}
        >
          {loginLoading ? (
            <Disc3 size={16} strokeWidth={2} className="disc-spinner" />
          ) : (
            <Disc3 size={16} strokeWidth={2} />
          )}
          {loginLoading ? "Connecting..." : "Log in with Discogs"}
        </button>

        {/* Login error */}
        {loginError && (
          <div
            className="w-full mt-3 rounded-[8px] p-3 flex items-start gap-2"
            style={{
              backgroundColor: "rgba(255,51,182,0.08)",
              border: "1px solid rgba(255,51,182,0.2)",
            }}
          >
            <AlertTriangle size={14} style={{ color: "#FF33B6", flexShrink: 0, marginTop: "1px" }} />
            <p
              style={{
                fontSize: "12px",
                fontWeight: 400,
                color: "#FF33B6",
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
  );
}
