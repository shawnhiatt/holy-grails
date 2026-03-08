import { useState, useCallback } from "react";
import { useApp } from "./app-context";
import type { Album } from "./discogs-api";
import { DepthsAlbumCard } from "./depths-album-card";
import { WantlistHeartButton } from "./wantlist-heart-button";

/* ─── Format category definitions ─── */

interface FormatCategory {
  /** Match strings to look for in the Album.format field (case-insensitive) */
  patterns: string[];
  /** Human-readable section header */
  header: string;
  /** Badge label shown on each card */
  badge: string;
}

const FORMAT_CATEGORIES: FormatCategory[] = [
  // Physical size
  { patterns: ['7"', "7-inch"], header: "Your 7-Inch Records", badge: '7"' },
  { patterns: ['10"', "10-inch"], header: "Your 10-Inch Records", badge: '10"' },
  { patterns: ['12"', "12-inch"], header: "Your 12-Inch Records", badge: '12"' },
  // Edition type
  { patterns: ["limited edition"], header: "Limited Editions", badge: "Limited Edition" },
  { patterns: ["promo"], header: "Promos in Your Collection", badge: "Promo" },
  { patterns: ["test pressing"], header: "Test Pressings", badge: "Test Pressing" },
  { patterns: ["advance"], header: "Advance Pressings", badge: "Advance" },
  // Pressing type
  { patterns: ["picture disc"], header: "Picture Discs", badge: "Picture Disc" },
  { patterns: ["colored", "coloured"], header: "Colored Pressings", badge: "Colored" },
  { patterns: ["etched"], header: "Etched Vinyl", badge: "Etched" },
  { patterns: ["flexi-disc", "flexi disc", "flexidisc"], header: "Flexi-Discs", badge: "Flexi-Disc" },
  // Obscure speed / format
  { patterns: ["45 rpm"], header: "Your 45s", badge: "45 RPM" },
  { patterns: ["78 rpm"], header: "Your 78s", badge: "78 RPM" },
  { patterns: ["mono"], header: "Mono Pressings", badge: "Mono" },
  { patterns: ["quadraphonic"], header: "Quadraphonic Records", badge: "Quadraphonic" },
];

function albumMatchesCategory(album: Album, category: FormatCategory): boolean {
  const fmt = album.format.toLowerCase();
  return category.patterns.some((p) => fmt.includes(p.toLowerCase()));
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/* ─── Section title style (matches feed-screen.tsx) ─── */

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  letterSpacing: "-0.3px",
  lineHeight: 1.2,
  color: "var(--c-text)",
  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
  margin: 0,
};

/* ─── Component ─── */

interface FormatSpotlightProps {
  onAlbumTap: (albumId: string) => void;
}

export function FormatSpotlight({ onAlbumTap }: FormatSpotlightProps) {
  const { albums } = useApp();

  // Compute once on mount — does not re-randomize during session
  const [spotlight] = useState(() => {
    if (albums.length === 0) return null;

    // Build eligible categories (3+ matching albums)
    const eligible: { category: FormatCategory; albums: Album[] }[] = [];
    for (const cat of FORMAT_CATEGORIES) {
      const matching = albums.filter((a) => albumMatchesCategory(a, cat));
      if (matching.length >= 3) {
        eligible.push({ category: cat, albums: matching });
      }
    }

    if (eligible.length === 0) return null;

    // Pick a random category
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    // Pick 3–4 random albums from that category
    const count = Math.min(pick.albums.length, Math.random() < 0.5 ? 3 : 4);
    const selected = shuffleArray(pick.albums).slice(0, count);

    return { header: pick.category.header, badge: pick.category.badge, albums: selected };
  });

  const handleTap = useCallback(
    (albumId: string) => onAlbumTap(albumId),
    [onAlbumTap]
  );

  if (!spotlight) return null;

  return (
    <div>
      {/* Section header */}
      <div className="px-[16px] lg:px-0 mb-[10px]">
        <h2 style={sectionTitleStyle}>{spotlight.header}</h2>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--c-text-secondary)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            marginTop: "2px",
            lineHeight: 1.4,
          }}
        >
          A format spotlight from your collection.
        </p>
      </div>

      {/* Mobile: horizontal swipeable carousel */}
      <div className="lg:hidden">
        <style>{`.format-spotlight-scroll::-webkit-scrollbar { display: none; }`}</style>
        <div
          className="format-spotlight-scroll"
          style={{
            display: "flex",
            flexDirection: "row",
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            gap: "12px",
            paddingLeft: "16px",
            scrollPaddingLeft: "16px",
            paddingBottom: "4px",
          }}
        >
          {spotlight.albums.map((album) => (
            <div
              key={`format-spot-${album.id}`}
              style={{
                flex: "0 0 82%",
                scrollSnapAlign: "start",
                minWidth: 0,
              }}
            >
              <DepthsAlbumCard
                album={album}
                onTap={handleTap}
                dominantColor
                overlay={
                  <WantlistHeartButton
                    releaseId={album.release_id}
                    masterId={album.master_id}
                    title={album.title}
                    artist={album.artist}
                    cover={album.cover}
                    thumb={album.thumb}
                    year={album.year}
                    label={album.label}
                    variant="overlay"
                  />
                }
                footer={
                  <FormatBadge label={spotlight.badge} />
                }
              />
            </div>
          ))}
          {/* Spacer div to enforce right padding in scroll container */}
          <div style={{ minWidth: "16px", flexShrink: 0 }} />
        </div>
      </div>

      {/* Desktop: static grid */}
      <div className="hidden lg:block">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${spotlight.albums.length}, 1fr)`,
            gap: "16px",
          }}
        >
          {spotlight.albums.map((album) => (
            <DepthsAlbumCard
              key={`format-spot-desk-${album.id}`}
              album={album}
              onTap={handleTap}
              dominantColor
              overlay={
                <WantlistHeartButton
                  releaseId={album.release_id}
                  masterId={album.master_id}
                  title={album.title}
                  artist={album.artist}
                  cover={album.cover}
                  thumb={album.thumb}
                  year={album.year}
                  label={album.label}
                  variant="overlay"
                />
              }
              footer={
                <FormatBadge label={spotlight.badge} />
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Format Badge ─── */

function FormatBadge({ label }: { label: string }) {
  return (
    <div style={{ paddingTop: "6px" }}>
      <span
        className="rounded-full"
        style={{
          display: "inline-block",
          fontSize: "11px",
          fontWeight: 500,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          backgroundColor: "var(--c-chip-bg)",
          color: "var(--c-text-tertiary)",
          padding: "3px 10px",
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
    </div>
  );
}
