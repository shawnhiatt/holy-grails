import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Search, SlidersHorizontal, List, Grid2x2, Grid3x3, X, Compass } from "lucide-react";
import { useApp, type ViewMode } from "./app-context";
import { CrateFlip } from "./crate-flip";
import { AlbumList } from "./album-list";
import { AlbumGrid } from "./album-grid";
import { AlbumArtwork } from "./album-artwork-grid";

import { getCachedCollectionValue } from "./discogs-api";
import { NoDiscogsCard } from "./no-discogs-card";

const VIEW_MODES: { id: ViewMode; icon: typeof Grid2x2; label: string }[] = [
  { id: "grid", icon: Grid2x2, label: "Grid" },
  { id: "list", icon: List, label: "List" },
];

/** Shared view mode toggle pill (used in Collection + Wantlist) */
export function ViewModeToggle({
  viewMode,
  setViewMode,
  modes = VIEW_MODES,
  compact = false,
}: {
  viewMode: string;
  setViewMode: (v: ViewMode) => void;
  modes?: typeof VIEW_MODES;
  compact?: boolean;
}) {
  const btnSize = compact ? "w-[34px] h-[34px]" : "w-[40px] h-[40px]";
  const iconSize = 18;
  const height = compact ? "h-[34px]" : "h-[40px]";

  return (
    <div
      className={`flex items-center gap-[2px] rounded-[10px] ${height} shrink-0 overflow-hidden`}
      style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)" }}
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            title={mode.label}
            className={`${btnSize} flex items-center justify-center transition-all`}
            style={{
              backgroundColor: viewMode === mode.id ? "var(--c-surface-hover)" : undefined,
              color: "var(--c-text-muted)",
            }}
          >
            <Icon size={iconSize} />
          </button>
        );
      })}
    </div>
  );
}

