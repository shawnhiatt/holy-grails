import { useState, useEffect, useRef } from "react";
import { Disc3, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { UnicornScene } from "./unicorn-scene";
import { EASE_OUT, DURATION_SLOW, DURATION_NORMAL } from "./motion-tokens";
import { useOnlineStatus } from "../hooks/use-online-status";

interface LoadingScreenProps {
  message: string;
  progress?: number; // 0–100; omit for simulated indeterminate animation
  /** Pre-computed cycling stats for returning users (derived from Convex cache) */
  stats?: string[];
}

/**
 * Unified full-screen loading state used across both the OAuth callback flow
 * and the post-login sync. Shows the same splash video background as the
 * login screen, a Disc3 spinner, and an animated ellipsis below the message.
 */
export function LoadingScreen({ message, progress, stats }: LoadingScreenProps) {
  const [simProgress, setSimProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const { isOnline } = useOnlineStatus();

  // Cycling collection stats for returning users
  const statPool = stats ?? [];
  const [statIndex, setStatIndex] = useState(0);

  useEffect(() => {
    if (statPool.length === 0) return;
    setStatIndex(0);
    const id = setInterval(() => {
      setStatIndex((i) => (i + 1) % statPool.length);
    }, 3000);
    return () => clearInterval(id);
  }, [statPool.length]);

  // After 5s of loading, if still offline, surface an offline message
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(id);
  }, []);

  const showOfflineMessage = timedOut && !isOnline;

  // Respect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Simulated progress: fast to ~40% (800ms), ease-out quad to ~85% (4.8s),
  // then slow crawl (0.5%/s) capped at 89%. Cancelled on unmount via ref.
  useEffect(() => {
    if (progress !== undefined || reducedMotion) return;
    startTimeRef.current = null;

    const tick = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const elapsed = (ts - startTimeRef.current) / 1000;
      let p: number;
      if (elapsed < 0.8) {
        p = (elapsed / 0.8) * 40;
      } else if (elapsed < 4.8) {
        const t = (elapsed - 0.8) / 4.0;
        p = 40 + 45 * t * (2 - t); // ease-out quad: 40% → 85%
      } else {
        const extra = elapsed - 4.8;
        p = Math.min(85 + extra * 0.5, 89);
      }
      setSimProgress(p);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [progress, reducedMotion]);

  const isSimulated = progress === undefined;
  const isComplete = !isSimulated && progress >= 100;
  const displayProgress = reducedMotion ? 60 : isSimulated ? simProgress : (progress ?? 0);

  return (
    <div
      className="flex flex-col items-center justify-center overflow-hidden"
      style={{
        position: "absolute",
        height: "calc(100dvh + 200px)",
        inset: 0,
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#0C1A2E",
        background:
          "radial-gradient(ellipse 120% 60% at 50% 0%, #091E34 0%, #0C1A2E 100%)",
      }}
    >
      <UnicornScene className="absolute inset-0 w-full h-full" />

      <div
        className="flex flex-col items-center gap-3"
        style={{ position: "relative", zIndex: 1, top: -100 }}
      >
        {showOfflineMessage ? (
          /* Offline fallback — shown after 5s with no connection */
          <>
            <WifiOff size={28} style={{ color: "#9EAFC2" }} />
            <span
              style={{
                fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
                fontSize: 14,
                fontWeight: 400,
                color: "#9EAFC2",
                textAlign: "center",
                maxWidth: 220,
                lineHeight: 1.6,
              }}
            >
              You're offline. Connect to load your collection.
            </span>
          </>
        ) : (
          /* Normal loading state */
          <>
            <Disc3 size={32} className="disc-spinner" style={{ color: "#ACDEF2" }} />

            {/* Label + progress bar — inline-flex column sizes to ghost span width */}
            <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
              {/* Label row */}
              <div style={{ position: "relative" }}>
                {/* Ghost: inline-block, sets container width to longest expected message */}
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    visibility: "hidden",
                    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
                    fontSize: 14,
                    fontWeight: 400,
                    whiteSpace: "nowrap",
                  }}
                >
                  Syncing users you follow (25 of 25)...
                </span>

                {/* Centered label + animated ellipsis, overlaid on the ghost */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                    <span
                      style={{
                        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
                        fontSize: 14,
                        fontWeight: 400,
                        color: "#9EAFC2",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {message}
                    </span>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-flex",
                        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
                        fontSize: 14,
                        fontWeight: 400,
                        color: "#9EAFC2",
                      }}
                    >
                      <span>.</span>
                      <span className="sync-dot-2">.</span>
                      <span className="sync-dot-3">.</span>
                    </span>
                  </span>
                </div>
              </div>

              {/* Progress bar — scaleX from left so gradient is a fixed wash, not a stretching stripe */}
              <div
                style={{
                  height: 3,
                  borderRadius: 9999,
                  backgroundColor: "rgba(172, 222, 242, 0.12)",
                  overflow: "hidden",
                }}
              >
                <motion.div
                  style={{
                    height: "100%",
                    borderRadius: 9999,
                    background: "linear-gradient(to right, #FF98DA, #ACDEF2, #3E9842)",
                    transformOrigin: "left center",
                  }}
                  animate={{ scaleX: displayProgress / 100 }}
                  transition={
                    isComplete
                      ? { duration: DURATION_SLOW, ease: EASE_OUT }
                      : reducedMotion
                      ? { duration: 0 }
                      : { duration: 0.05, ease: "linear" }
                  }
                />
              </div>
            </div>

            {/* Cycling collection stats — always reserves space to prevent layout shift */}
            <div
              style={{
                height: 20,
                marginTop: 16,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <AnimatePresence mode="wait">
                {statPool.length > 0 && (
                  <motion.span
                    key={statIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DURATION_NORMAL }}
                    style={{
                      fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
                      fontSize: 13,
                      fontWeight: 400,
                      color: "#6A8099",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statPool[statIndex]}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
