import React from "react";
import { useApp } from "./app-context";
import type { Album } from "./discogs-api";
import { purgeIndicatorColor } from "./purge-colors";
import { useSafeTap } from "../lib/use-safe-tap";

/** Minimal shape every artwork grid item must satisfy */
export interface ArtworkGridItem {
  id: string;
  title: string;
  artist: string;
  thumb?: string;
  cover: string;
}

interface AlbumArtworkProps<T extends ArtworkGridItem = Album> {
  /** Items to render. For backward compat, `albums` is also accepted. */
  items?: T[];
  albums?: Album[];
  /** Called when an item is tapped/clicked. Defaults to opening album detail. */
  onItemClick?: (item: T) => void;
  /** Render a custom indicator overlay (top-left / top-right). */
  renderIndicator?: (item: T) => React.ReactNode;
  /** Render a custom action in the hover overlay (bottom-right). Defaults to Bookmark. */
  renderAction?: (item: T) => React.ReactNode;
  /** Custom empty state message. */
  emptyMessage?: string;
  /** Custom empty state sub-message. */
  emptySubMessage?: string;
  /** Hide the scroll wrapper (when parent manages scrolling). */
  bare?: boolean;
}

/**
 * Shared artwork grid — 4 cols mobile, 8 cols desktop.
 * Uniform square cards filled with cover art. Metadata on hover/tap overlay.
 */
export function AlbumArtwork<T extends ArtworkGridItem = Album>(props: AlbumArtworkProps<T>) {
  const { setSelectedAlbumId, setShowAlbumDetail, hidePurgeIndicators, albums: allAlbums, isDarkMode, setScreen } = useApp();

  // Support both `items` and legacy `albums` prop
  const items = (props.items ?? props.albums ?? []) as T[];
  const isCollectionMode = !props.items && !!props.albums;

  const collectionEmpty = allAlbums.length === 0;

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="text-center">
          <p style={{ fontSize: "16px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            {props.emptyMessage ?? "No albums found"}
          </p>
          <p className="mt-1" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}>
            {props.emptySubMessage ?? (collectionEmpty
              ? "Head to Settings and sync your Discogs collection to get started."
              : "Try adjusting your filters")}
          </p>
          {collectionEmpty && isCollectionMode && (
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

  const handleClick = (item: T) => {
    if (props.onItemClick) {
      props.onItemClick(item);
    } else {
      setSelectedAlbumId(item.id);
      setShowAlbumDetail(true);
    }
  };

  const grid = (
    <div
      className="px-[16px] lg:px-[24px] pt-3 grid grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-[10px]"
      style={!props.bare ? { paddingBottom: "calc(16px + var(--nav-clearance, 0px))" } : undefined}
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          {...useSafeTap(() => handleClick(item))}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(item); } }}
          className="relative overflow-hidden group focus:outline-none cursor-pointer"
          style={{
            aspectRatio: "1 / 1",
            borderRadius: "10px",
            touchAction: "manipulation",
          }}
        >
          <img
            src={item.thumb || item.cover}
            alt={`${item.artist} - ${item.title}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            draggable={false}
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1" style={{ overflow: "hidden" }}>
                <p
                  className="text-white"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    lineHeight: "1.2",
                    fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitTextOverflow: "ellipsis",
                    maxWidth: "100%",
                  } as React.CSSProperties}
                >
                  {item.title}
                </p>
                <p
                  className="text-[rgba(255,255,255,0.75)]"
                  style={{
                    fontSize: "11px",
                    fontWeight: 400,
                    lineHeight: "1.3",
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitTextOverflow: "ellipsis",
                    maxWidth: "100%",
                  } as React.CSSProperties}
                >
                  {item.artist}
                </p>
              </div>
              {props.renderAction ? (
                props.renderAction(item)
              ) : null}
            </div>
          </div>
          {/* Custom indicator overlay */}
          {props.renderIndicator ? (
            props.renderIndicator(item)
          ) : isCollectionMode && !hidePurgeIndicators && (item as unknown as Album).purgeTag ? (
            <div
              className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full shadow-sm"
              style={{
                backgroundColor: purgeIndicatorColor((item as unknown as Album).purgeTag!, isDarkMode),
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );

  if (props.bare) {
    return grid;
  }

  return (
    <div className="flex-1 overflow-y-auto overlay-scroll">
      {grid}
    </div>
  );
}
