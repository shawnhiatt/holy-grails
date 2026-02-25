import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";
import { useApp, type SortOption } from "./app-context";
import { motion } from "motion/react";
import type React from "react";
import { X } from "lucide-react";

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
  const { setShowFilterDrawer, activeFolder, setActiveFolder, sortOption, setSortOption, isDarkMode, folders, neverPlayedFilter, setNeverPlayedFilter, rediscoverMode, setRediscoverMode, rediscoverAlbums } = useApp();

  const hasActiveFilters = activeFolder !== "All" || sortOption !== "artist-az" || neverPlayedFilter || rediscoverMode;

  const handleReset = () => {
    setActiveFolder("All");
    setSortOption("artist-az");
    setNeverPlayedFilter(false);
    setRediscoverMode(false);
  };

  // Filter drawer needs its own theme vars since it's a fixed overlay
  const vars = {
    "--c-surface": isDarkMode ? "#132B44" : "#FFFFFF",
    "--c-surface-hover": isDarkMode ? "#1A3350" : "#EFF1F3",
    "--c-text": isDarkMode ? "#E2E8F0" : "#0C284A",
    "--c-text-secondary": isDarkMode ? "#9EAFC2" : "#455B75",
    "--c-text-muted": isDarkMode ? "#7D92A8" : "#6B7B8E",
    "--c-border-strong": isDarkMode ? "#2D4A66" : "#74889C",
    "--c-border": isDarkMode ? "#1A3350" : "#D2D8DE",
    "--c-chip-bg": isDarkMode ? "#1A3350" : "#EFF1F3",
  } as React.CSSProperties;

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }} className="fixed inset-0 bg-black/25 z-[60]" onClick={() => setShowFilterDrawer(false)} />

      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
        className="fixed left-0 right-0 bottom-0 z-[70] rounded-t-[20px] overflow-hidden flex flex-col
          lg:bottom-auto lg:top-[72px] lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-[480px] lg:rounded-[14px] lg:max-h-[calc(100vh-100px)]"
        style={{
          ...vars,
          maxHeight: "calc(100vh - 58px)",
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
          backgroundColor: "var(--c-surface)",
          border: isDarkMode ? "1px solid var(--c-border-strong)" : undefined,
          boxShadow: isDarkMode ? "0 16px 48px rgba(0,0,0,0.3)" : "0 -8px 32px rgba(12,40,74,0.1)",
        }}
      >
        <div className="flex justify-center py-2 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: isDarkMode ? "#2D4A66" : "#D2D8DE" }} />
        </div>

        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--c-border-strong)" }}>
          <div className="flex items-center gap-3">
            <h3 style={{ fontSize: "16px", fontWeight: 600, fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", color: "var(--c-text)" }}>Filter Collection</h3>
            {hasActiveFilters && (
              <button
                onClick={handleReset}
                className="text-[#0078B4] hover:text-[#005F8E] transition-colors"
                style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif" }}
              >
                Reset
              </button>
            )}
          </div>
          <button onClick={() => setShowFilterDrawer(false)} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ color: "var(--c-text-muted)", border: "1px solid var(--c-border-strong)" }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
          <div className="mb-6">
            <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Folders</p>
            <div className="flex flex-wrap gap-2">
              {folders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => setActiveFolder(folder)}
                  className={`px-3 py-1.5 rounded-full transition-all ${
                    activeFolder === folder
                      ? ""
                      : ""
                  }`}
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
                  className={`px-3 py-2.5 rounded-[8px] text-left transition-colors ${
                    sortOption === opt.value
                      ? ""
                      : ""
                  }`}
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

        <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid var(--c-border-strong)" }}>
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
            Apply
          </button>
        </div>
      </motion.div>
    </>
  );
}