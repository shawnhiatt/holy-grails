import React from "react";
import type { ReactNode } from "react";
import { Play } from "lucide-react";
import type { Album } from "./discogs-api";
import { DominantColorCard } from "./dominant-color-card";
import { isScrollingRecently } from "../lib/scroll-state";

function formatAddedDate(iso: string): string {
  const d = new Date(iso);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `Added ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const truncStyle: React.CSSProperties = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  WebkitTextOverflow: "ellipsis" as string,
  maxWidth: "100%",
};

export interface DepthsAlbumCardProps {
  album: Album;
  onTap: (albumId: string) => void;
  /** Optional content rendered above the artwork (e.g. avatar row for followed users) */
  eyebrow?: ReactNode;
  /** Optional content rendered below metadata (e.g. "View their collection" link) */
  footer?: ReactNode;
  /** Optional content rendered as an overlay on the artwork (e.g. heart button) */
  overlay?: ReactNode;
  /** Override the date line text. Defaults to "Added [Month Year]" */
  dateLine?: string;
  /** If true, artwork has horizontal padding (used in following cards) */
  artworkPadded?: boolean;
  /** If true, only show title, artist, and date — hide year/label/folder meta line */
  compact?: boolean;
  /** If true, card background uses the dominant color extracted from the artwork */
  dominantColor?: boolean;
  /** Play count — renders a pill overlay on the artwork when >= 1 */
  playCount?: number;
}

export function DepthsAlbumCard({
  album,
  onTap,
  eyebrow,
  footer,
  overlay,
  dateLine,
  artworkPadded = false,
  compact = false,
  dominantColor = false,
  playCount,
}: DepthsAlbumCardProps) {
  const dateText = dateLine ?? formatAddedDate(album.dateAdded);
  const metaLine = [album.year, album.label, album.folder].filter(Boolean).join(" \u00B7 ");

  // When dominantColor is on, text colors reference --dc-* vars (with theme fallbacks)
  const textColor = dominantColor ? "var(--dc-text, var(--c-text))" : "var(--c-text)";
  const textSecondary = dominantColor ? "var(--dc-text-secondary, var(--c-text-secondary))" : "var(--c-text-secondary)";
  const textMuted = dominantColor ? "var(--dc-text-muted, var(--c-text-muted))" : "var(--c-text-muted)";

  const cardContent = (
    <>
      {eyebrow}

      {/* Album artwork */}
      <div className={artworkPadded ? "px-[12px]" : ""}>
        <div style={{
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          borderRadius: artworkPadded ? "8px" : "8px 8px 0 0",
          flexShrink: 0,
          position: "relative",
        }}>
          <img
            src={album.cover}
            alt={`${album.title} by ${album.artist}`}
            className="w-full h-full object-cover object-center block"
          />
          {overlay}
          {(playCount ?? 0) >= 1 && (
            <div
              className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
              style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
            >
              <Play size={9} fill="white" color="white" />
              <span style={{ fontSize: "10px", fontWeight: 600, color: "white", lineHeight: 1, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                {playCount}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div
        style={{
          padding: compact ? "6px 8px 0" : "12px 14px 0",
          paddingBottom: footer ? "0" : compact ? "8px" : "16px",
          display: "flex",
          flexDirection: "column",
          gap: compact ? "1px" : "3px",
          minWidth: 0,
        }}
      >
        {/* Title */}
        <p
          style={{
            fontSize: compact ? "13px" : "18px",
            fontWeight: compact ? 600 : 700,
            color: textColor,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            lineHeight: compact ? 1.25 : 1.3,
            ...truncStyle,
          } as React.CSSProperties}
        >
          {album.title}
        </p>
        {/* Artist */}
        <p
          style={{
            fontSize: compact ? "12px" : "14px",
            fontWeight: 400,
            color: textSecondary,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: compact ? 1.3 : 1.35,
            ...truncStyle,
          } as React.CSSProperties}
        >
          {album.artist}
        </p>
        {/* Year · Label · Folder (hidden in compact mode) */}
        {!compact && metaLine && (
          <p
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: textMuted,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              lineHeight: 1.35,
              ...truncStyle,
            } as React.CSSProperties}
          >
            {metaLine}
          </p>
        )}
        {/* Date line */}
        <p
          style={{
            fontSize: compact ? "11px" : "13px",
            fontWeight: 400,
            color: textMuted,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.35,
          }}
        >
          {dateText}
        </p>
      </div>

      {footer && (
        <div style={{ padding: "0 14px 12px" }}>
          {footer}
        </div>
      )}
    </>
  );

  if (dominantColor) {
    return (
      <DominantColorCard
        imageUrl={album.cover}
        className="cursor-pointer"
        onClick={() => { if (isScrollingRecently()) return; onTap(album.id); }}
        style={{ boxShadow: "var(--c-card-shadow)", touchAction: "manipulation" }}
      >
        {cardContent}
      </DominantColorCard>
    );
  }

  return (
    <div
      className="rounded-[12px] overflow-hidden cursor-pointer"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        boxShadow: "var(--c-card-shadow)",
        touchAction: "manipulation",
      }}
      onClick={() => { if (isScrollingRecently()) return; onTap(album.id); }}
    >
      {cardContent}
    </div>
  );
}