import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import svgPaths from "../../imports/svg-uhymsl4ur0";
import { SplashVideo } from "./splash-video";

type FlowState = "idle" | "loading" | "success";

interface ConnectDiscogsPromptProps {
  isDarkMode: boolean;
  onConnect: () => void;
  onSkip: () => void;
}

export function ConnectDiscogsPrompt({
  isDarkMode,
  onConnect,
  onSkip,
}: ConnectDiscogsPromptProps) {
  const [flowState, setFlowState] = useState<FlowState>("idle");

  const textColor = "#E2E8F0";
  const mutedColor = "#7D92A8";

  /* Logomark colors */
  const logomarkFill = "#1A3048";
  const logomarkStroke = "rgba(226,232,240,0.35)";
  const logomarkStrokeWidth = 0.6;

  const handleConnect = useCallback(() => {
    setFlowState("loading");
    // Simulate OAuth handoff
    setTimeout(() => {
      setFlowState("success");
    }, 1400);
  }, []);

  // Auto-navigate to Feed after success
  useEffect(() => {
    if (flowState === "success") {
      const timer = setTimeout(() => {
        onConnect();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [flowState, onConnect]);

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

      <AnimatePresence mode="wait">
        {flowState === "success" ? (
          /* ─── Success State ─── */
          <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col items-center justify-center px-6"
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* Checkmark circle */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 0.5,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex items-center justify-center rounded-full"
              style={{
                width: 72,
                height: 72,
                backgroundColor: "rgba(62, 152, 66, 0.15)",
              }}
            >
              <Check
                size={36}
                strokeWidth={2.5}
                style={{ color: "#3E9842" }}
              />
            </motion.div>

            {/* "Connected." */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                fontSize: "28px",
                fontWeight: 700,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                letterSpacing: "-0.5px",
                color: textColor,
                marginTop: "20px",
                lineHeight: 1.2,
              }}
            >
              Connected.
            </motion.h1>

            {/* Placeholder username */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                fontSize: "15px",
                fontWeight: 400,
                color: mutedColor,
                marginTop: "8px",
                lineHeight: 1.5,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              catxdad19
            </motion.p>
          </motion.div>
        ) : (
          /* ─── Idle / Loading State ─── */
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* Centered content */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-[440px] mx-auto w-full">
              {/* Heading */}
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  letterSpacing: "-0.5px",
                  color: textColor,
                  lineHeight: 1.2,
                  marginTop: "28px",
                  textAlign: "center",
                }}
              >
                Connect your Discogs collection
              </motion.h1>

              {/* Subtext */}
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.25,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  fontSize: "15px",
                  fontWeight: 400,
                  color: mutedColor,
                  lineHeight: 1.6,
                  marginTop: "14px",
                  textAlign: "center",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  maxWidth: "340px",
                }}
              >
                Holy Grails syncs your collection and wantlist from Discogs.
                Without it, the app is just an empty crate.
              </motion.p>
            </div>

            {/* Bottom action area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.35,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex flex-col items-center px-6 max-w-[440px] mx-auto w-full"
              style={{
                paddingBottom:
                  "calc(48px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {/* Primary action */}
              <button
                onClick={handleConnect}
                disabled={flowState === "loading"}
                className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
                style={{
                  backgroundColor: "#EBFD00",
                  color: "#0C284A",
                  fontSize: "15px",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  lineHeight: 1.5,
                  border: "1px solid rgba(12,40,74,0.25)",
                  minHeight: "48px",
                  opacity: flowState === "loading" ? 0.85 : 1,
                }}
              >
                {flowState === "loading" ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Loader2
                      size={20}
                      strokeWidth={2.5}
                      className="animate-spin"
                      style={{ color: "#0C284A" }}
                    />
                  </motion.div>
                ) : (
                  "Connect Discogs"
                )}
              </button>

              {/* Helper text beneath button */}
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  color: mutedColor,
                  marginTop: "12px",
                  textAlign: "center",
                  lineHeight: 1.5,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  opacity: flowState === "loading" ? 0 : 1,
                  transition: "opacity 200ms ease",
                }}
              >
                You'll be redirected to discogs.com to authorize access.
              </p>

              {/* Skip link */}
              {flowState === "idle" && (
                <button
                  onClick={onSkip}
                  className="mt-3 cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: "13px",
                    fontWeight: 500,
                    color: mutedColor,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    lineHeight: 1.5,
                  }}
                >
                  Skip for now
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}