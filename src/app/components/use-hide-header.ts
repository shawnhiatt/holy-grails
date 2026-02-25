import { useRef, useCallback } from "react";
import { useApp } from "./app-context";

/** Screens where the mobile header hides on scroll */
const HIDE_HEADER_SCREENS = new Set(["crate", "wants", "friends", "reports"]);

/** Minimum scroll delta (px) before triggering a hide. Prevents flicker on small incidental scrolls. */
const SCROLL_THRESHOLD = 8;

/**
 * Returns an `onScroll` handler to attach to scrollable containers.
 * When attached, scrolling down hides the mobile header and scrolling up (or reaching the top) reveals it.
 * Only active on the screens listed in HIDE_HEADER_SCREENS.
 */
export function useHideHeaderOnScroll() {
  const { screen, setHeaderHidden } = useApp();
  const lastScrollTop = useRef(0);
  const accumulatedDelta = useRef(0);
  const lastDirection = useRef<"up" | "down" | null>(null);

  const enabled = HIDE_HEADER_SCREENS.has(screen);

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      if (!enabled) return;

      const target = e.currentTarget;
      const scrollTop = target.scrollTop;

      // At the very top — always show header
      if (scrollTop <= 0) {
        setHeaderHidden(false);
        lastScrollTop.current = 0;
        accumulatedDelta.current = 0;
        lastDirection.current = null;
        return;
      }

      const delta = scrollTop - lastScrollTop.current;
      lastScrollTop.current = scrollTop;

      if (delta === 0) return;

      const direction = delta > 0 ? "down" : "up";

      // If direction changed, reset accumulated delta
      if (direction !== lastDirection.current) {
        accumulatedDelta.current = 0;
        lastDirection.current = direction;
      }

      accumulatedDelta.current += Math.abs(delta);

      if (accumulatedDelta.current >= SCROLL_THRESHOLD) {
        if (direction === "down") {
          setHeaderHidden(true);
        } else {
          setHeaderHidden(false);
        }
      }
    },
    [enabled, setHeaderHidden]
  );

  return { onScroll: enabled ? onScroll : undefined };
}
