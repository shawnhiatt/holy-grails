import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Search, Grid2x2, Grid3x3, List, Zap, X } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useApp, type ViewMode } from "./app-context";
import { ViewModeToggle } from "./crate-browser";
import type { WantItem } from "./discogs-api";
import { EASE_OUT, EASE_IN, DURATION_FAST, DURATION_NORMAL, DURATION_SLOW } from "./motion-tokens";
import { NoDiscogsCard } from "./no-discogs-card";
import { useHaptic } from "@/hooks/useHaptic";
import { useSafeTap } from "../lib/use-safe-tap";

import { AlbumArtwork } from "./album-artwork-grid";

/* ─── Alphabet Index Sidebar (mobile only, wantlist) ─── */

interface LetterEntry {
  letter: string;
  firstIndex: number;
}

function useWantAlphabetIndex(items: WantItem[]) {
  return useMemo(() => {
    // Wantlist is always sorted artist A→Z, so always show the index
    const map = new Map<string, number>();

    for (let i = 0; i < items.length; i++) {
      const raw = items[i].artist || "";
      const ch = raw.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(ch) ? ch : "#";
      if (!map.has(letter)) map.set(letter, i);
    }

    const entries: LetterEntry[] = [];
    if (map.has("#")) entries.push({ letter: "#", firstIndex: map.get("#")! });
    for (let c = 65; c <= 90; c++) {
      const l = String.fromCharCode(c);
      if (map.has(l)) entries.push({ letter: l, firstIndex: map.get(l)! });
    }

    return entries;
  }, [items]);
}

