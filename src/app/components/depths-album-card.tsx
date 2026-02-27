import React from "react";
import type { ReactNode } from "react";
import type { Album } from "./discogs-api";

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
  /** Optional content rendered above the artwork (e.g. avatar row for friends) */
  eyebrow?: ReactNode;
  /** Optional content rendered below metadata (e.g. "View their collection" link) */
  footer?: ReactNode;
  /** Override the date line text. Defaults to "Added [Month Year]" */
  dateLine?: string;
  /** If true, artwork has horizontal padding (used in friends cards) */
  artworkPadded?: boolean;
}

export function DepthsAlbumCard({
  album,
  onTap,
  eyebrow,
  footer,
  dateLine,
  artworkPadded = false,
}: DepthsAlbumCardProps) {
  const dateText = dateLine ?? formatAddedDate(album.dateAdded);
  const metaLine = [album.year, album.label, album.folder].filter(Boolean).join(" \u00B7 ");

  return (
    <div
      className="rounded-[12px] overflow-hidden cursor-pointer"
      style={{
        backgroundColor: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        boxShadow: "var(--c-card-shadow)",
      }}
      onClick={() => onTap(album.id)}
    >
      {eyebrow}

      {/* Album artwork */}
      <div className={artworkPadded ? "px-[12px]" : ""}>
        <div style={{
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          borderRadius: artworkPadded ? "8px" : "8px 8px 0 0",
          flexShrink: 0,
        }}>
          <img
            src={album.cover}
            alt={`${album.title} by ${album.artist}`}
            className="w-full h-full object-cover object-center block"
          />
        </div>
      </div>

      {/* Metadata */}
      <div
        style={{
          padding: "12px 14px 0",
          paddingBottom: footer ? "0" : "16px",
          display: "flex",
          flexDirection: "column",
          gap: "3px",
          minWidth: 0,
        }}
      >
        {/* Title */}
        <p
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--c-text)",
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            lineHeight: 1.3,
            ...truncStyle,
          } as React.CSSProperties}
        >
          {album.title}
        </p>
        {/* Artist */}
        <p
          style={{
            fontSize: "14px",
            fontWeight: 400,
            color: "var(--c-text-secondary)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.35,
            ...truncStyle,
          } as React.CSSProperties}
        >
          {album.artist}
        </p>
        {/* Year · Label · Folder */}
        {metaLine && (
          <p
            style={{
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--c-text-muted)",
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
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--c-text-muted)",
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
    </div>
  );
}