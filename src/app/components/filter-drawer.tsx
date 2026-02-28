import { useApp, type SortOption } from "./app-context";
import { SlideOutPanel } from "./slide-out-panel";

/* Bottom sheet safe area standard:
   - Outer container bottom: 0, paddingBottom: env(safe-area-inset-bottom, 16px)
   - Inner scroll content paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 80px)
   - Ensures no gap on notched iOS devices in PWA mode */

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "artist-az", label: "Artist A\u2192Z" },
  { value: "artist-za", label: "Artist Z\u2192A" },
  { value: "title-az", label: "Title A\u2192Z" },
  { value: "year-new", label: "Year: Newest First" },
  { value: "year-old", label: "Year: Oldest First" },
  { value: "added-new", label: "Date Added: Newest" },
  { value: "added-old", label: "Date Added: Oldest" },
  { value: "last-played-oldest", label: "Last Played: Oldest First" },
];

export function FilterDrawer() {
  const { setShowFilterDrawer, activeFolder, setActiveFolder, sortOption, setSortOption, isDarkMode, folders, neverPlayedFilter, setNeverPlayedFilter, rediscoverMode, setRediscoverMode } = useApp();

  const hasActiveFilters = activeFolder !== "All" || sortOption !== "artist-az" || neverPlayedFilter || rediscoverMode;

  const handleReset = () => {
    setActiveFolder("All");
    setSortOption("artist-az");
    setNeverPlayedFilter(false);
    setRediscoverMode(false);
  };

  return (
    <SlideOutPanel
      onClose={() => setShowFilterDrawer(false)}
      title="Filter Collection"
      headerAction={
        hasActiveFilters ? (
          <button
            onClick={handleReset}
            className="text-[#0078B4] hover:text-[#005F8E] transition-colors"
            style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif" }}
          >
            Reset
          </button>
        ) : null
      }
      footer={
        <button
          onClick={() => setShowFilterDrawer(false)}
          className="w-full py-2.5 rounded-full transition-colors"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: "#EBFD00",
            color: "#0C284A",
            border: "1px solid rgba(12,40,74,0.25)",
          }}
        >
          Apply Filters
        </button>
      }
      backdropZIndex={60}
      sheetZIndex={70}
      className="lg:bottom-auto lg:top-[72px] lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-[480px] lg:rounded-[14px] lg:max-h-[calc(100vh-100px)]"
    >
      <div className="p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <div className="mb-6">
          <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Folders</p>
          <div className="flex flex-wrap gap-2">
            {folders.map((folder) => (
              <button
                key={folder}
                onClick={() => setActiveFolder(folder)}
                className="px-3 py-1.5 rounded-full transition-all"
                style={activeFolder !== folder
                  ? { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "var(--c-chip-bg)" : "#EFF1F3", color: "var(--c-text-secondary)" }
                  : { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
                }
              >
                {folder}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Filters */}
        <div className="mb-6">
          <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Quick Filters</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setNeverPlayedFilter(!neverPlayedFilter)}
              className="px-3 py-1.5 rounded-full transition-all"
              style={!neverPlayedFilter
                ? { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "var(--c-chip-bg)" : "#EFF1F3", color: "var(--c-text-secondary)" }
                : { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
              }
            >
              Play Not Recorded
            </button>
            <button
              onClick={() => setRediscoverMode(!rediscoverMode)}
              className="px-3 py-1.5 rounded-full transition-all"
              style={!rediscoverMode
                ? { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "var(--c-chip-bg)" : "#EFF1F3", color: "var(--c-text-secondary)" }
                : { fontSize: "13px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
              }
            >
              Rediscover
            </button>
          </div>
        </div>

        <div>
          <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Sort By</p>
          <div className="flex flex-col gap-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortOption(opt.value)}
                className="px-3 py-2.5 rounded-[8px] text-left transition-colors"
                style={sortOption !== opt.value
                  ? { fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }
                  : { fontSize: "14px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </SlideOutPanel>
  );
}
