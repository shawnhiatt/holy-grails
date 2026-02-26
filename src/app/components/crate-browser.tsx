import { useState, useCallback, useMemo } from "react";
import { Search, SlidersHorizontal, List, Disc3, Grid2x2, Grid3x3, BarChart3, X, Compass } from "lucide-react";
import { useApp, type ViewMode } from "./app-context";
import { CrateFlip } from "./crate-flip";
import { AlbumList } from "./album-list";
import { AlbumGrid } from "./album-grid";
import { AlbumArtwork } from "./album-bento";
import { setReportEntryScreen } from "./reports-screen";
import { getCachedCollectionValue } from "./discogs-api";
import { NoDiscogsCard } from "./no-discogs-card";

const VIEW_MODES: { id: ViewMode; icon: typeof Disc3; label: string }[] = [
  { id: "grid", icon: Grid2x2, label: "Grid" },
  { id: "artwork", icon: Grid3x3, label: "Artwork Grid" },
  { id: "list", icon: List, label: "List" },
  { id: "crate", icon: Disc3, label: "Swiper" },
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
  const btnSize = compact ? "w-[26px] h-[26px]" : "w-[31px] h-[31px]";
  const iconSize = compact ? 15 : 18;
  const rounding = compact ? "rounded-[7.5px]" : "rounded-[9px]";
  const btnRounding = compact ? "rounded-[5.5px]" : "rounded-[7px]";
  const padding = compact ? "p-[4px]" : "p-[4.5px]";
  const gap = compact ? "gap-[2px]" : "gap-[2.2px]";
  const height = compact ? "h-[34px]" : "h-[40px]";

  return (
    <div
      className={`flex items-center ${gap} ${rounding} ${padding} ${height} shrink-0`}
      style={{ backgroundColor: "var(--c-surface)", border: compact ? "0.94px solid var(--c-border-strong)" : "1px solid var(--c-border-strong)" }}
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            title={mode.label}
            className={`${btnSize} ${btnRounding} flex items-center justify-center transition-all ${
              viewMode === mode.id
                ? "bg-[#ACDEF2] text-[#242A13]"
                : ""
            }`}
            style={viewMode !== mode.id ? { color: "var(--c-text-muted)" } : undefined}
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
    setScreen,
    albums,
    isDarkMode,
    neverPlayedFilter,
    setNeverPlayedFilter,
    rediscoverMode,
    setRediscoverMode,
    rediscoverAlbums,
    discogsToken,
  } = useApp();

  const [lightboxActive, setLightboxActive] = useState(false);

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
        <div className="flex items-center gap-[30px] px-[24px] py-[16px] w-full">
          <div className="flex-1 flex items-center">
            <h2 style={{ fontSize: "48px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Collection</h2>
          </div>
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
          {/* Reports icon */}
          <button
            onClick={() => { setReportEntryScreen("crate"); setScreen("reports"); }}
            title="Reports & Insights"
            className="w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors flex-shrink-0"
            style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <BarChart3 size={18} />
          </button>
        </div>
      </div>

      {/* ===== DESKTOP search/filter/view controls (gray content area) ===== */}
      <div className="hidden lg:flex items-center gap-[16px] px-[24px] py-[16px] flex-shrink-0">
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
        {/* Filter button + active filter chips — flex-1 */}
        <div className="flex-1 flex items-center gap-[16px] min-w-0">
          <button
            onClick={() => setShowFilterDrawer(true)}
            className="w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors relative flex-shrink-0"
            style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <SlidersHorizontal size={18} />
          </button>
          {hasActiveFilters && (
            <div className="flex items-center gap-[8px] shrink-0">
              {activeFolder !== "All" && <FilterChip label={activeFolder} onClear={() => setActiveFolder("All")} />}
              {sortOption !== "artist-az" && <FilterChip label={sortLabel[sortOption]} onClear={() => setSortOption("artist-az")} />}
              {neverPlayedFilter && <FilterChip label="Play Not Recorded" onClear={() => setNeverPlayedFilter(false)} />}
            </div>
          )}
        </div>
        {/* View toggle — right-aligned */}
        <div className="flex items-center justify-end">
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>

      {/* ===== MOBILE title bar ===== */}
      <div
        className="lg:hidden flex-shrink-0 px-[16px] pt-[8px] pb-[4px]"
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: "36px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", letterSpacing: "-0.5px", lineHeight: 1.25, color: "var(--c-text)" }}>Collection</h2>
          <button
            onClick={() => { setReportEntryScreen("crate"); setScreen("reports"); }}
            title="Reports & Insights"
            className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center transition-colors flex-shrink-0"
            style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <BarChart3 size={18} />
          </button>
        </div>
      </div>

      {/* ===== MOBILE search/filter/view controls (gray content area) ===== */}
      <div className="lg:hidden flex-shrink-0 px-[16px] py-[10px]" style={{ borderTop: "none" }}>
        <div className="flex items-center gap-[10px]">
          <div className="flex items-center gap-[8px] rounded-full px-[14.5px] min-w-0 flex-1" style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", height: "34px" }}>
            <Search size={16} style={{ color: "var(--c-border-strong)" }} className="flex-shrink-0" />
            <input
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
          <button
            onClick={() => setShowFilterDrawer(true)}
            className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center transition-colors relative flex-shrink-0"
            style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
          >
            <SlidersHorizontal size={18} />
          </button>
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} compact />
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
      {albums.length === 0 && !discogsToken ? (
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
          {viewMode === "artwork" && <AlbumArtwork key={`artwork|${activeFolder}|${sortOption}|${searchQuery}`} albums={filteredAlbums} />}
        </>
      )}
    </div>
  );
}