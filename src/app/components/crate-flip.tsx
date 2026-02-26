import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { X, Bookmark } from "lucide-react";
import { useApp } from "./app-context";
import type { Album } from "./discogs-api";
import { lastPlayedLabel } from "./last-played-utils";
import { EASE_OUT, EASE_IN, DURATION_FAST, DURATION_NORMAL, DURATION_SLOW } from "./motion-tokens";

interface CrateFlipProps {
  albums: Album[];
  lightboxActive: boolean;
  onLightboxActivate: () => void;
  onLightboxDeactivate: () => void;
}

export function CrateFlip({ albums, lightboxActive, onLightboxActivate, onLightboxDeactivate }: CrateFlipProps) {
  const {
    setSelectedAlbumId, setShowAlbumDetail, isDarkMode, lastPlayed,
    openSessionPicker, isAlbumInAnySession,
  } = useApp();

  const [currentIndex, setCurrentIndex] = useState(0);
  const dragY = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset index when albums change
  useEffect(() => {
    setCurrentIndex(0);
  }, [albums]);

  // Clamp index to valid range
  const safeIndex = Math.min(currentIndex, Math.max(0, albums.length - 1));

  // Idle timer: auto-dismiss lightbox after 3s of inactivity
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => { onLightboxDeactivate(); }, 3000);
  }, [onLightboxDeactivate]);

  useEffect(() => {
    if (!lightboxActive && idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (lightboxActive) resetIdleTimer();
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [lightboxActive, resetIdleTimer]);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, albums.length - 1));
  }, [albums.length]);

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
        if (!lightboxActive) onLightboxActivate();
        resetIdleTimer();
      }
    },
    [goNext, goPrev, lightboxActive, onLightboxActivate, resetIdleTimer]
  );

  const handleCardTap = useCallback(
    (albumId: string) => {
      setSelectedAlbumId(albumId);
      setShowAlbumDetail(true);
    },
    [setSelectedAlbumId, setShowAlbumDetail]
  );

  if (albums.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-[24px]">
        <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>No albums to flip through</p>
      </div>
    );
  }

  const currentAlbum = albums[safeIndex];

  // Stack: show current + up to 2 behind
  const stackIndices = [];
  for (let i = 0; i < Math.min(3, albums.length - safeIndex); i++) {
    stackIndices.push(safeIndex + i);
  }

  const baseOpacity = lightboxActive ? 0.08 : 0.15;

  return (
    <div className="flex-1 flex flex-col items-center overflow-hidden relative" ref={containerRef}>
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
            onClick={(e) => { if (e.target === e.currentTarget) onLightboxDeactivate(); }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onLightboxDeactivate(); }}
              className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-white/25 transition-all z-10"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card stack area */}
      <div className="relative w-full flex-1 flex items-center justify-center px-[16px] lg:px-[24px]">
        <motion.div
          className="relative"
          style={{ width: "min(320px, 80vw)", aspectRatio: "1 / 1", zIndex: lightboxActive ? 101 : "auto" }}
          animate={{ scale: lightboxActive ? 1.05 : 1 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        >
          <AnimatePresence mode="popLayout">
            {stackIndices.reverse().map((idx, stackPos) => {
              const reversePos = stackIndices.length - 1 - stackPos;
              const album = albums[idx];
              const isCurrent = idx === safeIndex;
              const offsetY = reversePos * 8;
              const scale = 1 - reversePos * 0.04;

              return (
                <motion.div
                  key={album.id}
                  className="absolute inset-0 rounded-[16px] overflow-hidden cursor-pointer"
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
                  onClick={() => isCurrent && handleCardTap(album.id)}
                >
                  {/* Cover art */}
                  <img
                    src={album.cover}
                    alt={`${album.artist} - ${album.title}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Bottom gradient overlay */}
                  <div
                    className="absolute inset-x-0 bottom-0 pointer-events-none"
                    style={{
                      height: "55%",
                      background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
                    }}
                  />

                  {/* Metadata overlay */}
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
                      {album.title}
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
                      {album.artist}
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
                        {album.year}
                      </span>
                      {/* Folder pill — white-on-translucent for overlay on art */}
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
                          maxWidth: "40%",
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
                          {album.folder}
                        </span>
                      </span>
                      {/* Last played text */}
                      {lastPlayed[album.id] && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 400,
                            fontFamily: "'DM Sans', system-ui, sans-serif",
                            color: "rgba(255,255,255,0.55)",
                          }}
                        >
                          {lastPlayedLabel(lastPlayed[album.id])}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bookmark icon */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openSessionPicker(album.id);
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center tappable transition-colors"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.35)",
                      color: isAlbumInAnySession(album.id)
                        ? (isDarkMode ? "#ACDEF2" : "#ACDEF2")
                        : "rgba(255,255,255,0.7)",
                    }}
                  >
                    <Bookmark
                      size={16}
                      {...(isAlbumInAnySession(album.id) ? { fill: "currentColor" } : {})}
                    />
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
          {safeIndex + 1} / {albums.length}
        </span>

        <button
          onClick={() => { goNext(); if (lightboxActive) resetIdleTimer(); }}
          disabled={safeIndex >= albums.length - 1}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all tappable ${
            lightboxActive ? "bg-white/10 border border-white/20 text-white/70 hover:bg-white/20 hover:text-white" : ""
          }`}
          style={!lightboxActive ? {
            backgroundColor: "var(--c-chip-bg)",
            color: "var(--c-text-secondary)",
            opacity: safeIndex >= albums.length - 1 ? 0.35 : 1,
            transform: "rotate(90deg)",
          } : {
            opacity: safeIndex >= albums.length - 1 ? 0.35 : 1,
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