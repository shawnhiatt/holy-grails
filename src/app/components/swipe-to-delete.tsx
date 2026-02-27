import React, { useCallback, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { EASE_OUT, EASE_IN_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";

const DELETE_ZONE_WIDTH = 80;
const SNAP_OPEN_THRESHOLD = 46; // half of delete zone width

export interface SwipeToDeleteProps {
  onDelete: () => void;
  children: React.ReactNode;
}

export function SwipeToDelete({ onDelete, children }: SwipeToDeleteProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Drag tracking via refs — avoids React re-renders on every pointermove
  const isDraggingRef = useRef(false);
  const hasDragged = useRef(false);
  const pointerStartX = useRef(0);
  const offsetAtPointerDown = useRef(0);
  const currentOffset = useRef(0);

  // Imperatively set content transform — avoids React re-renders on every drag frame
  const applyContentTransform = useCallback((x: number, transition?: string) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = transition ?? "none";
    el.style.transform = `translateX(${x}px)`;
    currentOffset.current = x;
  }, []);

  const triggerDelete = useCallback(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;

    if (!wrapper) {
      setIsDeleted(true);
      onDelete();
      return;
    }

    const easing = `cubic-bezier(${EASE_IN_OUT.join(",")})`;
    const dur = `${Math.round(DURATION_NORMAL * 1000)}ms`;

    // Slide content off-screen left
    if (content) {
      content.style.transition = `transform ${dur} ${easing}`;
      content.style.transform = `translateX(-${window.innerWidth}px)`;
    }

    // Collapse wrapper: capture current height, then animate max-height + opacity to 0
    const height = wrapper.offsetHeight;
    wrapper.style.maxHeight = `${height}px`;
    wrapper.style.overflow = "hidden";
    // Force reflow so the browser registers the explicit max-height before animating
    void wrapper.offsetHeight;
    wrapper.style.transition = `max-height ${dur} ${easing}, opacity ${dur} ${easing}`;
    wrapper.style.maxHeight = "0";
    wrapper.style.opacity = "0";

    setTimeout(() => {
      setIsDeleted(true);
      onDelete();
    }, DURATION_NORMAL * 1000 + 50);
  }, [onDelete]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    hasDragged.current = false;
    pointerStartX.current = e.clientX;
    offsetAtPointerDown.current = currentOffset.current;
    setIsDragging(true);
    // Disable transition during active drag
    if (contentRef.current) {
      contentRef.current.style.transition = "none";
    }
    // Capture pointer so events keep firing if finger leaves the element
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - pointerStartX.current;
    if (Math.abs(delta) > 5) hasDragged.current = true;
    // Only allow dragging left (clamp offset to <= 0)
    const newOffset = Math.min(0, offsetAtPointerDown.current + delta);
    applyContentTransform(newOffset);
  }, [applyContentTransform]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const x = currentOffset.current;
    const absX = Math.abs(x);
    const elementWidth = wrapperRef.current?.offsetWidth ?? 300;

    if (absX > elementWidth * 0.3) {
      // Swiped past 30% of element width — trigger delete
      triggerDelete();
    } else if (absX > SNAP_OPEN_THRESHOLD) {
      // Swiped past half delete zone — snap open to reveal
      applyContentTransform(
        -DELETE_ZONE_WIDTH,
        `transform ${Math.round(DURATION_NORMAL * 1000)}ms cubic-bezier(${EASE_IN_OUT.join(",")})`
      );
    } else {
      // Snap back to closed
      applyContentTransform(
        0,
        `transform ${Math.round(DURATION_FAST * 1000)}ms cubic-bezier(${EASE_OUT.join(",")})`
      );
    }
  }, [triggerDelete, applyContentTransform]);

  const handlePointerCancel = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    applyContentTransform(
      0,
      `transform ${Math.round(DURATION_FAST * 1000)}ms cubic-bezier(${EASE_OUT.join(",")})`
    );
  }, [applyContentTransform]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        triggerDelete();
      }
    },
    [triggerDelete]
  );

  if (isDeleted) return null;

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", overflow: "hidden", borderRadius: "12px" }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Delete zone — z-index 1, sits behind the card, full width */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          backgroundColor: "#FF33B6",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 28,
          cursor: "pointer",
        }}
        onClick={triggerDelete}
      >
        <Trash2 size={20} color="white" />
      </div>

      {/* Card content — z-index 2, draggable layer on top */}
      <div
        ref={contentRef}
        style={{
          position: "relative",
          zIndex: 2,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "pan-y",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={(e) => {
          // Suppress click on children (e.g. session button) if user was swiping
          if (hasDragged.current) {
            e.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
