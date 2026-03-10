import { AnimatePresence, motion } from "motion/react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/use-online-status";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();

  return (
    <AnimatePresence>
      {!isOnline && (
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
            paddingRight: 14,
            height: 36,
            borderRadius: 9999,
            backgroundColor: "var(--c-surface)",
            border: "1px solid var(--c-border-strong)",
            boxShadow: "var(--c-shadow-modal)",
            whiteSpace: "nowrap",
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
