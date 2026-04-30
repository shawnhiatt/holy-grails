import React, { useState, useCallback, useRef, useEffect } from "react";
import { Check, Minus, HelpCircle, Disc3, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "./app-context";
import type { Album, PurgeTag } from "./discogs-api";
import { purgeTagColor, purgeTagBg, purgeTagBorder, purgeTagLabel, purgeIndicatorColor, purgeButtonBg, purgeButtonText, purgeToast } from "./purge-colors";
import { EASE_OUT, DURATION_FAST, DURATION_NORMAL } from "./motion-tokens";
import { NoDiscogsCard } from "./no-discogs-card";
import { useHaptic } from "@/hooks/useHaptic";

export function PurgeTracker() {
  const {
    albums, purgeFilter, setPurgeFilter, setPurgeTag,
    setSelectedAlbumId, setShowAlbumDetail,
    isDarkMode, isAuthenticated, isSyncing,
    executePurgeCut, purgeProgress,
  } = useApp();
  const triggerHaptic = useHaptic('medium');

  const scrollRef = useRef<HTMLDivElement>(null);

  // Purge Cut dialog state (execution lives in context)
  const [showPurgeCutDialog, setShowPurgeCutDialog] = useState(false);

  // Scroll to top when filter changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [purgeFilter]);

  const keepCount = albums.filter((a) => a.purgeTag === "keep").length;
  const cutCount = albums.filter((a) => a.purgeTag === "cut").length;
  const maybeCount = albums.filter((a) => a.purgeTag === "maybe").length;
  const unratedCount = albums.filter((a) => a.purgeTag === null).length;
  const totalCount = albums.length;
  const ratedCount = totalCount - unratedCount;
  const progress = totalCount > 0 ? (ratedCount / totalCount) * 100 : 0;

  const filteredAlbums = albums.filter((a) => {
    if (purgeFilter === "all") return true;
    if (purgeFilter === "unrated") return a.purgeTag === null;
    return a.purgeTag === purgeFilter;
  });

  const handlePurgeTag = useCallback((albumId: string, tag: PurgeTag) => {
    setPurgeTag(albumId, tag);
    if (tag) {
      const album = albums.find((a) => a.id === albumId);
      purgeToast(tag, isDarkMode, album?.title);
    }
  }, [albums, setPurgeTag, isDarkMode]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[2px] pb-[8px] lg:pt-[0px] lg:pb-[12px]">
        <p style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>Evaluate your collection</p>
      </div>

      {albums.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="Nothing to evaluate."
          subtext="Connect your Discogs collection to start rating your records."
        />
      ) : (
      <>
      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[2px] pb-[8px] lg:pt-[8px] lg:pb-[16px]">
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-secondary)" }}>{ratedCount} of {totalCount} evaluated — {Math.round(progress)}%</span>
          <span style={{ fontSize: "14px", fontWeight: 600, color: purgeTagColor("cut", isDarkMode) }}>{unratedCount > 0 ? `${unratedCount} still waiting for a verdict.` : "Every record has been evaluated. Rare discipline."}</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--c-chip-bg)" }}>
          <motion.div
            className="h-full rounded-full overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          >
            <div className="h-full rounded-full" style={{ background: "linear-gradient(to right, #FF98DA, #ACDEF2, #3E9842)", width: `${progress > 0 ? (100 / progress) * 100 : 100}%` }} />
          </motion.div>
        </div>
      </div>

      <div className="flex-shrink-0 px-[16px] lg:px-[24px] pt-[4px] pb-[8px]">
        <div className="flex gap-1.5">
          <StatChip label="Total" tag="all" count={totalCount} isActive={purgeFilter === "all"} onClick={() => setPurgeFilter("all")} isDark={isDarkMode} />
          <StatChip label="Keep" tag="keep" count={keepCount} isActive={purgeFilter === "keep"} onClick={() => setPurgeFilter("keep")} isDark={isDarkMode} />
          <StatChip label="Maybe" tag="maybe" count={maybeCount} isActive={purgeFilter === "maybe"} onClick={() => setPurgeFilter("maybe")} isDark={isDarkMode} />
          <StatChip label="Cut" tag="cut" count={cutCount} isActive={purgeFilter === "cut"} onClick={() => setPurgeFilter("cut")} isDark={isDarkMode} />
          <StatChip label="Unrated" tag="unrated" count={unratedCount} isActive={purgeFilter === "unrated"} onClick={() => setPurgeFilter("unrated")} isDark={isDarkMode} />
        </div>
      </div>

      {/* Progress indicator during purge execution */}
      {purgeProgress && (
        <div className="flex-shrink-0 px-[16px] lg:px-[24px] pb-[8px]">
          <div className="rounded-[10px] py-3 px-4 flex items-center gap-3" style={{ backgroundColor: purgeTagBg("cut", isDarkMode), border: `1px solid ${purgeTagBorder("cut", isDarkMode)}` }}>
            <Disc3 size={16} className="disc-spinner flex-shrink-0" style={{ color: purgeTagColor("cut", isDarkMode) }} />
            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)" }}>
              Removing {purgeProgress.current} of {purgeProgress.total}...
            </span>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overlay-scroll px-[16px] lg:px-[24px] pt-[0px]" style={{ paddingBottom: (purgeFilter === "cut" && cutCount > 0 && !purgeProgress) ? "24px" : "calc(24px + var(--nav-clearance, 0px))" }}>
        {filteredAlbums.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p style={{ fontSize: "14px", color: "var(--c-text-muted)" }}>
              {purgeFilter === "unrated" ? "Nothing left to evaluate. Whether you followed through is between you and your shelves."
                : purgeFilter === "cut" ? "No cuts yet. The hard part is deciding."
                : purgeFilter === "keep" ? "Nothing marked as a keeper yet."
                : purgeFilter === "maybe" ? "No maybes. Decisive."
                : "No albums in this category"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredAlbums.map((album) => (
              <SwipeableAlbumRow
                key={album.id}
                album={album}
                onTag={handlePurgeTag}
                onTap={() => { triggerHaptic(); setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
                isDark={isDarkMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pinned Purge Cut footer — visible when Cut filter is active */}
      {purgeFilter === "cut" && cutCount > 0 && !purgeProgress && (
        <div
          className="flex-shrink-0 px-[16px] lg:px-[24px] pt-3"
          style={{
            borderTop: "1px solid var(--c-border)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--nav-clearance, 0px) + 8px)",
          }}
        >
          <button
            onClick={() => setShowPurgeCutDialog(true)}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-[10px] transition-colors"
            style={{
              backgroundColor: isSyncing ? "var(--c-chip-bg)" : "#EBFD00",
              color: isSyncing ? "var(--c-text-muted)" : "#0C284A",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <Trash2 size={15} />
            Purge Cut ({cutCount})
          </button>
        </div>
      )}
      </>
      )}

      {/* Purge Cut confirmation dialog */}
      <AnimatePresence>
        {showPurgeCutDialog && (
          <PurgeCutDialog
            cutAlbums={cutAlbums}
            isDark={isDarkMode}
            onCancel={() => setShowPurgeCutDialog(false)}
            onConfirm={() => { setShowPurgeCutDialog(false); executePurgeCut(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function PurgeCutDialog({
  cutAlbums,
  isDark,
  onCancel,
  onConfirm,
}: {
  cutAlbums: Album[];
  isDark: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const n = cutAlbums.length;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, pointerEvents: "none" as const }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed inset-0 bg-black/40"
        style={{ zIndex: 88 }}
        onClick={onCancel}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed left-0 right-0 bottom-0 rounded-t-[20px] flex flex-col"
        style={{
          zIndex: 89,
          maxHeight: "75vh",
          backgroundColor: isDark ? "#091E34" : "#FFFFFF",
          boxShadow: "var(--c-sheet-shadow)",
          "--c-sheet-shadow": isDark ? "0 -8px 32px rgba(0, 0, 0, 0.3)" : "0 -8px 32px rgba(12, 40, 74, 0.1)",
          "--c-text": isDark ? "#E2E8F0" : "#0C284A",
          "--c-text-secondary": isDark ? "#9EAFC2" : "#455B75",
          "--c-text-muted": isDark ? "#7D92A8" : "#6B7B8E",
          "--c-border-strong": isDark ? "#2D4A66" : "#74889C",
          "--c-surface": isDark ? "#091E34" : "#FFFFFF",
          "--c-chip-bg": isDark ? "#1A3350" : "#EFF1F3",
        } as React.CSSProperties}
      >
        {/* Grab handle */}
        <div className="flex justify-center py-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: isDark ? "#2D4A66" : "#D2D8DE" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--c-border-strong)" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>
            Purge Cut
          </h3>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <Minus size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
          <p style={{ fontSize: "14px", color: "var(--c-text-secondary)", lineHeight: 1.5, marginBottom: "16px" }}>
            This will permanently remove {n} album{n === 1 ? "" : "s"} from your Discogs collection. This cannot be undone.
          </p>
          <div className="flex flex-col gap-1">
            {cutAlbums.map((album) => (
              <div key={album.release_id} className="flex items-center gap-2.5 py-1.5">
                <div className="w-8 h-8 rounded-[6px] overflow-hidden flex-shrink-0">
                  <img src={album.thumb || album.cover} alt={album.title} className="w-full h-full object-cover" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                    {album.title}
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--c-text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>
                    {album.artist}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex flex-col gap-2 px-4 pt-3"
          style={{
            borderTop: "1px solid var(--c-border-strong)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 8px)",
          }}
        >
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-[10px] flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: "#EBFD00",
              color: "#0C284A",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <Trash2 size={15} />
            Remove {n} album{n === 1 ? "" : "s"}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-[10px] transition-colors"
            style={{
              backgroundColor: "var(--c-chip-bg)",
              color: "var(--c-text-secondary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </>
  );
}

function StatChip({ label, tag, count, isActive, onClick, isDark }: {
  label: string; tag: string; count: number; isActive: boolean; onClick: () => void; isDark: boolean;
}) {
  const color = purgeTagColor(tag, isDark);
  const bg = purgeTagBg(tag, isDark);
  const labelClr = purgeTagLabel(tag, isDark);

  return (
    <button onClick={onClick}
      className="flex flex-col items-center flex-1 py-2 rounded-[10px] border transition-all"
      style={{
        borderColor: isActive ? purgeTagBorder(tag, isDark) : "transparent",
        backgroundColor: isActive ? bg : "transparent",
      }}>
      <span style={{ fontSize: "18px", fontWeight: 600, color: isActive ? color : "var(--c-text-muted)" }}>{count}</span>
      <span className="mt-0.5" style={{ fontSize: "11px", fontWeight: 500, color: isActive ? labelClr : "var(--c-text-muted)" }}>{label}</span>
    </button>
  );
}

function SwipeableAlbumRow({ album, onTag, onTap, isDark }: {
  album: Album; onTag: (id: string, tag: PurgeTag) => void; onTap: () => void; isDark: boolean;
}) {
  const triggerHaptic = useHaptic('light');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const keepZoneRef = useRef<HTMLDivElement>(null);
  const cutZoneRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef(false);
  const hasDragged = useRef(false);
  const pointerStartX = useRef(0);
  const currentOffset = useRef(0);

  const keepClr = purgeTagColor("keep", isDark);
  const cutClr = purgeTagColor("cut", isDark);
  const maybeClr = purgeTagColor("maybe", isDark);

  const applyTransform = useCallback((x: number, transition?: string) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = transition ?? "none";
    el.style.transform = `translateX(${x}px)`;
    currentOffset.current = x;
    // Show/hide zones based on direction
    if (keepZoneRef.current) keepZoneRef.current.style.opacity = x > 0 ? "1" : "0";
    if (cutZoneRef.current) cutZoneRef.current.style.opacity = x < 0 ? "1" : "0";
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    hasDragged.current = false;
    pointerStartX.current = e.clientX;
    if (contentRef.current) contentRef.current.style.transition = "none";
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - pointerStartX.current;
    if (Math.abs(delta) > 5) hasDragged.current = true;
    applyTransform(delta);
  }, [applyTransform]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const x = currentOffset.current;
    const absX = Math.abs(x);
    const elementWidth = wrapperRef.current?.offsetWidth ?? 300;
    const snapEasing = `cubic-bezier(${EASE_OUT.join(",")})`;

    if (x > 0 && absX > elementWidth * 0.3) {
      onTag(album.id, "keep");
    } else if (x < 0 && absX > elementWidth * 0.3) {
      onTag(album.id, "cut");
    }

    // Always snap back
    applyTransform(
      0,
      `transform ${Math.round(DURATION_FAST * 1000)}ms ${snapEasing}`
    );
  }, [album.id, onTag, applyTransform]);

  const handlePointerCancel = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    applyTransform(
      0,
      `transform ${Math.round(DURATION_FAST * 1000)}ms cubic-bezier(${EASE_OUT.join(",")})`
    );
  }, [applyTransform]);

  return (
    <div
      ref={wrapperRef}
      className="relative rounded-[10px] overflow-hidden"
    >
      {/* Keep zone — revealed when swiping right */}
      <div
        ref={keepZoneRef}
        style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: "100%",
          backgroundColor: purgeButtonBg("keep", isDark),
          zIndex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start",
          paddingLeft: 20, opacity: 0, borderRadius: "10px",
        }}
      >
        <Check size={20} color={purgeButtonText("keep", isDark)} />
        <span style={{ color: purgeButtonText("keep", isDark), fontSize: "13px", fontWeight: 600, marginLeft: 6 }}>Keep</span>
      </div>

      {/* Cut zone — revealed when swiping left */}
      <div
        ref={cutZoneRef}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: "100%",
          backgroundColor: purgeButtonBg("cut", isDark),
          zIndex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end",
          paddingRight: 20, opacity: 0, borderRadius: "10px",
        }}
      >
        <span style={{ color: purgeButtonText("cut", isDark), fontSize: "13px", fontWeight: 600, marginRight: 6 }}>Cut</span>
        <Minus size={20} color={purgeButtonText("cut", isDark)} />
      </div>

      {/* Card content — draggable layer */}
      <div
        ref={contentRef}
        style={{
          position: "relative", zIndex: 2,
          cursor: "grab", touchAction: "pan-y", userSelect: "none",
          backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)",
          borderRadius: "10px",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={(e) => { if (hasDragged.current) e.stopPropagation(); }}
      >
        <div
          className="flex items-center gap-3 p-2.5 rounded-[10px] relative"
          onClick={() => { if (!hasDragged.current) onTap(); }}
        >
          {album.purgeTag && (
            <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ backgroundColor: purgeIndicatorColor(album.purgeTag, isDark) }} />
          )}
          <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0 ml-1">
            <img src={album.thumb || album.cover} alt={album.title} className="w-full h-full object-cover" draggable={false} />
          </div>
          <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
            <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.title}</p>
            <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.artist}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={(e) => { triggerHaptic(); e.stopPropagation(); onTag(album.id, album.purgeTag === "keep" ? null : "keep"); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: album.purgeTag === "keep" ? purgeTagBg("keep", isDark) : "var(--c-chip-bg)", color: album.purgeTag === "keep" ? keepClr : "var(--c-text-faint)" }}>
              <Check size={14} />
            </button>
            <button onClick={(e) => { triggerHaptic(); e.stopPropagation(); onTag(album.id, album.purgeTag === "maybe" ? null : "maybe"); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: album.purgeTag === "maybe" ? purgeTagBg("maybe", isDark) : "var(--c-chip-bg)", color: album.purgeTag === "maybe" ? maybeClr : "var(--c-text-faint)" }}>
              <HelpCircle size={14} />
            </button>
            <button onClick={(e) => { triggerHaptic(); e.stopPropagation(); onTag(album.id, album.purgeTag === "cut" ? null : "cut"); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: album.purgeTag === "cut" ? purgeTagBg("cut", isDark) : "var(--c-chip-bg)", color: album.purgeTag === "cut" ? cutClr : "var(--c-text-faint)" }}>
              <Minus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}