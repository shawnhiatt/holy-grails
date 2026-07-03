import { useState, useCallback } from "react";
import { useApp } from "./app-context";
import { shuffle, pickRandom } from "../utils/shuffle";
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
  // Physical size — headers are the plain format name (see FORMAT SPOTLIGHT eyebrow)
  { patterns: ['7"', "7-inch"], header: "7-Inches", badge: '7"' },
  { patterns: ['10"', "10-inch"], header: "10-Inches", badge: '10"' },
  { patterns: ['12"', "12-inch"], header: "12-Inches", badge: '12"' },
  // Edition type
  { patterns: ["limited edition"], header: "Limited Editions", badge: "Limited Edition" },
  { patterns: ["promo"], header: "Promos", badge: "Promo" },
  { patterns: ["test pressing"], header: "Test Pressings", badge: "Test Pressing" },
  { patterns: ["advance"], header: "Advance Copies", badge: "Advance" },
  // Pressing type
  { patterns: ["picture disc"], header: "Picture Discs", badge: "Picture Disc" },
  { patterns: ["colored", "coloured"], header: "Colored Vinyl", badge: "Colored" },
  { patterns: ["etched"], header: "Etched Vinyl", badge: "Etched" },
  { patterns: ["flexi-disc", "flexi disc", "flexidisc"], header: "Flexi-Discs", badge: "Flexi-Disc" },
  // Obscure speed / format
  { patterns: ["45 rpm"], header: "45 RPMs", badge: "45 RPM" },
  { patterns: ["78 rpm"], header: "78 RPMs", badge: "78 RPM" },
  { patterns: ["mono"], header: "Mono Pressings", badge: "Mono" },
  { patterns: ["quadraphonic"], header: "Quadraphonic", badge: "Quadraphonic" },
];

function albumMatchesCategory(album: Album, category: FormatCategory): boolean {
  const fmt = album.format.toLowerCase();
  return category.patterns.some((p) => fmt.includes(p.toLowerCase()));
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
  const { albums, playCounts } = useApp();

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
    const pick = pickRandom(eligible);
    // Pick 3–4 random albums from that category
    const count = Math.min(pick.albums.length, Math.random() < 0.5 ? 3 : 4);
    const selected = shuffle(pick.albums).slice(0, count);

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
        <h3
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            color: "#EBFD00",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            textTransform: "uppercase",
            margin: 0,
            marginBottom: "4px",
          }}
        >
          Format Spotlight
        </h3>
        <h2
          style={{
            fontSize: "28px",
            fontWeight: 400,
            lineHeight: 1.4,
            color: "white",
            fontFamily: "'Rock Salt', cursive",
            margin: 0,
            marginBottom: "4px",
          }}
        >
          {spotlight.header}
        </h2>
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
                playCount={playCounts[String(album.release_id)] ?? 0}
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
              playCount={playCounts[String(album.release_id)] ?? 0}
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
