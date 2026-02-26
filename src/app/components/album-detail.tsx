import { useState, useEffect, useRef, useCallback } from "react";
import type React from "react";
import { X, ExternalLink, Check, Plus, Play, Bookmark } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, animate } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { MarketValueSection } from "./market-value";
import { purgeTagColor as getPurgeColor, purgeTagTint, purgeButtonBg, purgeButtonText, purgeToast, purgeClearToast } from "./purge-colors";
import { formatDateShort, isToday } from "./last-played-utils";
import { EASE_OUT, EASE_IN, EASE_IN_OUT, DURATION_FAST, DURATION_NORMAL, DURATION_SLOW } from "./motion-tokens";
import { AccordionSection } from "./accordion-section";

/* ─── Condition grade → color spectrum ─── */
/* Maps vinyl grading scale to a pink→blue→green spectrum using the purge palette:
   P/F = pink (poor/fair), G/G+ = pink-blue, VG = blue, VG+ = blue-green, NM/M = green */
function conditionColor(grade: string, isDarkMode: boolean): string | undefined {
  // Extract abbreviation from parentheses BEFORE stripping (handles "NM or M-" etc.)
  const rawParen = grade.match(/\(([^)]+)\)/);
  let key: string;
  if (rawParen) {
    key = rawParen[1].trim().split(/\s/)[0].toUpperCase();
  } else {
    key = grade.trim().toUpperCase().replace(/[\s-]/g, "");
  }
  const spectrum: Record<string, { dark: string; light: string }> = {
    "M":    { dark: "#3E9842", light: "#2D7A31" },
    "MINT": { dark: "#3E9842", light: "#2D7A31" },
    "NM":   { dark: "#3E9842", light: "#2D7A31" },
    "NEARMINT": { dark: "#3E9842", light: "#2D7A31" },
    "VG+":  { dark: "#5FBFA0", light: "#1A7A5A" },
    "VG":   { dark: "#ACDEF2", light: "#00527A" },
    "VERYGOOD+": { dark: "#5FBFA0", light: "#1A7A5A" },
    "VERYGOOD":  { dark: "#ACDEF2", light: "#00527A" },
    "G+":   { dark: "#C9A0E0", light: "#7A3A9A" },
    "GOOD+": { dark: "#C9A0E0", light: "#7A3A9A" },
    "G":    { dark: "#E88CC4", light: "#9A207C" },
    "GOOD": { dark: "#E88CC4", light: "#9A207C" },
    "F":    { dark: "#FF98DA", light: "#9A207C" },
    "FAIR": { dark: "#FF98DA", light: "#9A207C" },
    "P":    { dark: "#FF98DA", light: "#9A207C" },
    "POOR": { dark: "#FF98DA", light: "#9A207C" },
  };
  const entry = spectrum[key];
  if (!entry) return undefined;
  return isDarkMode ? entry.dark : entry.light;
}

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)
   - Ensures no gap on notched iOS devices in PWA mode */

