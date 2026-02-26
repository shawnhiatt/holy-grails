import { Bookmark } from "lucide-react";
import { useApp } from "./app-context";
import type { Album } from "./discogs-api";
import { useHideHeaderOnScroll } from "./use-hide-header";

interface AlbumArtworkProps {
  albums: Album[];
}

/**
 * 4-column artwork grid — uniform square cards filled with album art.
 * Metadata appears on hover/tap via an overlay. No text below cards.
 */

export function AlbumArtwork({ albums }: AlbumArtworkProps) {
  const { setSelectedAlbumId, setShowAlbumDetail, hidePurgeIndicators, albums: allAlbums, isDarkMode, setScreen, openSessionPicker, isAlbumInAnySession } = useApp();
  const { onScroll: onHeaderScroll } = useHideHeaderOnScroll();

  const collectionEmpty = allAlbums.length === 0;

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
    <div className="flex-1 overflow-y-auto overlay-scroll" onScroll={onHeaderScroll}>
      <div
        className="px-[16px] lg:px-[24px] pt-3 grid grid-cols-4 gap-2 lg:gap-[10px]"
        style={{ paddingBottom: "calc(16px + var(--nav-clearance, 0px))" }}
      >
        {albums.map((album) => (
          <div
            key={album.id}
            role="button"
            tabIndex={0}
            onClick={() => { setSelectedAlbumId(album.id); setShowAlbumDetail(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedAlbumId(album.id); setShowAlbumDetail(true); } }}
            className="relative overflow-hidden group focus:outline-none cursor-pointer"
            style={{
              aspectRatio: "1 / 1",
              borderRadius: "10px",
            }}
          >
            <img
              src={album.cover}
              alt={`${album.artist} - ${album.title}`}
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
                    {album.title}
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
                    {album.artist}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); openSessionPicker(album.id); }}
                  className="flex-shrink-0 tappable transition-colors"
                  style={{
                    padding: "12px",
                    margin: "-12px",
                    color: isAlbumInAnySession(album.id) ? "#ACDEF2" : "rgba(255,255,255,0.6)",
                  }}
                >
                  <Bookmark
                    size={14}
                    {...(isAlbumInAnySession(album.id) ? { fill: "currentColor" } : {})}
                  />
                </button>
              </div>
            </div>
            {/* Purge indicator */}
            {!hidePurgeIndicators && album.purgeTag && (
              <div
                className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full shadow-sm"
                style={{
                  backgroundColor: album.purgeTag === "keep" ? "#3E9842" : album.purgeTag === "cut" ? "#FF33B6" : "#D1E21A",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}