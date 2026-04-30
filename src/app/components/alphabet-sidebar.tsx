import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import type { Album } from "./discogs-api";
import { useHaptic } from "@/hooks/useHaptic";

/* ─── Alphabet Index Sidebar (mobile only) ─── */

export interface LetterEntry {
  letter: string;
  firstIndex: number;
}

export function useAlphabetIndex(albums: Album[], sortOption: string) {
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

export function AlphabetSidebar({ entries, anchorRefs, scrollRef }: AlphabetSidebarProps) {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerHaptic = useHaptic('light');
  const activeLetterRef = useRef<string | null>(null);

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
      if (entry.letter !== activeLetterRef.current) {
        triggerHaptic();
        activeLetterRef.current = entry.letter;
      }
      setActiveLetter(entry.letter);
      scrollToLetter(entry, true);
    }
  }, [getEntryFromY, scrollToLetter, triggerHaptic]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const entry = getEntryFromY(touch.clientY);
    if (entry) {
      if (entry.letter !== activeLetterRef.current) {
        triggerHaptic();
        activeLetterRef.current = entry.letter;
      }
      setActiveLetter(entry.letter);
      scrollToLetter(entry);
    }
  }, [getEntryFromY, scrollToLetter, triggerHaptic]);

  const handleTouchEnd = useCallback(() => {
    fadeTimer.current = setTimeout(() => {
      setActiveLetter(null);
      activeLetterRef.current = null;
    }, 600);
  }, []);

  const handleLetterTap = useCallback((entry: LetterEntry) => {
    if (entry.letter !== activeLetterRef.current) {
      triggerHaptic();
      activeLetterRef.current = entry.letter;
    }
    setActiveLetter(entry.letter);
    scrollToLetter(entry, true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setActiveLetter(null);
      activeLetterRef.current = null;
    }, 600);
  }, [scrollToLetter, triggerHaptic]);

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
