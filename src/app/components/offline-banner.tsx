import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { WifiOff, X } from "lucide-react";
import { useOnlineStatus } from "../hooks/use-online-status";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  return (
    <AnimatePresence>
      {!isOnline && !dismissed && (
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          // lg:!bottom-4 overrides the inline bottom on desktop (no tab bar to clear)
          className="lg:!bottom-4"
          style={{
            position: "fixed",
            bottom: "calc(12px + 60px + 12px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 115,
            display: "flex",
            alignItems: "center",
            gap: 8,
            paddingLeft: 14,
            paddingRight: 10,
            paddingTop: 9,
            paddingBottom: 9,
            borderRadius: 9999,
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border-strong)",
            boxShadow: "var(--c-shadow-modal)",
            whiteSpace: "nowrap",
            width: "fit-content",
            maxWidth: "calc(100vw - 48px)",
          }}
          role="status"
          aria-live="polite"
        >
          <WifiOff size={14} style={{ color: "var(--c-text-secondary)", flexShrink: 0 }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: "var(--c-text-secondary)",
            }}
          >
            You're offline — collection data unavailable
          </span>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border: "none",
              padding: "2px",
              color: "var(--c-text-muted)",
              flexShrink: 0,
              lineHeight: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
