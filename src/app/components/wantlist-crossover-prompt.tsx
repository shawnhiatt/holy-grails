import { useState, useCallback } from "react";
import { X, Disc3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_NORMAL, DURATION_FAST } from "./motion-tokens";
import { getContentTokens } from "./theme";


/* Wantlist Crossover Prompt — shows after sync when a wantlist item
   is now in the user's collection. Floats above the bottom tab bar on
   mobile, renders inline on desktop. One item at a time. */

export function WantlistCrossoverPrompt() {
  const {
    collectionCrossoverQueue,
    dismissCrossover,
    removeFromWantList,
    isDarkMode,
  } = useApp();

  const [isRemoving, setIsRemoving] = useState(false);

  const current = collectionCrossoverQueue[0] ?? null;

  const handleRemove = useCallback(async () => {
    if (!current || isRemoving) return;
    setIsRemoving(true);
    try {
      await removeFromWantList(current.release_id);
      toast.info(`"${current.title}" removed.`);
      dismissCrossover(current.release_id);
    } catch (err: any) {
      console.error("[Crossover] Remove failed:", err);
      toast.error("Remove failed. Try again.");
    } finally {
      setIsRemoving(false);
    }
  }, [current, isRemoving, removeFromWantList, dismissCrossover]);

  const handleKeep = useCallback(() => {
    if (!current) return;
    dismissCrossover(current.release_id);
  }, [current, dismissCrossover]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.release_id}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          className="fixed left-[10px] right-[10px] lg:left-auto lg:right-6 lg:bottom-6 lg:w-[360px] rounded-[14px] overflow-hidden"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            zIndex: 125,
            backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
            boxShadow: "var(--c-shadow-modal)",
            border: `1px solid ${isDarkMode ? "#2D4A66" : "#D2D8DE"}`,
            ...getContentTokens(isDarkMode),
          } as React.CSSProperties}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: "1px solid var(--c-border)" }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: isDarkMode ? "#ACDEF2" : "#00527A",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Now in your collection
            </span>
            <button
              onClick={handleKeep}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ color: "var(--c-text-muted)" }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Album row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <img
              src={current.cover}
              alt={current.title}
              className="w-12 h-12 rounded-[6px] object-cover flex-shrink-0"
              style={{ border: "1px solid var(--c-border)" }}
            />
            <div className="flex-1 min-w-0">
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  color: "var(--c-text)",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  WebkitTextOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {current.title}
              </p>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 400,
                  color: "var(--c-text-tertiary)",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  WebkitTextOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {current.artist}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-4 pb-3">
            <button
              onClick={handleKeep}
              className="flex-1 py-2 rounded-[8px] transition-colors"
              style={{
                fontSize: "13px",
                fontWeight: 500,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: "var(--c-text-secondary)",
                backgroundColor: "var(--c-chip-bg)",
              }}
            >
              Keep on Wantlist
            </button>
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] transition-colors bg-[#EBFD00] hover:bg-[#d9e800]"
              style={{
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                color: "#0C284A",
                opacity: isRemoving ? 0.7 : 1,
              }}
            >
              {isRemoving ? (
                <>
                  <Disc3 size={13} className="disc-spinner" />
                  Removing...
                </>
              ) : (
                "Remove from Wantlist"
              )}
            </button>
          </div>

          {/* Queue count indicator */}
          {collectionCrossoverQueue.length > 1 && (
            <div
              className="px-4 pb-2.5 text-center"
              style={{
                fontSize: "11px",
                fontWeight: 400,
                color: "var(--c-text-faint)",
              }}
            >
              {collectionCrossoverQueue.length - 1} more
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
