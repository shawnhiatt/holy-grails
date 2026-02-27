import { Bookmark } from "lucide-react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useApp } from "./app-context";
import type { Album } from "./discogs-api";
import { purgeIndicatorColor } from "./purge-colors";
import { formatRelativeDate } from "./last-played-utils";
import { useHideHeaderOnScroll } from "./use-hide-header";

/* ─── Alphabet Index Sidebar (mobile only) ─── */

interface LetterEntry {
  letter: string;
  firstIndex: number;
}

function useAlphabetIndex(albums: Album[], sortOption: string) {
  return useMemo(() => {
    // Only show for alphabetical sorts
    const isArtist = sortOption === "artist-az" || sortOption === "artist-za";
    const isTitle = sortOption === "title-az";
    if (!isArtist && !isTitle) return null;

    const field: "artist" | "title" = isArtist ? "artist" : "title";
    const map = new Map<string, number>();

    for (let i = 0; i < albums.length; i++) {
      const raw = albums[i][field] || "";
      const ch = raw.charAt(0).toUpperCase();
      const letter = /[A-Z]/.test(ch) ? ch : "#";
      if (!map.has(letter)) map.set(letter, i);
    }

    const entries: LetterEntry[] = [];
    // For A-Z sorts put # at the end; for Z-A put # at the start
    if (sortOption === "artist-za") {
      // Z→A order already in the album array, letters should mirror that
      for (let c = 90; c >= 65; c--) {
        const l = String.fromCharCode(c);
        if (map.has(l)) entries.push({ letter: l, firstIndex: map.get(l)! });
      }
      if (map.has("#")) entries.push({ letter: "#", firstIndex: map.get("#")! });
    } else {
      if (map.has("#")) entries.push({ letter: "#", firstIndex: map.get("#")! });
      for (let c = 65; c <= 90; c++) {
        const l = String.fromCharCode(c);
        if (map.has(l)) entries.push({ letter: l, firstIndex: map.get(l)! });
      }
    }

    return entries;
  }, [albums, sortOption]);
}

interface AlphabetSidebarProps {
  entries: LetterEntry[];
  rowRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function AlphabetSidebar({ entries, rowRefs, scrollRef }: AlphabetSidebarProps) {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
  }, []);

  const scrollToLetter = useCallback((entry: LetterEntry, smooth = false) => {
    const el = rowRefs.current[entry.firstIndex];
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const elTop = el.offsetTop - container.offsetTop;
      container.scrollTo({ top: elTop - 8, behavior: smooth ? "smooth" : "auto" });
    }
  }, [rowRefs, scrollRef]);

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

// Intentionally separate from wantlist list item — actions diverge in Phase 6

/* ─── Album List ─── */

interface AlbumListProps {
  albums: Album[];
  showPurgeIndicator?: boolean;
}

export function AlbumList({ albums, showPurgeIndicator = true }: AlbumListProps) {
  const { setSelectedAlbumId, setShowAlbumDetail, isDarkMode, lastPlayed, hidePurgeIndicators, albums: allAlbums, setScreen, openSessionPicker, isAlbumInAnySession, sortOption } = useApp();
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();

  const collectionEmpty = allAlbums.length === 0;
  const alphabetEntries = useAlphabetIndex(albums, sortOption);
  const indexVisible = !!(alphabetEntries && alphabetEntries.length > 1);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchState = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  // Keep refs array in sync with album count
  if (rowRefs.current.length !== albums.length) {
    rowRefs.current = new Array(albums.length).fill(null);
  }

  if (albums.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="text-center">
          <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>No albums found</p>
          <p className="mt-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            {collectionEmpty
              ? "Head to Settings and sync your Discogs collection to get started."
              : "Try adjusting your filters"}
          </p>
          {collectionEmpty && (
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
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto overlay-scroll ${indexVisible ? "lg:pr-[24px]" : "pr-[16px] lg:pr-[24px]"} pl-[16px] pr-[32px] pt-[16px] pb-[120px]`}
        style={{ paddingBottom: "calc(24px + var(--nav-clearance, 0px))" }}
        onScroll={onHeaderScroll}
      >
        <div className="flex flex-col gap-1.5">
          {albums.map((album, i) => {
            const lp = lastPlayed[album.id];
            return (
              <button
                key={album.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                onClick={() => { setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
                onTouchStart={(e) => { const t = e.touches[0]; touchState.current = { startX: t.clientX, startY: t.clientY, moved: false }; }}
                onTouchMove={(e) => { if (!touchState.current) return; const t = e.touches[0]; if (Math.abs(t.clientX - touchState.current.startX) > 6 || Math.abs(t.clientY - touchState.current.startY) > 6) touchState.current.moved = true; }}
                onTouchEnd={(e) => { if (touchState.current && !touchState.current.moved) { e.preventDefault(); setSelectedAlbumId(album.id); setShowAlbumDetail(true); } touchState.current = null; }}
                className="flex items-center gap-3 p-2.5 rounded-[10px] tappable transition-colors text-left group relative"
                style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
              >
                <div className="w-16 h-16 rounded-[8px] overflow-hidden flex-shrink-0">
                  <img src={album.cover} alt={album.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--c-text)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.title}</p>
                  <p style={{ fontSize: "13px", fontWeight: 400, color: "var(--c-text-tertiary)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitTextOverflow: "ellipsis", maxWidth: "100%" } as React.CSSProperties}>{album.artist} · {album.year}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {showPurgeIndicator && !hidePurgeIndicators && album.purgeTag && (
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0 absolute top-1.5 right-1.5"
                        style={{
                          backgroundColor: purgeIndicatorColor(album.purgeTag, isDarkMode),
                          opacity: 0.5,
                        }}
                      />
                    )}
                    <span
                      className="px-2 py-0.5 rounded-full hidden md:block"
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)",
                        color: isDarkMode ? "#ACDEF2" : "#00527A",
                      }}
                    >
                      {album.folder}
                    </span>
                  </div>
                  {lp && (
                    <span
                      className="hidden sm:block"
                      style={{
                        fontSize: "10px",
                        fontWeight: 400,
                        color: "var(--c-text-faint)",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                      }}
                    >
                      {formatRelativeDate(lp)}
                    </span>
                  )}
                  <div
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); openSessionPicker(album.id); }}
                    className="flex-shrink-0 tappable transition-colors cursor-pointer"
                    style={{
                      padding: "2px",
                      color: isAlbumInAnySession(album.id)
                        ? (isDarkMode ? "#ACDEF2" : "#00527A")
                        : "var(--c-text-faint)",
                    }}
                  >
                    <Bookmark
                      size={14}
                      {...(isAlbumInAnySession(album.id) ? { fill: "currentColor" } : {})}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Alphabet index sidebar — mobile only */}
      {indexVisible && (
        <AlphabetSidebar entries={alphabetEntries!} rowRefs={rowRefs} scrollRef={scrollRef} />
      )}
    </>
  );
}