export function AlbumDetailPanel({ hideHeader = false, hideImage = false }: { hideHeader?: boolean; hideImage?: boolean }) {
  const {
    selectedAlbum, setShowAlbumDetail, setSelectedAlbumId, setPurgeTag, discogsToken,
    lastPlayed, markPlayed, isDarkMode,
    // Session picker
    isAlbumInAnySession, mostRecentSessionId,
    // Inline session list
    sessions,
    isInSession, toggleAlbumInSession, createSessionDirect,
  } = useApp();
  const [justPlayed, setJustPlayed] = useState(false);

  // Inline session list state
  const [sessionListExpanded, setSessionListExpanded] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const newSessionInputRef = useRef<HTMLInputElement>(null);
  const autoCheckedRef = useRef<string | null>(null);

  // Reset expanded state when album changes
  useEffect(() => {
    setJustPlayed(false);
    setSessionListExpanded(false);
    setShowNewSession(false);
    setNewSessionName("");
    autoCheckedRef.current = null;
  }, [selectedAlbum?.id]);

  // Auto-check most recent session when expanding if album is in no sessions
  useEffect(() => {
    if (!sessionListExpanded || !selectedAlbum) return;
    if (autoCheckedRef.current === selectedAlbum.id) return;
    autoCheckedRef.current = selectedAlbum.id;

    const inAnySession = sessions.some((s) => s.albumIds.includes(selectedAlbum.id));
    if (!inAnySession && mostRecentSessionId) {
      toggleAlbumInSession(selectedAlbum.id, mostRecentSessionId);
    }
  }, [sessionListExpanded, selectedAlbum?.id]); // minimal deps — runs once per expand

  // Auto-focus new session input
  useEffect(() => {
    if (showNewSession && newSessionInputRef.current) {
      newSessionInputRef.current.focus();
    }
  }, [showNewSession]);

  const handleCreateSession = useCallback(() => {
    const trimmed = newSessionName.trim();
    if (!trimmed || !selectedAlbum) return;
    createSessionDirect(trimmed, [selectedAlbum.id]);
    setNewSessionName("");
    setShowNewSession(false);
  }, [newSessionName, selectedAlbum, createSessionDirect]);

  if (!selectedAlbum) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "var(--c-chip-bg)" }}>
          <span style={{ fontSize: "24px", color: "var(--c-text-faint)" }}>&#9835;</span>
        </div>
        <p className="text-center" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>Select an album to view details</p>
      </div>
    );
  }

  const purgeTagColor: Record<string, string> = {
    keep: getPurgeColor("keep", isDarkMode),
    cut: getPurgeColor("cut", isDarkMode),
    maybe: getPurgeColor("maybe", isDarkMode),
  };

  const albumLastPlayed = lastPlayed[selectedAlbum.id];
  const playedToday = albumLastPlayed ? isToday(albumLastPlayed) : false;

  const handlePlayedToday = () => {
    markPlayed(selectedAlbum.id);
    setJustPlayed(true);
    toast.info(`Played "${selectedAlbum.title}"`, { duration: 1500 });
    setTimeout(() => setJustPlayed(false), 1200);
  };

  const inAnySession = isAlbumInAnySession(selectedAlbum.id);

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderColor: "var(--c-border-strong)", borderBottomWidth: "1px", borderBottomStyle: "solid" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>Album Details</h3>
          <button onClick={() => { setShowAlbumDetail(false); setSelectedAlbumId(null); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)" }}><X size={18} /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!hideImage && (
        <div className="p-4">
          <div className="w-full aspect-square rounded-[12px] overflow-hidden" style={{ border: "1px solid var(--c-border-strong)" }}>
            <img src={selectedAlbum.cover} alt={selectedAlbum.title} className="w-full h-full object-cover" />
          </div>
        </div>
        )}

        <div className="px-4 pb-4">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2 style={{ fontSize: "20px", fontWeight: 600, lineHeight: "1.3", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>{selectedAlbum.title}</h2>
              <p className="mt-0.5" style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-tertiary)" }}>{selectedAlbum.artist}</p>
            </div>
            {selectedAlbum.purgeTag && (
              <span className="flex-shrink-0 px-2.5 py-1 rounded-full capitalize mt-1" style={{
                fontSize: "11px", fontWeight: 500,
                backgroundColor: `${purgeTagColor[selectedAlbum.purgeTag]}15`,
                color: purgeTagColor[selectedAlbum.purgeTag],
              }}>{selectedAlbum.purgeTag}</span>
            )}
          </div>
        </div>

        {/* ═══ Detail rows ═══ */}
        <div className="px-4 pb-4">
          <div className="rounded-[10px] p-3 flex flex-col gap-2.5" style={{ backgroundColor: "var(--c-surface-alt)", border: "1px solid var(--c-border-strong)" }}>
            <DetailRow label="Year" value={String(selectedAlbum.year)} />
            <DetailRow label="Label" value={selectedAlbum.label} />
            <DetailRow label="Catalog #" value={selectedAlbum.catalogNumber} />
            <DetailRow label="Format" value={selectedAlbum.format} />
            <DetailRow label="Folder" value={selectedAlbum.folder} />
            <DetailRow label="Media" value={selectedAlbum.mediaCondition} valueColor={conditionColor(selectedAlbum.mediaCondition, isDarkMode)} />
            <DetailRow label="Sleeve" value={selectedAlbum.sleeveCondition} valueColor={conditionColor(selectedAlbum.sleeveCondition, isDarkMode)} />
            {selectedAlbum.pricePaid && <DetailRow label="Paid" value={selectedAlbum.pricePaid} />}
            {/* Render any user-defined custom fields (e.g. "Acquired From", "Last Cleaned") */}
            {selectedAlbum.customFields?.map((cf, i) => (
              <DetailRow key={`cf-${i}`} label={cf.name} value={cf.value} />
            ))}
          </div>
        </div>

        {selectedAlbum.notes && (
          <div className="px-4 pb-4">
            <p className="uppercase tracking-wider mb-1.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Notes</p>
            <p style={{ fontSize: "14px", fontWeight: 400, lineHeight: "1.6", color: "var(--c-text-secondary)" }}>{selectedAlbum.notes}</p>
          </div>
        )}

        <div className="px-4 pb-4">
          <a href={selectedAlbum.discogsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#0078B4] hover:underline" style={{ fontSize: "14px", fontWeight: 500 }}>
            View on Discogs<ExternalLink size={14} />
          </a>
        </div>

        {/* ═══ Mark as Played button ═══ */}
        <div className="px-4 pb-4">
          <button
            onClick={handlePlayedToday}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-[10px] tappable transition-all relative overflow-hidden"
            style={{
              backgroundColor: (playedToday || justPlayed)
                ? (isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.35)")
                : (isDarkMode ? "rgba(172,222,242,0.08)" : "rgba(172,222,242,0.2)"),
              border: `1px solid ${(playedToday || justPlayed) ? (isDarkMode ? "rgba(172,222,242,0.3)" : "#74889C") : (isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.5)")}`,
              color: isDarkMode ? "#ACDEF2" : "#00527A",
            }}
          >
            <AnimatePresence mode="wait">
              {justPlayed ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: [1.12, 1], opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: DURATION_SLOW, ease: EASE_IN_OUT }}
                  className="flex items-center gap-2"
                >
                  <Check size={18} />
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>Played!</span>
                </motion.div>
              ) : (
                <motion.div
                  key="play"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                  className="flex items-center gap-2"
                >
                  <Play size={16} />
                  <span style={{ fontSize: "14px", fontWeight: 600 }}>Mark as Played</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
          <p className="mt-2 text-center flex items-center justify-center gap-1.5" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            {playedToday ? (
              <>
                <Check size={12} style={{ color: isDarkMode ? "#ACDEF2" : "#00527A" }} />
                <span style={{ color: isDarkMode ? "#ACDEF2" : "#00527A", fontWeight: 500 }}>Played today</span>
              </>
            ) : albumLastPlayed ? (
              <>Last played {formatDateShort(albumLastPlayed)}</>
            ) : (
              <>No plays logged</>
            )}
          </p>
        </div>

        <MarketValueSection album={selectedAlbum} token={discogsToken} />

        {/* ═══ Sessions bookmark ═══ */}
        <AccordionSection
          label={inAnySession ? "Saved" : "Save for Later"}
          icon={
            <Bookmark
              size={16}
              style={{ color: inAnySession ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-secondary)" }}
              {...(inAnySession ? { fill: "currentColor" } : {})}
            />
          }
          isExpanded={sessionListExpanded}
          onToggle={() => setSessionListExpanded((v) => !v)}
        >
          {/* All sessions sorted by recency */}
          {[...sessions]
            .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
            .map((session) => {
              const inSession = isInSession(selectedAlbum.id, session.id);
              return (
                <InlineSessionRow
                  key={session.id}
                  label={session.name}
                  count={session.albumIds.length}
                  checked={inSession}
                  onToggle={() => toggleAlbumInSession(selectedAlbum.id, session.id)}
                  isDarkMode={isDarkMode}
                />
              );
            })}

          {/* New Session row */}
          {!showNewSession ? (
            <button
              onClick={() => setShowNewSession(true)}
              className="w-full flex items-center gap-2 py-2 px-1 tappable rounded-lg transition-colors"
              style={{ color: "var(--c-text-secondary)" }}
            >
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 20, height: 20 }}>
                <Plus size={14} />
              </div>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>New Session</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 py-2 px-1">
              <input
                ref={newSessionInputRef}
                type="text"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSession();
                  if (e.key === "Escape") {
                    setShowNewSession(false);
                    setNewSessionName("");
                  }
                }}
                placeholder="Session name..."
                maxLength={100}
                className="flex-1 min-w-0 rounded-lg px-3 py-1.5 outline-none"
                style={{
                  fontSize: "16px",
                  fontWeight: 400,
                  color: "var(--c-text)",
                  backgroundColor: "var(--c-input-bg)",
                  border: "1px solid var(--c-border)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              />
              <button
                onClick={handleCreateSession}
                disabled={!newSessionName.trim()}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center tappable transition-colors"
                style={{
                  backgroundColor: newSessionName.trim() ? "#EBFD00" : "var(--c-chip-bg)",
                  color: newSessionName.trim() ? "#0C284A" : "var(--c-text-faint)",
                }}
              >
                <Check size={14} />
              </button>
            </div>
          )}
        </AccordionSection>

        {/* ═══ Rate for Purge ═══ */}
        <div className="px-4 pb-6">
          <p
            className="mb-2"
            style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text-secondary)" }}
          >
            Rate for Purge
          </p>

          <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
            {(["keep", "maybe", "cut"] as const).map((tag) => {
              const isActive = selectedAlbum.purgeTag === tag;
              const label = tag.charAt(0).toUpperCase() + tag.slice(1);
              return (
                <button
                  key={tag}
                  className="tappable"
                  onClick={() => {
                    const t = selectedAlbum.purgeTag === tag ? null : tag;
                    setPurgeTag(selectedAlbum.id, t);
                    if (t) purgeToast(t, isDarkMode);
                    else purgeClearToast();
                  }}
                  style={{
                    flex: 1,
                    height: "36px",
                    borderRadius: "10px",
                    border: isActive ? `2px solid ${purgeButtonText(tag, isDarkMode)}` : "none",
                    fontSize: "13px",
                    fontWeight: 600,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    backgroundColor: purgeButtonBg(tag, isDarkMode),
                    color: purgeButtonText(tag, isDarkMode),
                    cursor: "pointer",
                    opacity: isActive ? 1 : 0.55,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex-shrink-0" style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-muted)" }}>{label}</span>
      <span className="text-right" style={{ fontSize: "13px", fontWeight: valueColor ? 500 : 400, color: valueColor || "var(--c-text)" }}>{value}</span>
    </div>
  );
}

function InlineSessionRow({
  label,
  count,
  checked,
  onToggle,
  isDarkMode,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
  isDarkMode: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-2 px-1 tappable rounded-lg transition-colors cursor-pointer"
    >
      {/* Label + count */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className="line-clamp-2"
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--c-text)",
          }}
        >
          {label}
        </span>
        <span
          className="flex-shrink-0"
          style={{
            fontSize: "11px",
            fontWeight: 400,
            color: "var(--c-text-faint)",
          }}
        >
          {count} {count === 1 ? "album" : "albums"}
        </span>
      </div>

      {/* Checkbox */}
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 20,
          height: 20,
          backgroundColor: checked ? "#EBFD00" : "transparent",
          border: checked ? "none" : "2px solid var(--c-border-strong)",
        }}
      >
        {checked && <Check size={12} color="#0C284A" strokeWidth={3} />}
      </div>
    </button>
  );
}

