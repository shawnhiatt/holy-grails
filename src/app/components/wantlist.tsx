import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Search, Disc3, Grid2x2, List, Zap, Grid3x3, X, ExternalLink } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { toast } from "sonner";
import { useApp, type ViewMode } from "./app-context";
import { ViewModeToggle } from "./crate-browser";
import type { WantItem } from "./mock-data";
import { EASE_OUT, EASE_IN, DURATION_FAST, DURATION_NORMAL, DURATION_SLOW } from "./motion-tokens";
import { fetchMarketData, getCachedMarketData } from "./discogs-api";
import { NoDiscogsCard } from "./no-discogs-card";
import { useHideHeaderOnScroll } from "./use-hide-header";

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

type WantViewMode = "crate" | "list" | "grid" | "artwork";

const WANT_VIEW_MODES: { id: ViewMode; icon: typeof Disc3; label: string }[] = [
  { id: "grid", icon: Grid2x2, label: "Grid" },
  { id: "artwork", icon: Grid3x3, label: "Artwork Grid" },
  { id: "list", icon: List, label: "List" },
  { id: "crate", icon: Disc3, label: "Swiper" },
];

export function Wantlist() {
  const { wants, toggleWantPriority, wantFilter, setWantFilter, wantSearchQuery, setWantSearchQuery, isDarkMode, setScreen, discogsToken } = useApp();
  const [viewMode, setViewMode] = useState<WantViewMode>("grid");

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
      toast.info(item.priority ? "Removed from priority." : "Marked as priority.", { duration: 1500 });
    }
  }, [wants, toggleWantPriority]);

  return (
    <div className="flex flex-col h-full">
      {/* ===== DESKTOP title bar (white bg + border) ===== */}
      <div
        className="hidden lg:flex flex-shrink-0"
      >
        <div className="flex items-center gap-[30px] px-[24px] py-[16px] w-full">
          <h2 style={{ fontSize: "48px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Wantlist</h2>
        </div>
      </div>

      {/* ===== DESKTOP search/filter/view controls (gray content area) ===== */}
      <div className="hidden lg:flex items-center gap-[16px] px-[24px] py-[16px] flex-shrink-0">
        {/* Search field — flex-1 */}
        <div className="flex-1 flex items-center gap-2 rounded-full px-[15px] min-w-0" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "39px" }}>
          <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
          <input type="text" placeholder="Search wants..." value={wantSearchQuery} onChange={(e) => setWantSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none border-none min-w-0"
            style={{ fontSize: "14px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }} />
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
          <ViewModeToggle viewMode={viewMode} setViewMode={(v) => setViewMode(v as WantViewMode)} modes={WANT_VIEW_MODES} />
        </div>
      </div>

      {/* ===== MOBILE top controls ===== */}
      <div className="lg:hidden flex-shrink-0 px-[16px] pt-[8px] pb-[4px]">
        <h2 style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Wantlist</h2>
      </div>

      {/* ===== MOBILE search/filter/view controls ===== */}
      <div className="lg:hidden flex-shrink-0 px-[16px] py-[10px]">
        <div className="flex items-center gap-[10px]">
          <div className="flex items-center gap-[8px] rounded-full px-[14.5px] min-w-0 flex-1" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "34px" }}>
            <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
            <input type="text" placeholder="Search..." value={wantSearchQuery} onChange={(e) => setWantSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none border-none min-w-0"
              style={{ fontSize: "14px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }} />
            {wantSearchQuery && <button onClick={() => setWantSearchQuery("")} style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>×</button>}
          </div>
          <button onClick={() => setWantFilter(wantFilter === "all" ? "priority" : "all")}
            className={`w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors shrink-0 ${wantFilter === "priority" ? "bg-[#EBFD00] text-[#0C284A]" : ""}`}
            style={wantFilter !== "priority" ? { backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" } : undefined}
            title={wantFilter === "priority" ? "Show all" : "Priorities"}
          >
            <Zap size={16} fill={wantFilter === "priority" ? "currentColor" : "none"} />
          </button>
          <ViewModeToggle viewMode={viewMode} setViewMode={(v) => setViewMode(v as WantViewMode)} modes={WANT_VIEW_MODES} compact />
        </div>
      </div>

      {/* Content */}
      {wants.length === 0 && !discogsToken ? (
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
          {viewMode === "crate" && <WantCrateView key={`crate|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} />}
          {viewMode === "list" && <WantlistView key={`list|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} />}
          {viewMode === "grid" && <WantGridView key={`grid|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} />}
          {viewMode === "artwork" && <WantArtworkView key={`artwork|${wantFilter}|${wantSearchQuery}`} wants={filteredWants} togglePriority={handleTogglePriority} />}
        </>
      )}
    </div>
  );
}

function WantCrateView({ wants, togglePriority }: { wants: WantItem[]; togglePriority: (id: string) => void }) {
  const { hideGalleryMeta } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState<-1 | 1 | 0>(0);
  const isDraggingRef = useRef(false);
  const [lightboxActive, setLightboxActive] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragYMotion = useMotionValue(0);

  useEffect(() => {
    if (currentIndex >= wants.length && wants.length > 0) setCurrentIndex(wants.length - 1);
  }, [wants.length, currentIndex]);

  const wrapIndex = useCallback((i: number) => {
    if (wants.length === 0) return 0;
    return ((i % wants.length) + wants.length) % wants.length;
  }, [wants.length]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => { setLightboxActive(false); }, 3000);
  }, []);

  useEffect(() => {
    if (!lightboxActive && idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (lightboxActive) resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [lightboxActive, resetIdleTimer]);

  const goForward = useCallback(() => {
    setExitDirection(1);
    setCurrentIndex((prev) => wrapIndex(prev + 1));
  }, [wrapIndex]);

  const goBack = useCallback(() => {
    setExitDirection(-1);
    setCurrentIndex((prev) => wrapIndex(prev - 1));
  }, [wrapIndex]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    let didSwipe = false;
    if (info.offset.y < -50 || info.velocity.y < -300) { goForward(); didSwipe = true; }
    else if (info.offset.y > 50 || info.velocity.y > 300) { goBack(); didSwipe = true; }
    dragYMotion.set(0);
    setTimeout(() => { isDraggingRef.current = false; }, 100);
    if (didSwipe) { if (!lightboxActive) setLightboxActive(true); resetIdleTimer(); }
  }, [goForward, goBack, dragYMotion, lightboxActive, resetIdleTimer]);

  if (wants.length === 0) return <div className="flex-1 flex items-center justify-center"><p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No items found</p></div>;

  const safeIndex = Math.min(currentIndex, wants.length - 1);
  const currentItem = wants[safeIndex];

  return (
    <div className="flex-1 flex flex-col items-center overflow-hidden relative px-[16px] lg:px-[24px] pt-[0px] pb-[16px] mt-[-16px]">
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
              className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-white/25 transition-all z-10"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centered card + nav group */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 w-full">
        <motion.div
          className="w-full max-w-[361px] lg:max-w-[620px] aspect-square relative"
          style={{ zIndex: lightboxActive ? 101 : "auto" }}
          animate={{ scale: lightboxActive ? 1.05 : 1 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        >
          {/* Stack cards (looped) */}
          {[3, 2, 1].map((stackIndex) => {
            const albumIndex = wrapIndex(safeIndex + stackIndex);
            const album = wants[albumIndex];
            if (!album || (wants.length <= stackIndex && albumIndex === safeIndex)) return null;
            const baseOpacity = lightboxActive ? 0.08 : 0.15;
            return (
              <motion.div key={`wstack-${album.id}-${stackIndex}`} className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 - stackIndex }}
                animate={{ y: -(stackIndex * 14), scale: 1 - stackIndex * 0.04, opacity: Math.max(baseOpacity, 1 - stackIndex * (1 - baseOpacity) / 1.5) }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}>
                <div className="w-full h-full rounded-[14px] overflow-hidden" style={{ boxShadow: "0 4px 23px rgba(12,40,74,0.1)" }}>
                  <img src={album.cover} alt="" className="w-full h-full object-cover" draggable={false} />
                </div>
              </motion.div>
            );
          })}

          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={`wfront-${currentItem.id}-${safeIndex}`}
              className="absolute inset-0 cursor-grab active:cursor-grabbing" style={{ zIndex: 10 }}
              initial={{ y: exitDirection === 1 ? 60 : exitDirection === -1 ? -60 : 0, scale: exitDirection !== 0 ? 0.92 : 1, opacity: exitDirection !== 0 ? 0 : 1 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: exitDirection === 1 ? -400 : 400, opacity: 0, scale: 0.9, rotateX: exitDirection === 1 ? 15 : -15, transition: { duration: DURATION_FAST, ease: EASE_IN } }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.6}
              onDragStart={() => { isDraggingRef.current = true; }}
              onDrag={(_, info) => { dragYMotion.set(info.offset.y); }}
              onDragEnd={handleDragEnd} whileDrag={{ scale: 0.98 }}
            >
              <div className="w-full h-full rounded-[14px] overflow-hidden relative shadow-[0_9px_37px_rgba(12,40,74,0.12)]">
                <img src={currentItem.cover} alt={`${currentItem.artist} - ${currentItem.title}`} className="w-full h-full object-cover" draggable={false} />
                {!hideGalleryMeta && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-5 pt-16">
                  <h3 className="text-white truncate" style={{
                    fontSize: "20px", fontWeight: 600, lineHeight: "1.2", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    textShadow: lightboxActive ? "0 2px 8px rgba(0,0,0,0.7)" : "none",
                    transition: "text-shadow 200ms ease-out",
                  }}>{currentItem.title}</h3>
                  <p className="mt-1 truncate" style={{
                    fontSize: "15px", fontWeight: 400, color: "rgba(255,255,255,0.8)",
                    textShadow: lightboxActive ? "0 1px 6px rgba(0,0,0,0.6)" : "none",
                    transition: "text-shadow 200ms ease-out",
                  }}>{currentItem.artist}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", textShadow: lightboxActive ? "0 1px 4px rgba(0,0,0,0.5)" : "none", transition: "text-shadow 200ms ease-out" }}>{currentItem.year}</span>
                    <span className="text-[rgba(255,255,255,0.25)]">&middot;</span>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", textShadow: lightboxActive ? "0 1px 4px rgba(0,0,0,0.5)" : "none", transition: "text-shadow 200ms ease-out" }}>{currentItem.label}</span>
                    <span className="text-[rgba(255,255,255,0.25)]">&middot;</span>
                    <a
                      href={`https://www.discogs.com/release/${currentItem.release_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 transition-opacity hover:opacity-80"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.7)", textShadow: lightboxActive ? "0 1px 4px rgba(0,0,0,0.5)" : "none", transition: "text-shadow 200ms ease-out" }}>Discogs</span>
                      <ExternalLink size={10} style={{ color: "rgba(255,255,255,0.5)" }} />
                    </a>
                  </div>
                </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); if (!isDraggingRef.current) togglePriority(currentItem.id); }}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110"
                >
                  <Zap size={20} className={currentItem.priority ? "text-[#EEFC0F]" : "text-white/50"} fill={currentItem.priority ? "#EEFC0F" : "none"} />
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Navigation controls */}
        <div className="mt-4 flex items-center gap-4" style={{ zIndex: lightboxActive ? 101 : "auto" }}>
          <button onClick={() => { goBack(); if (lightboxActive) resetIdleTimer(); }}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${
              lightboxActive ? "bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
            }`}
            style={!lightboxActive ? { backgroundColor: "var(--c-surface)", borderColor: "var(--c-border-strong)", color: "var(--c-text-muted)" } : undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
          <div className="flex flex-col items-center" style={{ color: lightboxActive ? "rgba(255,255,255,0.4)" : "var(--c-text-faint)", transition: "color 200ms ease-out" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
            <span style={{ fontSize: "11px", fontWeight: 400 }} className="mt-0.5">Swipe to flip</span>
          </div>
          <button onClick={() => { goForward(); if (lightboxActive) resetIdleTimer(); }}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all ${
              lightboxActive ? "bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
            }`}
            style={!lightboxActive ? { backgroundColor: "var(--c-surface)", borderColor: "var(--c-border-strong)", color: "var(--c-text-muted)" } : undefined}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
          </button>
        </div>
      </div>

      {/* Counter — pinned to bottom */}
      <div className="mt-3 text-center shrink-0" style={{ zIndex: lightboxActive ? 101 : "auto" }}>
        <span style={{
          fontSize: "13px", fontWeight: 400,
          color: lightboxActive ? "rgba(255,255,255,0.7)" : "var(--c-text-secondary)",
          transition: "color 200ms ease-out",
          ...(lightboxActive ? { textShadow: "0 1px 4px rgba(0,0,0,0.5)" } : {}),
        }}>{safeIndex + 1} / {wants.length}</span>
      </div>
    </div>
  );
}

function WantGridView({ wants, togglePriority }: { wants: WantItem[]; togglePriority: (id: string) => void }) {
  const { isDarkMode, discogsToken } = useApp();
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();

  const alphabetEntries = useWantAlphabetIndex(wants);
  const indexVisible = !!(alphabetEntries && alphabetEntries.length > 1);
  const anchorRefs = useRef<(HTMLElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep refs array in sync with item count
  if (anchorRefs.current.length !== wants.length) {
    anchorRefs.current = new Array(wants.length).fill(null);
  }

  // Build a set of item indices that are the first of their letter group (for anchors)
  const anchorIndices = useMemo(() => {
    if (!alphabetEntries) return new Set<number>();
    return new Set(alphabetEntries.map((e) => e.firstIndex));
  }, [alphabetEntries]);

  if (wants.length === 0) return <div className="flex-1 flex items-center justify-center"><p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No items found</p></div>;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overlay-scroll" onScroll={onHeaderScroll}>
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 pl-[16px] pr-[32px] pt-[12px] pb-[120px] ${indexVisible ? "lg:pr-[24px]" : ""}`} style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}>
          {wants.map((item, i) => (
            <div
              key={item.id}
              className="relative min-w-0"
              ref={anchorIndices.has(i) ? (el) => { anchorRefs.current[i] = el; } : undefined}
            >
              <WantGridCard item={item} togglePriority={togglePriority} isDarkMode={isDarkMode} token={discogsToken} />
            </div>
          ))}
        </div>
      </div>

      {/* Alphabet index sidebar — mobile only */}
      {indexVisible && (
        <WantAlphabetSidebar entries={alphabetEntries!} anchorRefs={anchorRefs} scrollRef={scrollRef} />
      )}
    </>
  );
}

function WantlistView({ wants, togglePriority }: { wants: WantItem[]; togglePriority: (id: string) => void }) {
  const { isDarkMode } = useApp();
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();

  const alphabetEntries = useWantAlphabetIndex(wants);
  const indexVisible = !!(alphabetEntries && alphabetEntries.length > 1);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep refs array in sync with item count
  if (rowRefs.current.length !== wants.length) {
    rowRefs.current = new Array(wants.length).fill(null);
  }

  if (wants.length === 0) return <div className="flex-1 flex items-center justify-center"><p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No items found</p></div>;

  return (
    <>
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overlay-scroll ${indexVisible ? "lg:pr-[24px]" : "pr-[16px] lg:pr-[24px]"} pl-[16px] pr-[32px] pt-[16px] pb-[120px]`}
        style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}
        onScroll={onHeaderScroll}
      >
        <div className="flex flex-col gap-1.5">
          {wants.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => { rowRefs.current[i] = el; }}
              className="flex items-center gap-3 p-2.5 rounded-[10px] tappable transition-colors"
              style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
            >
              <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0">
                <img src={item.cover} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.title}</p>
                <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{item.artist} · {item.year}</p>
              </div>
              <span className="hidden sm:block flex-shrink-0" style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>{item.label}</span>
              <a
                href={`https://www.discogs.com/release/${item.release_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 flex items-center gap-1.5 p-2 transition-opacity hover:opacity-80"
                style={{ color: "var(--c-text-muted)" }}
                title="View on Discogs"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="hidden lg:inline" style={{ fontSize: "12px", fontWeight: 500 }}>View on Discogs</span>
                <ExternalLink size={15} />
              </a>
              <button onClick={() => togglePriority(item.id)} className="flex-shrink-0 p-2 transition-transform hover:scale-110">
                {item.priority ? (
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
          ))}
        </div>
      </div>

      {/* Alphabet index sidebar — mobile only */}
      {indexVisible && (
        <WantAlphabetSidebar entries={alphabetEntries!} anchorRefs={rowRefs} scrollRef={scrollRef} />
      )}
    </>
  );
}

function WantArtworkView({ wants, togglePriority }: { wants: WantItem[]; togglePriority: (id: string) => void }) {
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();
  if (wants.length === 0) return <div className="flex-1 flex items-center justify-center"><p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>No items found</p></div>;

  return (
    <div className="flex-1 overflow-y-auto overlay-scroll" onScroll={onHeaderScroll}>
      <div
        className="grid grid-cols-4 gap-2 lg:gap-[10px] px-[16px] lg:px-[24px] pt-[24px]"
        style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}
      >
        {wants.map((item) => (
          <div
            key={item.id}
            className="relative overflow-hidden group rounded-[10px]"
            style={{ aspectRatio: "1 / 1" }}
          >
            <img src={item.cover} alt={`${item.artist} - ${item.title}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
              <p className="text-white truncate" style={{ fontSize: "13px", fontWeight: 600, lineHeight: "1.2", fontFamily: "'Bricolage Grotesque', system-ui, sans-serif" }}>{item.title}</p>
              <p className="text-[rgba(255,255,255,0.75)] truncate" style={{ fontSize: "11px", fontWeight: 400, lineHeight: "1.3" }}>{item.artist}</p>
            </div>
            <button
              onClick={() => togglePriority(item.id)}
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110"
            >
              <Zap size={14} className={item.priority ? "text-[#EEFC0F]" : "text-white/50"} fill={item.priority ? "#EEFC0F" : "none"} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grid card with lazy-loaded marketplace data on hover */
function WantGridCard({ item, togglePriority, isDarkMode, token }: {
  item: WantItem;
  togglePriority: (id: string) => void;
  isDarkMode: boolean;
  token: string;
}) {
  const [marketStats, setMarketStats] = useState<{ numForSale: number; lowestPrice: number | null; currency: string } | null>(null);
  const [isLoadingMarket, setIsLoadingMarket] = useState(false);
  const fetchedRef = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    // Check cache first
    const cached = getCachedMarketData(item.release_id);
    if (cached) {
      setMarketStats(cached.stats);
      return;
    }
    // Fetch from API
    setIsLoadingMarket(true);
    fetchMarketData(item.release_id, token)
      .then((data) => setMarketStats(data.stats))
      .catch(() => { /* silently fail */ })
      .finally(() => setIsLoadingMarket(false));
  }, [item.release_id, token]);

  const discogsUrl = `https://www.discogs.com/release/${item.release_id}`;
  const sellUrl = `https://www.discogs.com/sell/release/${item.release_id}`;

  const formatPrice = (value: number, currency: string) => {
    if (currency === "USD") return `$${value.toFixed(2)}`;
    if (currency === "EUR") return `\u20AC${value.toFixed(2)}`;
    if (currency === "GBP") return `\u00A3${value.toFixed(2)}`;
    return `${value.toFixed(2)} ${currency}`;
  };

  return (
    <div
      className="relative w-full min-w-0 rounded-[10px] overflow-hidden group"
      onMouseEnter={handleMouseEnter}
      style={{
        backgroundColor: "var(--c-surface)",
        border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D1D8DF"}`,
        boxShadow: "var(--c-card-shadow)",
      }}
    >
      <div className="relative aspect-square overflow-hidden">
        <img src={item.cover} alt={`${item.artist} - ${item.title}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" draggable={false} />

        {/* Hover overlay with marketplace data + View on Discogs */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 z-[1]">
          {/* Marketplace stats */}
          {isLoadingMarket ? (
            <p style={{ fontSize: "11px", fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>Loading marketplace...</p>
          ) : marketStats && marketStats.numForSale > 0 ? (
            <a
              href={sellUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
            >
              <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.85)", lineHeight: 1.3 }}>
                {marketStats.numForSale} {marketStats.numForSale === 1 ? "copy" : "copies"} for sale
                {marketStats.lowestPrice !== null && ` from ${formatPrice(marketStats.lowestPrice, marketStats.currency)}`}
              </p>
            </a>
          ) : marketStats ? (
            <p style={{ fontSize: "11px", fontWeight: 400, color: "rgba(255,255,255,0.45)" }}>No copies for sale</p>
          ) : null}

          {/* View on Discogs button */}
          <a
            href={discogsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full transition-colors hover:bg-white/25"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: "11px", fontWeight: 600, color: "white" }}>View on Discogs</span>
            <ExternalLink size={11} className="text-white" />
          </a>
        </div>

        <button
          onClick={() => togglePriority(item.id)}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110 z-[2]"
        >
          <Zap size={14} className={item.priority ? "text-[#EEFC0F]" : "text-white/50"} fill={item.priority ? "#EEFC0F" : "none"} />
        </button>
      </div>
      <div className="px-2.5 pt-2 pb-2.5 min-w-0 overflow-hidden">
        <p className="line-clamp-1" style={{ fontSize: "13px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)", lineHeight: "1.25" }}>{item.title}</p>
        <p className="line-clamp-1 mt-[1px]" style={{ fontSize: "12px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-secondary)", lineHeight: "1.3" }}>{item.artist}</p>
        <div className="flex items-center justify-between mt-[2px] min-w-0">
          <span style={{ fontSize: "11px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text-muted)" }}>{item.year}</span>
          <a
            href={discogsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="lg:hidden flex items-center gap-1 transition-opacity hover:opacity-80"
            onClick={(e) => e.stopPropagation()}
            style={{ color: "var(--c-text-muted)" }}
          >
            <span style={{ fontSize: "10px", fontWeight: 500 }}>Discogs</span>
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
}