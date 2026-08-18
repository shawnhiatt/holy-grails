import { useState, useCallback } from "react";
import { useApp } from "./app-context";
import { shuffle, pickRandom } from "../utils/shuffle";
import { mediaType, type Album, type MediaType } from "./discogs-api";
import { ShuffleAlbumCard } from "./shuffle-album-card";
import { WantlistHeartButton } from "./wantlist-heart-button";

/* ─── Format category definitions ─── */

interface FormatCategory {
  /** Substring patterns to look for in Album.format (case-insensitive).
   *  Used for vinyl descriptors, which are safe as substrings. */
  patterns?: string[];
  /** Media-type match (all-formats). Classifies via mediaType() instead of a
   *  substring so e.g. "CD" never false-positives inside another word. */
  media?: MediaType;
  /** Human-readable section header */
  header: string;
  /** Badge label shown on each card */
  badge: string;
}

const FORMAT_CATEGORIES: FormatCategory[] = [
  // Media types (all-formats) — classified via mediaType, not substring
  { media: "CD", header: "CDs", badge: "CD" },
  { media: "Cassette", header: "Cassettes", badge: "Cassette" },
  { media: "Shellac", header: "78s & Shellac", badge: "Shellac" },
  // Physical size — headers are the plain format name (see FORMAT SPOTLIGHT eyebrow)
  { patterns: ['7"', "7-inch"], header: "7-Inches", badge: '7"' },
  { patterns: ['10"', "10-inch"], header: "10-Inches", badge: '10"' },
  { patterns: ['12"', "12-inch"], header: "12-Inches", badge: '12"' },
  // Edition type
  { patterns: ["limited edition"], header: "Limited Editions", badge: "Limited Edition" },
  { patterns: ["promo"], header: "Promos", badge: "Promo" },
  { patterns: ["test pressing"], header: "Test Pressings", badge: "Test Pressing" },
  { patterns: ["advance"], header: "Advance Copies", badge: "Advance" },
  { patterns: ["box set"], header: "Box Sets", badge: "Box Set" },
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
  if (category.media) return mediaType(album.format) === category.media;
  const fmt = album.format.toLowerCase();
  return (category.patterns ?? []).some((p) => fmt.includes(p.toLowerCase()));
}

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
    // Up to 6 — one full desktop row. The old 3-or-4 coin flip existed to fill
    // a repeat(albums.length) grid that stretched to the full width; with a
    // fixed 6-column grid the variation only left the row half empty. Category
    // eligibility stays at 3, so a thin category still shows correctly-sized
    // cards in a short row rather than a few oversized ones.
    // NOTE: this pool is shared with the mobile scroller, which slices back to
    // 4 — raising it for the desktop row must not lengthen the mobile section.
    const selected = shuffle(pick.albums).slice(0, Math.min(pick.albums.length, 6));

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
            color: "var(--c-accent-yellow)",
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
            color: "var(--c-text)",
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
          {spotlight.albums.slice(0, 4).map((album) => (
            <div
              key={`format-spot-${album.id}`}
              style={{
                flex: "0 0 82%",
                scrollSnapAlign: "start",
                minWidth: 0,
              }}
            >
              <ShuffleAlbumCard
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

      {/* Desktop: static grid — 6 across, matching Recently Added / On the Hunt.
          repeat(albums.length) stretched 3-4 cards over the full width, which
          made a minor section the largest artwork on the screen. */}
      <div className="hidden lg:block">
        <div
          className="grid grid-cols-6"
          style={{ gap: "12px" }}
        >
          {spotlight.albums.map((album) => (
            <ShuffleAlbumCard
              key={`format-spot-desk-${album.id}`}
              album={album}
              onTap={handleTap}
              compact
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