interface WantAlphabetSidebarProps {
  entries: LetterEntry[];
  anchorRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function WantAlphabetSidebar({ entries, anchorRefs, scrollRef }: WantAlphabetSidebarProps) {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
  }, []);

  const scrollToLetter = useCallback((entry: LetterEntry, smooth = false) => {
    const el = anchorRefs.current[entry.firstIndex];
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const elTop = el.offsetTop - container.offsetTop;
      container.scrollTo({ top: elTop - 8, behavior: smooth ? "smooth" : "auto" });
    }
  }, [anchorRefs, scrollRef]);

  const getEntryFromY = useCallback((clientY: number): LetterEntry | null => {
    const strip = stripRef.current;
    if (!strip) return null;
    const rect = strip.getBoundingClientRect();
    const y = clientY - rect.top;
    const idx = Math.min(
      entries.length - 1,
      Math.max(0, Math.floor((y / rect.height) * entries.length))
    );
    return entries[idx] || null;
  }, [entries]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    const touch = e.touches[0];
    const entry = getEntryFromY(touch.clientY);
    if (entry) {
      setActiveLetter(entry.letter);
      scrollToLetter(entry, true);
    }
  }, [getEntryFromY, scrollToLetter]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const entry = getEntryFromY(touch.clientY);
    if (entry) {
      setActiveLetter(entry.letter);
      scrollToLetter(entry);
    }
  }, [getEntryFromY, scrollToLetter]);

  const handleTouchEnd = useCallback(() => {
    fadeTimer.current = setTimeout(() => {
      setActiveLetter(null);
    }, 600);
  }, []);

  const handleLetterTap = useCallback((entry: LetterEntry) => {
    setActiveLetter(entry.letter);
    scrollToLetter(entry, true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setActiveLetter(null), 600);
  }, [scrollToLetter]);

  return (
    <>
      {/* Letter strip */}
      <div
        ref={stripRef}
        className="fixed z-40 lg:hidden flex flex-col items-center justify-center"
        style={{
          right: "calc(4px + env(safe-area-inset-right, 0px))",
          top: 140,
          bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {entries.map((entry) => (
          <div
            key={entry.letter}
            onClick={() => handleLetterTap(entry)}
            className="flex items-center justify-center cursor-pointer"
            style={{
              height: 18,
              width: 18,
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              color: activeLetter === entry.letter ? "#EBFD00" : "var(--c-text-tertiary)",
              transition: "color 100ms var(--ease-out)",
            }}
          >
            {entry.letter}
          </div>
        ))}
      </div>
    </>
  );
}

type WantRenderItem =
  | { kind: "divider"; label: string; firstIndex: number; isFirst: boolean }
  | { kind: "item"; want: WantItem; itemIndex: number };

function getWantGroupLabel(item: WantItem): string {
  const ch = (item.artist || "").charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

export function Wantlist() {
  const { wants, toggleWantPriority, wantFilter, setWantFilter, wantSearchQuery, setWantSearchQuery, isDarkMode, setScreen, isAuthenticated, wantViewMode: viewMode, setWantViewMode: setViewMode, setSelectedWantItem, setShowAlbumDetail } = useApp();
  const triggerHaptic = useHaptic('medium');

  const wantGridModes = useMemo(() => [
    { id: viewMode === "grid3" ? "grid3" as ViewMode : "grid" as ViewMode, icon: viewMode === "grid3" ? Grid3x3 : Grid2x2, label: viewMode === "grid3" ? "Compact Grid" : "Grid" },
    { id: "list" as ViewMode, icon: List, label: "List" },
  ], [viewMode]);

  const handleSetViewMode = useCallback((v: ViewMode) => {
    if (v === "grid" || v === "grid3") {
      setViewMode(viewMode === "grid3" ? "grid" : "grid3");
    } else {
      setViewMode(v);
    }
  }, [viewMode, setViewMode]);

  const handleSelectWant = useCallback((item: WantItem) => {
    triggerHaptic();
    setSelectedWantItem(item);
    setShowAlbumDetail(true);
  }, [triggerHaptic, setSelectedWantItem, setShowAlbumDetail]);

  const filteredWants = useMemo(() => {
    let result = [...wants];
    if (wantFilter === "priority") result = result.filter((w) => w.priority);
    if (wantSearchQuery.trim()) {
      const q = wantSearchQuery.toLowerCase();
      result = result.filter((w) => w.artist.toLowerCase().includes(q) || w.title.toLowerCase().includes(q));
    }
    // Sort by artist A→Z (matches Collection default sort)
    result.sort((a, b) => a.artist.localeCompare(b.artist));
    return result;
  }, [wants, wantFilter, wantSearchQuery]);

  const handleTogglePriority = useCallback((id: string) => {
    const item = wants.find((w) => w.id === id);
    if (item) {
      toggleWantPriority(id);
      toast.info(item.priority ? `"${item.title}" priority removed.` : `"${item.title}" prioritized.`, { duration: 1500 });
    }
  }, [wants, toggleWantPriority]);

  return (
    <div className="flex flex-col h-full">
      {/* ===== DESKTOP search/filter/view controls (gray content area) ===== */}
      <div className="hidden lg:flex items-center gap-[16px] px-[24px] pt-[8px] pb-[16px] flex-shrink-0">
        {/* Search field — flex-1 */}
        <div className="flex-1 flex items-center gap-2 rounded-full px-[15px] min-w-0" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "39px" }}>
          <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
          <input type="text" placeholder="Search wants..." value={wantSearchQuery} onChange={(e) => setWantSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none border-none min-w-0"
            style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }} />
          {wantSearchQuery && <button onClick={() => setWantSearchQuery("")} className="transition-colors" style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>×</button>}
        </div>
        {/* Filter chips — flex-1 */}
        <div className="flex-1 flex items-center gap-[16px] min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setWantFilter("all")}
              className={`px-3 py-1.5 rounded-full transition-all`}
              style={wantFilter === "all"
                ? { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
                : { fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-secondary)" }}>
              All ({wants.length})
            </button>
            <button onClick={() => setWantFilter("priority")}
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${wantFilter === "priority" ? "bg-[#EBFD00] text-[#0C284A]" : ""}`}
              style={wantFilter !== "priority" ? { fontSize: "13px", fontWeight: 500, backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-secondary)" } : { fontSize: "13px", fontWeight: 500 }}>
              <Zap size={12} fill={wantFilter === "priority" ? "currentColor" : "none"} />
              Priorities ({wants.filter((w) => w.priority).length})
            </button>
          </div>
        </div>
        {/* View toggle — right-aligned */}
        <div className="flex items-center justify-end">
          <ViewModeToggle viewMode={viewMode} setViewMode={handleSetViewMode} modes={wantGridModes} />
        </div>
      </div>

      {/* ===== MOBILE search/filter/view controls ===== */}
      <div className="lg:hidden flex-shrink-0 px-[16px] pt-[2px] pb-[8px]">
        <div className="flex items-center gap-[10px]">
          <div className="flex items-center gap-[8px] rounded-full px-[14.5px] min-w-0 flex-1" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "34px" }}>
            <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
            <input type="text" placeholder="Search..." value={wantSearchQuery} onChange={(e) => setWantSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none border-none min-w-0"
              style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }} />
            {wantSearchQuery && <button onClick={() => setWantSearchQuery("")} style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>×</button>}
          </div>
          <ViewModeToggle viewMode={viewMode} setViewMode={handleSetViewMode} modes={wantGridModes} compact />
          <button onClick={() => setWantFilter(wantFilter === "all" ? "priority" : "all")}
            className={`w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors shrink-0 ${wantFilter === "priority" ? "bg-[#EBFD00] text-[#0C284A]" : ""}`}
            style={wantFilter !== "priority" ? { backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" } : undefined}
            title={wantFilter === "priority" ? "Show all" : "Priorities"}
          >
            <Zap size={16} fill={wantFilter === "priority" ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Content */}
      {wants.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="No wants found."
          subtext="Connect your Discogs account to sync your wantlist."
        />
      ) : filteredWants.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>No albums found</p>
            <p className="mt-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)", lineHeight: 1.6 }}>
              {wants.length === 0
                ? "Your wantlist is empty. Either you have everything you need, or you haven't been to a record fair lately."
                : wantFilter === "priority"
                ? "No priority wants marked. Tap the heart on any record to flag it."
                : "No items found"}
            </p>
            {wants.length === 0 && (
              <button
                onClick={() => setScreen("settings")}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full transition-colors"
                style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif", backgroundColor: isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.4)", color: isDarkMode ? "#ACDEF2" : "#00527A" }}
              >
                Sync your Discogs account →
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {viewMode === "crate" && <WantCrateView key={`crate|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} onSelect={handleSelectWant} />}
          {viewMode === "list" && <WantlistView key={`list|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} onSelect={handleSelectWant} />}
          {viewMode === "grid" && <WantGridView key={`grid|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} onSelect={handleSelectWant} />}
          {viewMode === "grid3" && <WantGridView key={`grid3|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} onSelect={handleSelectWant} compact />}
          {viewMode === "artwork" && <WantArtworkView key={`artwork|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} onSelect={handleSelectWant} />}
        </>
      )}
    </div>
  );
}