export function CrateBrowser() {
  const {
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    filteredAlbums,
    setShowFilterDrawer,
    activeFolder,
    setActiveFolder,
    sortOption,
    setSortOption,
    albums,
    isDarkMode,
    neverPlayedFilter,
    setNeverPlayedFilter,
    rediscoverMode,
    setRediscoverMode,
    rediscoverAlbums,
    isAuthenticated,
  } = useApp();

  const [lightboxActive, setLightboxActive] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => mobileSearchRef.current?.focus();
    window.addEventListener("hg:focus-filter", handler);
    return () => window.removeEventListener("hg:focus-filter", handler);
  }, []);

  const gridModes = useMemo(() => [
    { id: viewMode === "grid3" ? "grid3" as ViewMode : "grid" as ViewMode, icon: viewMode === "grid3" ? Grid3x3 : Grid2x2, label: viewMode === "grid3" ? "Compact Grid" : "Grid" },
    { id: "list" as ViewMode, icon: List, label: "List" },
  ], [viewMode]);

  const handleSetViewMode = useCallback((v: ViewMode) => {
    if (v === "grid" || v === "grid3") {
      setViewMode(viewMode === "grid3" ? "grid" : "grid3");
    } else {
      setViewMode(v);
    }
  }, [viewMode, setViewMode]);

  const handleLightboxActivate = useCallback(() => {
    setLightboxActive(true);
  }, []);

  const handleLightboxDeactivate = useCallback(() => {
    setLightboxActive(false);
  }, []);

  const sortLabel: Record<string, string> = {
    "artist-az": "Artist A\u2192Z",
    "artist-za": "Artist Z\u2192A",
    "title-az": "Title A\u2192Z",
    "year-new": "Newest",
    "year-old": "Oldest",
    "added-new": "Recently Added",
    "added-old": "Oldest Added",
    "last-played-oldest": "Last Played",
  };

  // Collection value — sourced exclusively from fetchCollectionValue (Discogs collection/value API).
  // No per-album summation. Returns null if no sync has occurred yet.
  const collectionValue = getCachedCollectionValue();
  const valueEstimate = {
    low: collectionValue?.minimum ?? 0,
    median: collectionValue?.median ?? 0,
    high: collectionValue?.maximum ?? 0,
  };

  // Count recently added albums (last 30 days)
  const recentCount = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return albums.filter((a) => new Date(a.dateAdded).getTime() > thirtyDaysAgo).length;
  }, [albums]);

  const fmtVal = (n: number) =>
    "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hasActiveFilters = activeFolder !== "All" || sortOption !== "artist-az" || neverPlayedFilter || rediscoverMode;

  // Shared filter chip component
  const FilterChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <button
      onClick={onClear}
      className="flex items-center gap-1.5 rounded-full tappable transition-colors shrink-0"
      style={{
        fontSize: "12px",
        fontWeight: 500,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        backgroundColor: isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.5)",
        color: isDarkMode ? "#ACDEF2" : "var(--c-text-secondary)",
        border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.3)" : "var(--c-border-strong)"}`,
        height: "24px",
        paddingLeft: "10px",
        paddingRight: "8px",
      }}
    >
      {label}
      <X size={11} style={{ color: isDarkMode ? "rgba(172,222,242,0.5)" : "#74889C" }} />
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      {/* ===== DESKTOP title bar (white bg + border) ===== */}
      <div
        className="hidden lg:flex flex-shrink-0"
      >
        <div className="flex items-center gap-[30px] px-[24px] pt-[8px] pb-[20px] w-full">
          <div className="flex-1 flex flex-col items-end justify-center gap-[4px]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: "18px", textAlign: "right", color: isDarkMode ? "#9EAFC2" : "#3D5C77" }}>
            {albums.length > 0 ? (
            <>
            <p>
              {recentCount > 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: "#009A32" }}>+{recentCount}</span>
                  {" "}albums in the last 30 days
                </>
              ) : recentCount < 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: isDarkMode ? "#617489" : "#9BA4B2" }}>{recentCount}</span>
                  {" "}albums in the last 30 days
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600, color: isDarkMode ? "#617489" : "#9BA4B2" }}>0</span>
                  {" "}new albums in the last 30 days
                </>
              )}
            </p>
            <p style={{ fontSize: "14px", fontWeight: 400, color: isDarkMode ? "#9EAFC2" : "#3D5C77" }}>
              Est. value{" "}
              <span style={{ fontWeight: 600, color: "#009A32" }}>{fmtVal(valueEstimate.median)}</span>
              {" "}
              <span style={{ fontWeight: 400, whiteSpace: "nowrap" }}>({fmtVal(valueEstimate.low)} – {fmtVal(valueEstimate.high)})</span>
            </p>
            </>
            ) : (
              <p style={{ fontSize: "13px", fontWeight: 400, color: isDarkMode ? "#617489" : "#9BA4B2" }}>No collection synced</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== DESKTOP search/filter/view controls (gray content area) ===== */}
      <div className="hidden lg:flex items-center gap-[16px] px-[24px] pt-[8px] pb-[16px] flex-shrink-0">
        {/* Search field — flex-1 */}
        <div className="flex-1 flex items-center gap-2 rounded-full px-[15px] min-w-0" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "39px" }}>
          <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
          <input
            type="text"
            placeholder="Search artist, title, or label"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none border-none min-w-0"
            style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="transition-colors" style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>×</button>
          )}
        </div>
        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-[8px] shrink-0">
            {activeFolder !== "All" && <FilterChip label={activeFolder} onClear={() => setActiveFolder("All")} />}
            {sortOption !== "artist-az" && <FilterChip label={sortLabel[sortOption]} onClear={() => setSortOption("artist-az")} />}
            {neverPlayedFilter && <FilterChip label="Play Not Recorded" onClear={() => setNeverPlayedFilter(false)} />}
          </div>
        )}
        {/* View toggle */}
        <ViewModeToggle viewMode={viewMode} setViewMode={handleSetViewMode} modes={gridModes} />
        {/* Filter button */}
        <button
          onClick={() => setShowFilterDrawer(true)}
          className="w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors relative flex-shrink-0"
          style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>

      {/* ===== MOBILE search/filter/view controls (gray content area) ===== */}
      <div className="lg:hidden flex-shrink-0 px-[16px] pt-[2px] pb-[8px]" style={{ borderTop: "none" }}>
        <div className="flex items-center gap-[10px]">
          <div className="flex items-center gap-[8px] rounded-full px-[14.5px] min-w-0 flex-1" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "34px" }}>
            <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
            <input
              ref={mobileSearchRef}
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none border-none min-w-0"
              style={{ fontSize: "16px", fontWeight: 400, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-text)" }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="transition-colors" style={{ fontSize: "18px", lineHeight: 1, color: "var(--c-text-muted)" }}>×</button>
            )}
          </div>
          <ViewModeToggle viewMode={viewMode} setViewMode={handleSetViewMode} modes={gridModes} compact />
          <button
            onClick={() => setShowFilterDrawer(true)}
            className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors relative flex-shrink-0"
            style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {/* Active filter chips (mobile) */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mt-[8px] overflow-x-auto">
            {activeFolder !== "All" && <FilterChip label={activeFolder} onClear={() => setActiveFolder("All")} />}
            {sortOption !== "artist-az" && <FilterChip label={sortLabel[sortOption]} onClear={() => setSortOption("artist-az")} />}
            {neverPlayedFilter && <FilterChip label="Play Not Recorded" onClear={() => setNeverPlayedFilter(false)} />}
          </div>
        )}
      </div>

      {/* Content */}
      {albums.length === 0 && !isAuthenticated ? (
        <NoDiscogsCard
          heading="No albums found."
          subtext="Connect your Discogs collection to start browsing your crate."
        />
      ) : rediscoverMode ? (
        <div className="flex flex-col h-full flex-1 overflow-hidden">
          {/* Rediscover header */}
          <div className="flex items-center justify-between px-[16px] lg:px-[24px] py-3 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <Compass size={18} style={{ color: isDarkMode ? "#ACDEF2" : "#00527A" }} />
              <p style={{
                fontSize: "15px",
                fontWeight: 600,
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                color: isDarkMode ? "#ACDEF2" : "#00527A",
              }}>
                Rediscover
              </p>
              <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--c-text-muted)" }}>
                {rediscoverAlbums.length} albums waiting
              </span>
            </div>
            <button
              onClick={() => setRediscoverMode(false)}
              className="px-3 py-1.5 rounded-full transition-colors"
              style={{
                fontSize: "12px",
                fontWeight: 500,
                backgroundColor: isDarkMode ? "rgba(172,222,242,0.12)" : "rgba(172,222,242,0.3)",
                color: isDarkMode ? "#ACDEF2" : "#00527A",
              }}
            >
              Exit
            </button>
          </div>
          <p className="px-[16px] lg:px-[24px] -mt-1 mb-2" style={{
            fontSize: "12px",
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--c-text-muted)",
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            Records waiting for their moment.
          </p>
          {rediscoverAlbums.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-8">
              <div className="text-center">
                <p style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                  color: "var(--c-text)",
                  lineHeight: 1.4,
                }}>
                  Your whole collection is getting love. Rare and impressive.
                </p>
                <p className="mt-2" style={{ fontSize: "14px", fontWeight: 400, color: "var(--c-text-muted)" }}></p>
              </div>
            </div>
          ) : viewMode === "crate" ? (
            <CrateFlip
              key="rediscover"
              albums={rediscoverAlbums}
              lightboxActive={lightboxActive}
              onLightboxActivate={handleLightboxActivate}
              onLightboxDeactivate={handleLightboxDeactivate}
            />
          ) : viewMode === "list" ? (
            <AlbumList key="rediscover-list" albums={rediscoverAlbums} />
          ) : viewMode === "grid" ? (
            <AlbumGrid key="rediscover-grid" albums={rediscoverAlbums} />
          ) : (
            <AlbumArtwork key="rediscover-artwork" albums={rediscoverAlbums} />
          )}
        </div>
      ) : (
        <>
          {viewMode === "crate" && (
            <CrateFlip
              key={`crate|${activeFolder}|${sortOption}|${searchQuery}`}
              albums={filteredAlbums}
              lightboxActive={lightboxActive}
              onLightboxActivate={handleLightboxActivate}
              onLightboxDeactivate={handleLightboxDeactivate}
            />
          )}
          {viewMode === "list" && <AlbumList key={`list|${activeFolder}|${sortOption}|${searchQuery}`} albums={filteredAlbums} />}
          {viewMode === "grid" && <AlbumGrid key={`grid|${activeFolder}|${sortOption}|${searchQuery}`} albums={filteredAlbums} />}
          {viewMode === "grid3" && <AlbumGrid key={`grid3|${activeFolder}|${sortOption}|${searchQuery}`} albums={filteredAlbums} />}
          {viewMode === "artwork" && <AlbumArtwork key={`artwork|${activeFolder}|${sortOption}|${searchQuery}`} albums={filteredAlbums} />}
        </>
      )}
    </div>
  );
}