import { Bookmark } from "lucide-react";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useApp } from "./app-context";
import type { Album } from "./discogs-api";
import { purgeIndicatorColor } from "./purge-colors";
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
  anchorRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function AlphabetSidebar({ entries, anchorRefs, scrollRef }: AlphabetSidebarProps) {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
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

/* ─── Section Divider Logic ─── */

export const DIVIDER_SORT_OPTS = new Set([
  "artist-az", "artist-za", "title-az",
  "year-new", "year-old",
  "added-new", "added-old",
]);

export function getAlbumGroupLabel(album: Album, sortOption: string): string {
  switch (sortOption) {
    case "artist-az":
    case "artist-za": {
      const ch = (album.artist || "").charAt(0).toUpperCase();
      return /[A-Z]/.test(ch) ? ch : "#";
    }
    case "title-az": {
      const ch = (album.title || "").charAt(0).toUpperCase();
      return /[A-Z]/.test(ch) ? ch : "#";
    }
    case "year-new":
    case "year-old":
      return album.year ? String(album.year) : "—";
    case "added-new":
    case "added-old": {
      if (!album.dateAdded) return "—";
      const d = new Date(album.dateAdded);
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    default:
      return "";
  }
}

type GridRenderItem =
  | { kind: "divider"; label: string; firstAlbumIndex: number; isFirst: boolean }
  | { kind: "album"; album: Album; albumIndex: number };

/* ─── Album Grid ─── */

interface AlbumGridProps {
  albums: Album[];
}

export function AlbumGrid({ albums }: AlbumGridProps) {
  const { setSelectedAlbumId, setShowAlbumDetail, isDarkMode, hidePurgeIndicators, albums: allAlbums, activeFolder, searchQuery, neverPlayedFilter, rediscoverMode, setScreen, openSessionPicker, isAlbumInAnySession, sortOption } = useApp();
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();

  const hasFilters = activeFolder !== "All" || searchQuery.trim() !== "" || neverPlayedFilter || rediscoverMode;
  const collectionEmpty = allAlbums.length === 0;

  const alphabetEntries = useAlphabetIndex(albums, sortOption);
  const indexVisible = !!(alphabetEntries && alphabetEntries.length > 1);
  const anchorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchState = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  // Keep refs array in sync with album count
  if (anchorRefs.current.length !== albums.length) {
    anchorRefs.current = new Array(albums.length).fill(null);
  }

  // Build a set of album indices that are the first of their letter group (for anchors)
  const anchorIndices = useMemo(() => {
    if (!alphabetEntries) return new Set<number>();
    return new Set(alphabetEntries.map((e) => e.firstIndex));
  }, [alphabetEntries]);

  const hasDividers = DIVIDER_SORT_OPTS.has(sortOption);

  const renderItems = useMemo((): GridRenderItem[] => {
    if (!hasDividers) {
      return albums.map((album, albumIndex) => ({ kind: "album", album, albumIndex }));
    }
    const items: GridRenderItem[] = [];
    let currentLabel: string | null = null;
    let isFirst = true;
    albums.forEach((album, albumIndex) => {
      const label = getAlbumGroupLabel(album, sortOption);
      if (label !== currentLabel) {
        items.push({ kind: "divider", label, firstAlbumIndex: albumIndex, isFirst });
        currentLabel = label;
        isFirst = false;
      }
      items.push({ kind: "album", album, albumIndex });
    });
    return items;
  }, [albums, sortOption, hasDividers]);

  if (albums.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-[24px] pt-[48px] pb-[64px]">
        <div className="text-center">
          <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>No albums found</p>
          <p className="mt-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            {collectionEmpty
              ? "Head to Settings and sync your Discogs collection to get started."
              : hasFilters
              ? "Try adjusting your filters or clearing your search."
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

  const purgeColors: Record<string, string> = {
    keep: purgeIndicatorColor("keep", isDarkMode),
    cut: purgeIndicatorColor("cut", isDarkMode),
    maybe: purgeIndicatorColor("maybe", isDarkMode),
  };

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overlay-scroll" onScroll={onHeaderScroll}>
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 pl-[16px] pr-[32px] pt-[12px] pb-[112px] ${indexVisible ? "lg:pr-[24px]" : ""}`} style={{ paddingBottom: "calc(16px + var(--nav-clearance, 0px))" }}>
          {renderItems.map((item) => {
            if (item.kind === "divider") {
              return (
                <div
                  key={`divider-${item.label}`}
                  className="col-span-full"
                  style={{ paddingTop: item.isFirst ? 0 : 16, paddingBottom: 8 }}
                  ref={(el) => { anchorRefs.current[item.firstAlbumIndex] = el; }}
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
            const { album, albumIndex } = item;
            return (
            <div
              key={album.id}
              className="relative min-w-0"
              ref={!hasDividers && anchorIndices.has(albumIndex) ? (el) => { anchorRefs.current[albumIndex] = el; } : undefined}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedAlbumId(album.id); setShowAlbumDetail(true); } }}
                onTouchStart={(e) => { const t = e.touches[0]; touchState.current = { startX: t.clientX, startY: t.clientY, moved: false }; }}
                onTouchMove={(e) => { if (!touchState.current) return; const t = e.touches[0]; if (Math.abs(t.clientX - touchState.current.startX) > 6 || Math.abs(t.clientY - touchState.current.startY) > 6) touchState.current.moved = true; }}
                onTouchEnd={(e) => { if (touchState.current && !touchState.current.moved) { e.preventDefault(); setSelectedAlbumId(album.id); setShowAlbumDetail(true); } touchState.current = null; }}
                className="relative w-full min-w-0 rounded-[10px] overflow-hidden group focus:outline-none text-left tappable transition-all cursor-pointer"
                style={{
                  backgroundColor: "var(--c-surface)",
                  border: `1px solid ${isDarkMode ? "var(--c-border-strong)" : "#D1D8DF"}`,
                  boxShadow: "var(--c-card-shadow)",
                }}
              >
                {/* Cover art */}
                <div className="relative aspect-square overflow-hidden">
                  <img
                    src={album.cover}
                    alt={`${album.artist} - ${album.title}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    draggable={false}
                  />
                  {!hidePurgeIndicators && album.purgeTag && (
                    <div
                      className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full shadow-sm"
                      style={{ backgroundColor: purgeColors[album.purgeTag] || "transparent" }}
                    />
                  )}
                </div>

                {/* Metadata */}
                <div className="px-2.5 pt-2 pb-2.5 relative min-w-0 overflow-hidden">
                  <p
                    className="line-clamp-1"
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                      color: "var(--c-text)",
                      lineHeight: "1.25",
                    }}
                  >
                    {album.title}
                  </p>
                  <p
                    className="line-clamp-1 mt-[1px]"
                    style={{
                      fontSize: "12px",
                      fontWeight: 400,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      color: "var(--c-text-secondary)",
                      lineHeight: "1.3",
                    }}
                  >
                    {album.artist}
                  </p>
                  <span
                    className="block mt-[4px]"
                    style={{
                      fontSize: "11px",
                      fontWeight: 400,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      color: "var(--c-text-muted)",
                    }}
                  >
                    {album.year}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      overflow: "hidden",
                      minWidth: 0,
                      gap: "6px",
                      marginTop: "4px",
                    }}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        display: "inline-flex",
                        maxWidth: "calc(100% - 32px)",
                        overflow: "hidden",
                        flexShrink: 1,
                        minWidth: 0,
                        padding: "1px 6px",
                        fontSize: "10px",
                        fontWeight: 500,
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)",
                        color: isDarkMode ? "#ACDEF2" : "#00527A",
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
                    <button
                      onClick={(e) => { e.stopPropagation(); openSessionPicker(album.id); }}
                      className="flex-shrink-0 tappable transition-colors"
                      style={{
                        padding: "12px",
                        marginLeft: "auto",
                        marginRight: "-12px",
                        marginTop: "-12px",
                        marginBottom: "-12px",
                        color: isAlbumInAnySession(album.id)
                          ? (isDarkMode ? "#ACDEF2" : "#00527A")
                          : "var(--c-text-faint)",
                      }}
                    >
                      <Bookmark
                        size={14}
                        {...(isAlbumInAnySession(album.id) ? { fill: "currentColor" } : {})}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Alphabet index sidebar — mobile only */}
      {indexVisible && (
        <AlphabetSidebar entries={alphabetEntries!} anchorRefs={anchorRefs} scrollRef={scrollRef} />
      )}
    </>
  );
}