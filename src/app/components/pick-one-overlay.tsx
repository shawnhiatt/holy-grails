import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { X, Shuffle } from "./icons";
import type { Album } from "./discogs-api";
import { ShuffleAlbumCard } from "./shuffle-album-card";
import { DURATION_NORMAL, EASE_OUT } from "./motion-tokens";
import { pushDialog, popDialog, isTopDialog } from "../lib/dialog-stack";

/**
 * "Pick one" — the Shuffle section's single-release reveal.
 *
 * Replaced a one-vs-grid view toggle that only changed how many cards the grid
 * drew. Pulling one release up as its own moment is the decision the app is
 * actually for ("what do I put on"), and it makes the button do something
 * rather than reformat something.
 *
 * Rendered in-tree from the feed rather than portaled to document.body, so the
 * content tokens on <main> still resolve — the card's dominant-color treatment
 * falls back to var(--c-*), which a portal would strand (see the lightbox in
 * album-detail.tsx, which portals and therefore hardcodes its colors).
 *
 * Centered at both breakpoints on purpose: this is a reveal, not a browsing
 * surface, so it does not want the bottom-sheet treatment.
 */
export function PickOneOverlay({
  album,
  pickKey,
  playCount,
  onAgain,
  onClose,
  onOpenDetail,
  onMarkPlayed,
}: {
  album: Album;
  /** Bumped on each re-pick so the card remounts and replays its entrance */
  pickKey: number;
  playCount: number;
  onAgain: () => void;
  onClose: () => void;
  onOpenDetail: (albumId: string) => void;
  onMarkPlayed: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape closes, but only while this is the topmost overlay — the album
  // detail sheet can open over it from a card tap.
  useEffect(() => {
    const token = pushDialog();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopDialog(token)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      popDialog(token);
    };
  }, [onClose]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  const buttonBase = {
    height: "40px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: 600,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    touchAction: "manipulation" as const,
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 z-[92]"
        style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="fixed inset-0 z-[93] flex items-center justify-center pointer-events-none"
        style={{ padding: "24px" }}
      >
        <motion.div
          ref={cardRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Random pick from your collection"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          className="pointer-events-auto flex flex-col focus:outline-none"
          style={{ width: "min(340px, 100%)" }}
        >
          {/* Close — the card names itself, so no eyebrow above it */}
          <div className="flex items-center justify-end mb-[10px]">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer tappable"
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(6px)",
                touchAction: "manipulation",
              }}
              aria-label="Close"
            >
              <X size={16} color="#FFFFFF" />
            </button>
          </div>

          {/* The release — remounts on each re-pick so the entrance replays */}
          <motion.div
            key={pickKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          >
            <ShuffleAlbumCard
              album={album}
              onTap={onOpenDetail}
              dominantColor
              playCount={playCount}
            />
          </motion.div>

          {/* Actions — the shuffle circle re-picks; yellow carries the primary
              action of this context, which here is logging the play */}
          <div className="flex gap-2 mt-[12px]">
            <button
              onClick={onAgain}
              className="flex items-center justify-center cursor-pointer tappable flex-shrink-0"
              style={{
                ...buttonBase,
                width: "40px",
                backgroundColor: "var(--c-surface)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text)",
              }}
              title="Pick another"
              aria-label="Pick another release"
            >
              <Shuffle size={16} weight="bold" />
            </button>
            <button
              onClick={onMarkPlayed}
              className="flex-1 flex items-center justify-center cursor-pointer tappable"
              style={{
                ...buttonBase,
                backgroundColor: "#EBFD00",
                color: "#16181C",
                border: "none",
              }}
            >
              Mark as Played
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
