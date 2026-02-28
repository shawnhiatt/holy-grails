import { useRef, useEffect, useState } from "react";
import type React from "react";
import { X } from "lucide-react";
import { motion, useMotionValue, animate } from "motion/react";
import { useApp } from "./app-context";
import { EASE_OUT, EASE_IN, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";

/* SlideOutPanel — shared bottom sheet with swipe-to-dismiss.
   Provides: backdrop, grab handle, optional title header, scrollable children
   slot, optional pinned footer. Swipe behavior copied exactly from AlbumDetailSheet.

   CSS variables are injected inline so the panel renders correctly as a
   fixed overlay outside the main cascade. */

interface SlideOutPanelProps {
  /** Called when the panel should close (backdrop tap, X button, swipe-down). */
  onClose: () => void;
  /** If provided, renders a header row with the title text and an X close button. */
  title?: string;
  /** Extra element rendered in the header row alongside the title (e.g. a Reset button).
      Only used when title is also provided. */
  headerAction?: React.ReactNode;
  /** Content rendered inside the scrollable area. */
  children: React.ReactNode;
  /** Optional element pinned below the scrollable area, above safe-area insets. */
  footer?: React.ReactNode;
  /** Extra classes applied to the sheet element (e.g. desktop positioning overrides). */
  className?: string;
  /** z-index for the backdrop layer. Default: 110. */
  backdropZIndex?: number;
  /** z-index for the sheet layer. Default: 120. */
  sheetZIndex?: number;
  /** Applies a subtle x-offset to the entrance animation (used by shake-to-random). */
  shakeEntrance?: boolean;
}

export function SlideOutPanel({
  onClose,
  title,
  headerAction,
  children,
  footer,
  className = "",
  backdropZIndex = 110,
  sheetZIndex = 120,
  shakeEntrance = false,
}: SlideOutPanelProps) {
  const { isDarkMode } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetY = useMotionValue(0);
  const backdropOpacity = useMotionValue(1);
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const [dismissed, setDismissed] = useState(false);

  // Attach non-passive touch listeners on the scroll container so we can
  // preventDefault during a pull-to-dismiss gesture (scrollTop === 0 + drag down).
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const onTouchStart = (e: TouchEvent) => {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - startYRef.current;

      if (pullingRef.current) {
        // Already in pull mode — keep translating sheet
        e.preventDefault();
        const dampened = dy * 0.55;
        sheetY.set(Math.max(0, dampened));
        backdropOpacity.set(Math.max(0, 1 - dampened / 350));
        return;
      }

      // Enter pull mode: at top of scroll AND dragging down
      if (scrollEl.scrollTop <= 0 && dy > 6) {
        pullingRef.current = true;
        e.preventDefault();
        sheetY.set(dy * 0.55);
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const y = sheetY.get();
      if (y > 80) {
        // Dismiss
        setDismissed(true);
        animate(sheetY, window.innerHeight, { duration: DURATION_NORMAL, ease: EASE_IN });
        animate(backdropOpacity, 0, { duration: DURATION_FAST });
        setTimeout(() => onClose(), 260);
      } else {
        // Snap back
        animate(sheetY, 0, { duration: DURATION_FAST, ease: EASE_OUT });
        animate(backdropOpacity, 1, { duration: DURATION_FAST });
      }
    };

    scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollEl.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      scrollEl.removeEventListener("touchstart", onTouchStart);
      scrollEl.removeEventListener("touchmove", onTouchMove);
      scrollEl.removeEventListener("touchend", onTouchEnd);
    };
  }, [sheetY, backdropOpacity, onClose]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/30"
        style={{ zIndex: backdropZIndex, opacity: backdropOpacity }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%", x: shakeEntrance ? 20 : 0 }}
        animate={dismissed ? undefined : { y: 0, x: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 70 || info.velocity.y > 300) onClose();
        }}
        className={`fixed left-0 right-0 bottom-0 rounded-t-[20px] overflow-hidden flex flex-col ${className}`}
        style={{
          y: sheetY,
          zIndex: sheetZIndex,
          bottom: "env(safe-area-inset-bottom, 0px)",
          maxHeight: "calc(100vh - 58px)",
          backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
          boxShadow: isDarkMode
            ? "0 -8px 32px rgba(0,0,0,0.3)"
            : "0 -8px 32px rgba(12,40,74,0.1)",
          "--c-bg": isDarkMode ? "#0C1A2E" : "#F9F9FA",
          "--c-surface": isDarkMode ? "#132B44" : "#FFFFFF",
          "--c-surface-hover": isDarkMode ? "#1A3350" : "#EFF1F3",
          "--c-surface-alt": isDarkMode ? "#0F2238" : "#F9F9FA",
          "--c-text": isDarkMode ? "#E2E8F0" : "#0C284A",
          "--c-text-secondary": isDarkMode ? "#9EAFC2" : "#455B75",
          "--c-text-tertiary": isDarkMode ? "#8A9BB0" : "#617489",
          "--c-text-muted": isDarkMode ? "#7D92A8" : "#6B7B8E",
          "--c-text-faint": isDarkMode ? "#6A8099" : "#8494A5",
          "--c-border": isDarkMode ? "#1A3350" : "#D2D8DE",
          "--c-border-strong": isDarkMode ? "#2D4A66" : "#74889C",
          "--c-chip-bg": isDarkMode ? "#1A3350" : "#EFF1F3",
          "--c-input-bg": isDarkMode ? "#0F2238" : "#F9F9FA",
        } as React.CSSProperties}
      >
        {/* Grab handle — mobile only; desktop panels don't use bottom-sheet chrome */}
        <div
          className="flex justify-center py-3 flex-shrink-0 cursor-grab lg:hidden"
          style={{ touchAction: "none" }}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: isDarkMode ? "#2D4A66" : "#D2D8DE" }}
          />
        </div>

        {/* Optional title header */}
        {title && (
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--c-border-strong)" }}
          >
            <div className="flex items-center gap-3">
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  color: "var(--c-text)",
                }}
              >
                {title}
              </h3>
              {headerAction}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{
                color: "var(--c-text-muted)",
                border: "1px solid var(--c-border-strong)",
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-none"
          style={{
            paddingBottom: footer
              ? undefined
              : "calc(env(safe-area-inset-bottom, 0px) + 120px)",
          }}
        >
          {children}
        </div>

        {/* Optional pinned footer */}
        {footer && (
          <div
            className="pt-4 px-4 flex-shrink-0"
            style={{
              borderTop: "1px solid var(--c-border-strong)",
              paddingBottom: "var(--slide-panel-footer-pb)",
            }}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </>
  );
}
