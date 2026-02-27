import { useState, useEffect, useRef } from "react";
import { Disc3 } from "lucide-react";
import { motion } from "motion/react";
import { UnicornScene } from "./unicorn-scene";
import { EASE_OUT } from "./motion-tokens";

interface LoadingScreenProps {
  message: string;
  progress?: number; // 0–100; omit for simulated indeterminate animation
}

/**
 * Unified full-screen loading state used across both the OAuth callback flow
 * and the post-login sync. Shows the same splash video background as the
 * login screen, a Disc3 spinner, and an animated ellipsis below the message.
 */
export function LoadingScreen({ message, progress }: LoadingScreenProps) {
  const [simProgress, setSimProgress] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

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
      className="h-screen w-screen flex flex-col items-center justify-center overflow-hidden"
      style={{
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#0C1A2E",
        background:
          "radial-gradient(ellipse 120% 60% at 50% 0%, #132B44 0%, #0C1A2E 100%)",
        position: "relative",
      }}
    >
      <UnicornScene className="absolute inset-0 w-full h-full" />

      <div
        className="flex flex-col items-center gap-3"
        style={{ position: "relative", zIndex: 1 }}
      >
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
              Fetching your profile...
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
                  ? { duration: 0.3, ease: EASE_OUT }
                  : reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.05, ease: "linear" }
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
