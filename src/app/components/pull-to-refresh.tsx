import { useEffect, useRef, useState, type RefObject } from "react";
import { Disc3 } from "lucide-react";

/**
 * Pull-to-refresh gesture hook for vertical scroll containers.
 *
 * Attach to a scrollable element's ref. When the user pulls down while already
 * at the top (scrollTop === 0), it tracks the drag with resistance and, past a
 * threshold, calls `onRefresh` (awaited) while showing a Disc3 indicator that
 * spins until the refresh resolves. Only transform/opacity are animated.
 *
 * Render the returned `indicator` as the first child of the scroll container
 * (give the container `position: relative`). Used by Collection and Wantlist —
 * use this for any future pull-to-refresh on a scroll view.
 */

const THRESHOLD = 64; // pull distance (px) required to trigger a refresh
const MAX = 96; // max visual pull distance
const RESISTANCE = 0.5; // drag-to-pixel ratio for rubber-band feel

export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void> | void,
) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPullBoth = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return;
      if (el.scrollTop > 0) {
        activeRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!activeRef.current || refreshingRef.current) return;
      // If the user has scrolled away from the top, abandon the pull.
      if (el.scrollTop > 0) {
        activeRef.current = false;
        if (pullRef.current !== 0) setPullBoth(0);
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        if (pullRef.current !== 0) setPullBoth(0);
        return;
      }
      const dist = Math.min(MAX, dy * RESISTANCE);
      setPullBoth(dist);
      // Suppress native overscroll only once a real pull is underway, so card
      // taps and normal scrolls are never swallowed.
      if (dist > 4 && e.cancelable) e.preventDefault();
    };

    const finish = async () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      if (pullRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullBoth(THRESHOLD);
        try {
          await onRefreshRef.current();
        } catch {
          /* errors surface via the caller's own toasts */
        }
        refreshingRef.current = false;
        setRefreshing(false);
        setPullBoth(0);
      } else {
        setPullBoth(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", finish);
    el.addEventListener("touchcancel", finish);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [scrollRef]);

  const indicator = pull > 0 || refreshing ? (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        transform: `translateY(${Math.max(0, pull) - 28}px)`,
        opacity: refreshing ? 1 : Math.min(1, pull / THRESHOLD),
        transition: refreshing ? "transform 150ms ease" : undefined,
        zIndex: 5,
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 32,
          height: 32,
          backgroundColor: "var(--c-surface)",
          border: "1px solid var(--c-border-strong)",
          boxShadow: "var(--c-shadow-sm)",
        }}
      >
        <Disc3
          size={18}
          className={refreshing ? "disc-spinner" : ""}
          style={{
            color: "var(--c-text-muted)",
            transform: refreshing ? undefined : `rotate(${pull * 4}deg)`,
          }}
        />
      </div>
    </div>
  ) : null;

  return { indicator, refreshing, pull };
}