function WantCrateView({ wants, togglePriority, onSelect }: { wants: WantItem[]; togglePriority: (id: string) => void; onSelect: (item: WantItem) => void }) {
  const { hideGalleryMeta } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const dragY = useMotionValue(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchState = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const suppressNextClick = useRef(false);
  const [lightboxActive, setLightboxActive] = useState(false);

  // Reset index when wants change
  useEffect(() => {
    setCurrentIndex(0);
  }, [wants]);

  // Clamp index to valid range
  const safeIndex = Math.min(currentIndex, Math.max(0, wants.length - 1));

  // Idle timer: auto-dismiss lightbox after 3s of inactivity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => { setLightboxActive(false); }, 3000);
  }, []);

  useEffect(() => {
    if (!lightboxActive && idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (lightboxActive) resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [lightboxActive, resetIdleTimer]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, wants.length - 1));
  }, [wants.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const threshold = 60;
      let didSwipe = false;
      if (info.offset.y < -threshold) {
        goNext();
        didSwipe = true;
      } else if (info.offset.y > threshold) {
        goPrev();
        didSwipe = true;
      }
      if (didSwipe) {
        if (!lightboxActive) setLightboxActive(true);
        resetIdleTimer();
      }
    },
    [goNext, goPrev, lightboxActive, resetIdleTimer]
  );

  if (wants.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-[24px]">
        <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>No items to flip through</p>
      </div>
    );
  }

  const currentItem = wants[safeIndex];

  // Stack: show current + up to 2 behind
  const stackIndices: number[] = [];
  for (let i = 0; i < Math.min(3, wants.length - safeIndex); i++) {
    stackIndices.push(safeIndex + i);
  }

  const baseOpacity = lightboxActive ? 0.08 : 0.15;

  return (
    <div className="flex-1 flex flex-col items-center overflow-hidden relative">
      {/* Lightbox overlay */}
      <AnimatePresence>
        {lightboxActive && (
          <motion.div
            className="fixed inset-x-0 top-0 bottom-[72px] lg:bottom-0 z-[100] cursor-pointer"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: DURATION_SLOW, ease: EASE_IN } }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
            onClick={(e) => { if (e.target === e.currentTarget) setLightboxActive(false); }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxActive(false); }}
              className="absolute right-5 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-white/25 transition-all z-10"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card stack area */}
      <div className="relative w-full flex-1 flex items-center justify-center px-[16px] lg:px-[24px]">
        <motion.div
          className="relative w-full max-w-[calc(100vw-32px)] lg:max-w-[620px]"
          style={{ aspectRatio: "1 / 1", zIndex: lightboxActive ? 101 : "auto" }}
          animate={{ scale: lightboxActive ? 1.05 : 1 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        >
          <AnimatePresence mode="popLayout">
            {stackIndices.reverse().map((idx, stackPos) => {
              const reversePos = stackIndices.length - 1 - stackPos;
              const item = wants[idx];
              const isCurrent = idx === safeIndex;
              const offsetY = reversePos * 8;
              const scale = 1 - reversePos * 0.04;

              return (
                <motion.div
                  key={item.id}
                  className="absolute inset-0 rounded-[14px] overflow-hidden cursor-pointer"
                  style={{
                    boxShadow: isCurrent
                      ? "0 8px 32px rgba(0,0,0,0.25)"
                      : "0 4px 16px rgba(0,0,0,0.15)",
                    zIndex: 10 - reversePos,
                    y: isCurrent ? dragY : offsetY,
                    scale: isCurrent ? 1 : scale,
                    pointerEvents: isCurrent ? "auto" : "none",
                    opacity: isCurrent ? 1 : Math.max(baseOpacity, 1 - reversePos * (1 - baseOpacity) / 1.5),
                  }}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: isCurrent ? 1 : scale, opacity: 1, y: isCurrent ? 0 : offsetY }}
                  exit={{ scale: 0.92, opacity: 0, y: -100 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
                  {...(isCurrent
                    ? {
                        drag: "y",
                        dragConstraints: { top: 0, bottom: 0 },
                        dragElastic: 0.4,
                        onDragEnd: handleDragEnd,
                      }
                    : {})}
                  onTouchStart={(e) => { const t = e.touches[0]; touchState.current = { startX: t.clientX, startY: t.clientY, moved: false }; suppressNextClick.current = false; }}
                  onTouchMove={(e) => { if (!touchState.current) return; const t = e.touches[0]; if (Math.abs(t.clientX - touchState.current.startX) > 6 || Math.abs(t.clientY - touchState.current.startY) > 6) touchState.current.moved = true; }}
                  onTouchEnd={() => { if (isCurrent && touchState.current && !touchState.current.moved) { suppressNextClick.current = true; onSelect(item); } touchState.current = null; }}
                  onClick={() => { if (suppressNextClick.current) { suppressNextClick.current = false; return; } if (isCurrent) onSelect(item); }}
                >
                  {/* Cover art */}
                  <img
                    src={item.cover}
                    alt={`${item.artist} - ${item.title}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Bottom gradient overlay */}
                  {!hideGalleryMeta && (
                    <div
                      className="absolute inset-x-0 bottom-0 pointer-events-none"
                      style={{
                        height: "55%",
                        background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
                      }}
                    />
                  )}

                  {/* Metadata overlay */}
                  {!hideGalleryMeta && (
                    <div className="absolute inset-x-0 bottom-0 p-4" style={{ minWidth: 0, overflow: "hidden" }}>
                      <p
                        style={{
                          fontSize: "18px",
                          fontWeight: 600,
                          fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                          color: "#FFFFFF",
                          lineHeight: 1.25,
                          textShadow: "0 1px 4px rgba(0,0,0,0.4)",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          WebkitTextOverflow: "ellipsis",
                          maxWidth: "100%",
                        } as React.CSSProperties}
                      >
                        {item.title}
                      </p>
                      <p
                        className="mt-0.5"
                        style={{
                          fontSize: "14px",
                          fontWeight: 400,
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                          color: "rgba(255,255,255,0.85)",
                          textShadow: "0 1px 4px rgba(0,0,0,0.4)",
                          display: "block",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          WebkitTextOverflow: "ellipsis",
                          maxWidth: "100%",
                        } as React.CSSProperties}
                      >
                        {item.artist}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5" style={{ minWidth: 0, overflow: "hidden" }}>
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 400,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            color: "rgba(255,255,255,0.65)",
                            flexShrink: 0,
                          }}
                        >
                          {item.year}
                        </span>
                        {/* Label pill */}
                        <span
                          className="rounded-full"
                          style={{
                            display: "inline-flex",
                            overflow: "hidden",
                            flexShrink: 1,
                            minWidth: 0,
                            padding: "1px 6px",
                            fontSize: "10px",
                            fontWeight: 500,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            backgroundColor: "rgba(255,255,255,0.2)",
                            color: "rgba(255,255,255,0.85)",
                            maxWidth: "100%",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              WebkitTextOverflow: "ellipsis",
                              maxWidth: "100%",
                              width: "100%",
                            } as React.CSSProperties}
                          >
                            {item.label}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Priority bolt */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePriority(item.id);
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.35)",
                      color: item.priority ? "#EEFC0F" : "rgba(255,255,255,0.7)",
                    }}
                  >
                    <Zap size={16} fill={item.priority ? "currentColor" : "none"} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center gap-4 pb-3 pt-2" style={{ paddingBottom: "calc(12px + var(--nav-clearance, 0px))", zIndex: lightboxActive ? 101 : "auto" }}>
        <button
          onClick={() => { goPrev(); if (lightboxActive) resetIdleTimer(); }}
          disabled={safeIndex === 0}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all tappable ${
            lightboxActive ? "bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
          }`}
          style={!lightboxActive ? {
            backgroundColor: "var(--c-chip-bg)",
            color: "var(--c-text-secondary)",
            opacity: safeIndex === 0 ? 0.35 : 1,
            transform: "rotate(90deg)",
          } : {
            opacity: safeIndex === 0 ? 0.35 : 1,
            transform: "rotate(90deg)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: lightboxActive ? "rgba(255,255,255,0.7)" : "var(--c-text-muted)",
            minWidth: "60px",
            textAlign: "center",
            transition: "color 200ms ease-out",
          }}
        >
          {safeIndex + 1} / {wants.length}
        </span>

        <button
          onClick={() => { goNext(); if (lightboxActive) resetIdleTimer(); }}
          disabled={safeIndex >= wants.length - 1}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all tappable ${
            lightboxActive ? "bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
          }`}
          style={!lightboxActive ? {
            backgroundColor: "var(--c-chip-bg)",
            color: "var(--c-text-secondary)",
            opacity: safeIndex >= wants.length - 1 ? 0.35 : 1,
            transform: "rotate(90deg)",
          } : {
            opacity: safeIndex >= wants.length - 1 ? 0.35 : 1,
            transform: "rotate(90deg)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function WantGridView({ wants, togglePriority, onSelect, compact }: { wants: WantItem[]; togglePriority: (id: string) => void; onSelect: (item: WantItem) => void; compact?: boolean }) {
  const { isDarkMode } = useApp();

  const alphabetEntries = useWantAlphabetIndex(wants);
  const indexVisible = !!(alphabetEntries && alphabetEntries.length > 1);
  const anchorRefs = useRef<(HTMLElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep refs array in sync with item count
  if (anchorRefs.current.length !== wants.length) {
    anchorRefs.current = new Array(wants.length).fill(null);
  }

  const wantRenderItems = useMemo((): WantRenderItem[] => {
    const items: WantRenderItem[] = [];
    let currentLabel: string | null = null;
    let isFirst = true;
    wants.forEach((want, itemIndex) => {
      const label = getWantGroupLabel(want);
      if (label !== currentLabel) {
        items.push({ kind: "divider", label, firstIndex: itemIndex, isFirst });
        currentLabel = label;
        isFirst = false;
      }
      items.push({ kind: "item", want, itemIndex });
    });
    return items;
  }, [wants]);

  if (wants.length === 0) return <div className="flex-1 flex items-center justify-center"><p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No items found</p></div>;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overlay-scroll">
        <div className={`grid ${compact ? "grid-cols-3" : "grid-cols-2"} lg:grid-cols-4 gap-3 pl-[16px] pr-[32px] pt-[12px] ${indexVisible ? "lg:pr-[24px]" : ""}`} style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>
          {wantRenderItems.map((item) => {
            if (item.kind === "divider") {
              return (
                <div
                  key={`divider-${item.label}`}
                  className="col-span-full"
                  style={{ paddingTop: item.isFirst ? 0 : 16, paddingBottom: 8 }}
                  ref={(el) => { anchorRefs.current[item.firstIndex] = el; }}
                >
                  <p style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    color: "var(--c-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                  }}>
                    {item.label}
                  </p>
                  <div style={{ height: 1, backgroundColor: "var(--c-border)" }} />
                </div>
              );
            }
            return (
              <div
                key={item.want.id}
                className="relative min-w-0"
              >
                <WantGridCard item={item.want} togglePriority={togglePriority} isDarkMode={isDarkMode} onSelect={onSelect} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Alphabet index sidebar — mobile only */}
      {indexVisible && (
        <WantAlphabetSidebar entries={alphabetEntries!} anchorRefs={anchorRefs} scrollRef={scrollRef} />
      )}
    </>
  );
}

// Intentionally separate from album list item — actions diverge in Phase 6
function WantlistView({ wants, togglePriority, onSelect }: { wants: WantItem[]; togglePriority: (id: string) => void; onSelect: (item: WantItem) => void }) {
  const { isDarkMode } = useApp();

  const alphabetEntries = useWantAlphabetIndex(wants);
  const indexVisible = !!(alphabetEntries && alphabetEntries.length > 1);
  const anchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep refs array in sync with item count
  if (anchorRefs.current.length !== wants.length) {
    anchorRefs.current = new Array(wants.length).fill(null);
  }

  const wantRenderItems = useMemo((): WantRenderItem[] => {
    const items: WantRenderItem[] = [];
    let currentLabel: string | null = null;
    let isFirst = true;
    wants.forEach((want, itemIndex) => {
      const label = getWantGroupLabel(want);
      if (label !== currentLabel) {
        items.push({ kind: "divider", label, firstIndex: itemIndex, isFirst });
        currentLabel = label;
        isFirst = false;
      }
      items.push({ kind: "item", want, itemIndex });
    });
    return items;
  }, [wants]);

  if (wants.length === 0) return <div className="flex-1 flex items-center justify-center"><p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No items found</p></div>;

  return (
    <>
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overlay-scroll ${indexVisible ? "lg:pr-[24px]" : "pr-[16px] lg:pr-[24px]"} pl-[16px] pr-[32px] pt-[16px]`}
        style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}
      >
        <div className="flex flex-col">
          {wantRenderItems.map((item) => {
            if (item.kind === "divider") {
              return (
                <div
                  key={`divider-${item.label}`}
                  style={{ paddingTop: item.isFirst ? 0 : 16, paddingBottom: 8 }}
                  ref={(el) => { anchorRefs.current[item.firstIndex] = el; }}
                >
                  <p style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    color: "var(--c-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 6,
                  }}>
                    {item.label}
                  </p>
                  <div style={{ height: 1, backgroundColor: "var(--c-border)" }} />
                </div>
              );
            }
            const { want } = item;
            return (
              <div
                key={want.id}
                className="flex items-center gap-[12px] tappable transition-colors cursor-pointer"
                style={{ padding: "12px 0", borderBottom: "1px solid var(--c-border)", touchAction: "manipulation" }}
                {...useSafeTap(() => onSelect(want))}
              >
                <div className="rounded-[8px] overflow-hidden flex-shrink-0" style={{ width: "60px", height: "60px" }}>
                  <img src={want.thumb || want.cover} alt={want.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{want.title}</p>
                  <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{want.artist} · {want.year}</p>
                </div>
                <span className="hidden sm:block flex-shrink-0" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>{want.label}</span>
                <button onClick={() => togglePriority(want.id)} className="flex-shrink-0 p-2 transition-transform hover:scale-110">
                  {want.priority ? (
                    <Zap size={18}
                      fill={isDarkMode ? "#EBFD00" : "#B8C900"}
                      color={isDarkMode ? "#EBFD00" : "#B8C900"}
                    />
                  ) : (
                    <Zap size={18}
                      fill="none"
                      color={isDarkMode ? "var(--c-text-faint)" : "var(--c-text-faint)"}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alphabet index sidebar — mobile only */}
      {indexVisible && (
        <WantAlphabetSidebar entries={alphabetEntries!} anchorRefs={anchorRefs} scrollRef={scrollRef} />
      )}
    </>
  );
}

function WantArtworkView({ wants, togglePriority, onSelect }: { wants: WantItem[]; togglePriority: (id: string) => void; onSelect: (item: WantItem) => void }) {
  return (
    <AlbumArtwork<WantItem>
      items={wants}
      onItemClick={onSelect}
      emptyMessage="No items found"
      emptySubMessage=""
      renderIndicator={(item) => (
        <button
          onClick={(e) => { e.stopPropagation(); togglePriority(item.id); }}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110"
        >
          <Zap size={14} className={item.priority ? "text-[#EEFC0F]" : "text-white/50"} fill={item.priority ? "#EEFC0F" : "none"} />
        </button>
      )}
      renderAction={() => null}
    />
  );
}

function WantGridCard({ item, togglePriority, isDarkMode, onSelect }: {
  item: WantItem;
  togglePriority: (id: string) => void;
  isDarkMode: boolean;
  onSelect: (item: WantItem) => void;
}) {
  return (
    <div
      className="relative w-full min-w-0 rounded-[10px] overflow-hidden group cursor-pointer"
      {...useSafeTap(() => onSelect(item))}
      style={{
        backgroundColor: "var(--c-surface)",
        border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D2D8DE"}`,
        boxShadow: "var(--c-card-shadow)",
        touchAction: "manipulation",
      }}
    >
      <div className="relative aspect-square overflow-hidden">
        <img src={item.cover} alt={`${item.artist} - ${item.title}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />

        <button
          onClick={() => togglePriority(item.id)}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110 z-[2]"
        >
          <Zap size={14} className={item.priority ? "text-[#EEFC0F]" : "text-white/50"} fill={item.priority ? "#EEFC0F" : "none"} />
        </button>
      </div>
      <div className="px-2.5 pt-2 pb-2.5 min-w-0 overflow-hidden">
        <p style={{ fontSize: "13px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)", lineHeight: "1.25", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.title}</p>
        <p style={{ fontSize: "12px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-secondary)", lineHeight: "1.3", marginTop: "1px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.artist}</p>
        <div className="flex items-center justify-between mt-[2px] min-w-0">
          <span style={{ fontSize: "11px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-muted)" }}>{item.year}</span>
        </div>
      </div>
    </div>
  );
}