export function AlbumDetailSheet() {
  const { selectedAlbum, setShowAlbumDetail, isDarkMode } = useApp();
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
        setTimeout(() => setShowAlbumDetail(false), 260);
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
  }, [sheetY, backdropOpacity, setShowAlbumDetail]);

  return (
    <div className="lg:hidden">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/30 z-[110]"
        style={{ opacity: backdropOpacity }}
        onClick={() => setShowAlbumDetail(false)}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={dismissed ? undefined : { y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 70 || info.velocity.y > 300) setShowAlbumDetail(false); }}
        className="fixed left-0 right-0 z-[120] rounded-t-[20px] overflow-hidden flex flex-col"
        style={{
          y: sheetY,
          bottom: 0,
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
          maxHeight: "calc(100vh - 58px)",
          backgroundColor: isDarkMode ? "#132B44" : "#FFFFFF",
          boxShadow: isDarkMode ? "0 -8px 32px rgba(0,0,0,0.3)" : "0 -8px 32px rgba(12,40,74,0.1)",
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
        {/* Grab handle — always available for drag-to-dismiss */}
        <div className="flex justify-center py-3 flex-shrink-0 cursor-grab" style={{ touchAction: "none" }}>
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: isDarkMode ? "#2D4A66" : "#D2D8DE" }} />
        </div>
        {/* Scrollable content — image scrolls naturally, pull-down at top dismisses */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)" }}>
          <AlbumDetailPanel hideHeader />
        </div>
      </motion.div>
    </div>
  );
}