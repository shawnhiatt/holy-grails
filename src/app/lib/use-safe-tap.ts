import type { MouseEventHandler, TouchEventHandler } from "react";
import { isScrollingRecently } from "./scroll-state";

const SLOP_PX = 10;

// Module-level touch state — only one touch can be in progress at any time
// on a mobile device, so a single shared state is safe and lets this helper
// be called inside .map() loops without violating the Rules of Hooks.
let activeTouch: { startX: number; startY: number; moved: boolean } | null = null;

export function useSafeTap(handler: () => void): {
  onTouchStart: TouchEventHandler;
  onTouchMove: TouchEventHandler;
  onTouchEnd: TouchEventHandler;
  onClick: MouseEventHandler;
} {
  return {
    onTouchStart: (e) => {
      const t = e.touches[0];
      activeTouch = { startX: t.clientX, startY: t.clientY, moved: false };
    },
    onTouchMove: (e) => {
      if (!activeTouch) return;
      const t = e.touches[0];
      if (
        Math.abs(t.clientX - activeTouch.startX) > SLOP_PX ||
        Math.abs(t.clientY - activeTouch.startY) > SLOP_PX
      ) {
        activeTouch.moved = true;
      }
    },
    onTouchEnd: (e) => {
      const state = activeTouch;
      activeTouch = null;
      if (!state || state.moved) return;
      if (isScrollingRecently()) return;
      e.preventDefault();
      handler();
    },
    onClick: () => {
      if (isScrollingRecently()) return;
      handler();
    },
  };
}
