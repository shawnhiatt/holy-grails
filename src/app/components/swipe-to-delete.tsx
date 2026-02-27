import React, { useCallback, useEffect, useState } from "react";
import { motion, useAnimation } from "motion/react";
import { Trash2 } from "lucide-react";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";

const SWIPE_THRESHOLD = 60;
const DELETE_ZONE_WIDTH = 80;

export interface SwipeToDeleteProps {
  onDelete: () => void;
  children: React.ReactNode;
}

export function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches
  );
  const [deleted, setDeleted] = useState(false);
  const controls = useAnimation();

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const triggerDelete = useCallback(async () => {
    await controls.start({
      x: -window.innerWidth,
      opacity: 0,
      transition: { duration: DURATION_NORMAL, ease: EASE_OUT },
    });
    setDeleted(true);
    onDelete();
  }, [controls, onDelete]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      if (info.offset.x < -SWIPE_THRESHOLD) {
        triggerDelete();
      } else {
        controls.start({
          x: 0,
          transition: { duration: DURATION_FAST, ease: EASE_OUT },
        });
      }
    },
    [controls, triggerDelete]
  );

  // Desktop: render children as-is — no swipe behavior
  if (isDesktop) return <>{children}</>;

  if (deleted) return null;

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: "12px" }}>
      {/* Delete zone — revealed as item slides left */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
        style={{ width: DELETE_ZONE_WIDTH, backgroundColor: "#FF33B6" }}
        onClick={triggerDelete}
      >
        <Trash2 size={20} color="white" />
      </div>

      {/* Swipeable item layer */}
      <motion.div
        animate={controls}
        drag="x"
        dragConstraints={{ left: -DELETE_ZONE_WIDTH, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
      >
        {children}
      </motion.div>
    </div>
  );
}
