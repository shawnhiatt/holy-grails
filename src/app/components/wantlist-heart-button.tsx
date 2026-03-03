import { useState, useCallback } from "react";
import type React from "react";
import { Heart, Disc3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { SlideOutPanel } from "./slide-out-panel";
import { EASE_IN_OUT, DURATION_NORMAL } from "./motion-tokens";
import { toastTitle } from "../utils/format";

const truncStyle: React.CSSProperties = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  WebkitTextOverflow: "ellipsis" as string,
  maxWidth: "100%",
};

export interface WantlistHeartButtonProps {
  releaseId: number;
  title: string;
  artist: string;
  cover: string;
  thumb?: string;
  year?: number;
  label?: string;
  /** Icon size in px. Default: 18 */
  size?: number;
  /** Render style — "inline" for activity rows, "overlay" for card overlays. Default: "inline" */
  variant?: "inline" | "overlay";
}

export function WantlistHeartButton({
  releaseId,
  title,
  artist,
  cover,
  thumb,
  year = 0,
  label = "",
  size = 18,
  variant = "inline",
}: WantlistHeartButtonProps) {
  const { isInWants, isInCollection, addToWantList, removeFromWantList } = useApp();

  const inCollection = isInCollection(releaseId);
  const inWantlist = isInWants(releaseId);
  const [inFlight, setInFlight] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (inCollection || inFlight) return;
    if (inWantlist) {
      setShowRemoveConfirm(true);
    } else {
      setShowAddConfirm(true);
    }
  }, [inCollection, inFlight, inWantlist]);

  const handleAdd = useCallback(async () => {
    setIsProcessing(true);
    try {
      await addToWantList({
        id: `w-heart-${releaseId}-${Date.now()}`,
        release_id: releaseId,
        title,
        artist,
        year,
        thumb: thumb || cover,
        cover,
        label,
        priority: false,
      });
      toast.dismiss();
      toast.info(`"${toastTitle(title)}" added to Wantlist.`, { duration: 2500 });
      setShowAddConfirm(false);
    } catch (err: any) {
      console.error("[WantlistHeart] Add failed:", err);
      toast.error("Failed to add. Try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [releaseId, title, artist, year, thumb, cover, label, addToWantList]);

  const handleRemove = useCallback(async () => {
    setIsProcessing(true);
    try {
      await removeFromWantList(releaseId);
      toast.dismiss();
      toast.info(`"${toastTitle(title)}" removed.`, { duration: 2500 });
      setShowRemoveConfirm(false);
    } catch (err: any) {
      console.error("[WantlistHeart] Remove failed:", err);
      toast.error("Remove failed. Try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [releaseId, title, removeFromWantList]);

  // Don't render for items already in collection
  if (inCollection) return null;

  const overlayStyle: React.CSSProperties = variant === "overlay"
    ? {
        position: "absolute",
        top: "8px",
        right: "8px",
        zIndex: 2,
        backgroundColor: "rgba(0,0,0,0.45)",
        borderRadius: "50%",
        width: `${size + 12}px`,
        height: `${size + 12}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }
    : { padding: "4px", background: "none", border: "none" };

  return (
    <>
      <button
        onClick={handleTap}
        disabled={inFlight}
        className="flex-shrink-0 cursor-pointer tappable"
        style={overlayStyle}
      >
        {inFlight ? (
          <Disc3 size={size} className="disc-spinner" style={{ color: "var(--c-text-faint)" }} />
        ) : (
          <motion.div
            key={inWantlist ? "filled" : "outline"}
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_IN_OUT }}
          >
            <Heart
              size={size}
              fill={inWantlist ? "#EBFD00" : "none"}
              color={inWantlist ? "#EBFD00" : variant === "overlay" ? "rgba(255,255,255,0.85)" : "var(--c-text-faint)"}
              strokeWidth={inWantlist ? 0 : 1.5}
            />
          </motion.div>
        )}
      </button>

      {/* Add confirmation */}
      <AnimatePresence>
        {showAddConfirm && (
          <SlideOutPanel
            onClose={() => { setShowAddConfirm(false); setIsProcessing(false); }}
            backdropZIndex={110}
            sheetZIndex={120}
          >
            <div className="flex flex-col items-center px-6 pt-2 pb-4 gap-4">
              <img
                src={thumb || cover}
                alt={title}
                className="w-[80px] h-[80px] rounded-[8px] object-cover"
              />
              <div className="text-center" style={{ minWidth: 0, maxWidth: "100%" }}>
                <p style={{
                  fontSize: "16px", fontWeight: 600, color: "var(--c-text)",
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  lineHeight: 1.3, ...truncStyle,
                } as React.CSSProperties}>
                  {title}
                </p>
                <p className="mt-0.5" style={{
                  fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)",
                  fontFamily: "'DM Sans', system-ui, sans-serif", ...truncStyle,
                } as React.CSSProperties}>
                  {artist}
                </p>
              </div>
              <p style={{
                fontSize: "15px", fontWeight: 500, color: "var(--c-text)",
                fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center",
              }}>
                Add to your Wantlist?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setShowAddConfirm(false); setIsProcessing(false); }}
                  className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] cursor-pointer transition-colors"
                  style={{
                    fontSize: "14px", fontWeight: 600,
                    backgroundColor: "#EBFD00", color: "#0C284A",
                    opacity: isProcessing ? 0.7 : 1,
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Disc3 size={14} className="disc-spinner" />
                      Adding...
                    </>
                  ) : "Add to Wantlist"}
                </button>
              </div>
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>

      {/* Remove confirmation */}
      <AnimatePresence>
        {showRemoveConfirm && (
          <SlideOutPanel
            onClose={() => { setShowRemoveConfirm(false); setIsProcessing(false); }}
            backdropZIndex={110}
            sheetZIndex={120}
          >
            <div className="flex flex-col items-center px-6 pt-2 pb-4 gap-4">
              <img
                src={thumb || cover}
                alt={title}
                className="w-[80px] h-[80px] rounded-[8px] object-cover"
              />
              <div className="text-center" style={{ minWidth: 0, maxWidth: "100%" }}>
                <p style={{
                  fontSize: "16px", fontWeight: 600, color: "var(--c-text)",
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  lineHeight: 1.3, ...truncStyle,
                } as React.CSSProperties}>
                  {title}
                </p>
                <p className="mt-0.5" style={{
                  fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)",
                  fontFamily: "'DM Sans', system-ui, sans-serif", ...truncStyle,
                } as React.CSSProperties}>
                  {artist}
                </p>
              </div>
              <p style={{
                fontSize: "15px", fontWeight: 500, color: "var(--c-text)",
                fontFamily: "'DM Sans', system-ui, sans-serif", textAlign: "center",
              }}>
                Remove from your Wantlist?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setShowRemoveConfirm(false); setIsProcessing(false); }}
                  className="flex-1 py-2.5 rounded-[10px] transition-colors cursor-pointer"
                  style={{ fontSize: "14px", fontWeight: 500, backgroundColor: "var(--c-chip-bg)", color: "var(--c-text)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemove}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[10px] cursor-pointer transition-colors"
                  style={{
                    fontSize: "14px", fontWeight: 600,
                    backgroundColor: "#FF33B6", color: "#FFFFFF",
                    opacity: isProcessing ? 0.7 : 1,
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Disc3 size={14} className="disc-spinner" />
                      Removing...
                    </>
                  ) : "Remove"}
                </button>
              </div>
            </div>
          </SlideOutPanel>
        )}
      </AnimatePresence>
    </>
  );
}
