import { useMemo } from "react";
import { useApp, type SortOption } from "./app-context";
import { hasRating, mediaType, type MediaType } from "./discogs-api";
import { SlideOutPanel } from "./slide-out-panel";

// Display order for the Format section chips — common media first.
const MEDIA_TYPE_ORDER: MediaType[] = [
  "Vinyl", "CD", "Cassette", "Shellac", "Tape", "DVD", "Blu-ray", "Digital", "Box Set", "Other",
];

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
  { value: "rating-high", label: "Rating: Highest First" },
];

/** Chip fill. Selected carries a ring as well as a tint — the tint alone is
 *  nearly invisible against the dark chip background, and the collection
 *  screen's own filter chips already use this border treatment. */
function chipStyle(active: boolean, isDarkMode: boolean): React.CSSProperties {
  const base = { fontSize: "13px", fontWeight: 500 } as const;
  return active
    ? {
        ...base,
        backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)",
        color: isDarkMode ? "#ACDEF2" : "#00527A",
        border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.45)" : "#00527A"}`,
      }
    : {
        ...base,
        backgroundColor: isDarkMode ? "var(--c-chip-bg)" : "#EFF1F3",
        color: "var(--c-text-secondary)",
        border: "1px solid transparent",
      };
}

/** The count is passed in rather than derived here: the collection screen owns
 *  `searchQuery` (deliberately kept out of app context), and a count that
 *  ignored an active search would disagree with the grid behind the sheet. */
export function FilterDrawer({ matchCount }: { matchCount: number }) {
  const { setShowFilterDrawer, activeFolders, setActiveFolders, sortOption, setSortOption, isDarkMode, folders, neverPlayedFilter, setNeverPlayedFilter, playsRecordedFilter, setPlaysRecordedFilter, unratedFilter, setUnratedFilter, albums, formatFilter, setFormatFilter } = useApp();

  // The rating chips only make sense once something is rated — before the
  // free-data backfill reaches this user, every record reads unrated and an
  // "Unrated" filter that matches the whole collection is just noise.
  const hasAnyRatings = useMemo(() => albums.some((a) => hasRating(a.rating)), [albums]);

  // Media types actually present in the collection, in display order. The
  // Format section hides entirely for a single-type (all-vinyl) collection.
  const formatTypes = useMemo(() => {
    const present = new Set<MediaType>();
    for (const a of albums) present.add(mediaType(a.format));
    return MEDIA_TYPE_ORDER.filter((t) => present.has(t));
  }, [albums]);

  const hasActiveFilters = activeFolders.length > 0 || sortOption !== "artist-az" || neverPlayedFilter || playsRecordedFilter || unratedFilter || !!formatFilter;

  const handleReset = () => {
    setActiveFolders([]);
    setSortOption("artist-az");
    setNeverPlayedFilter(false);
    setPlaysRecordedFilter(false);
    setUnratedFilter(false);
    setFormatFilter(null);
  };

  const toggleFolder = (name: string) => {
    setActiveFolders(
      activeFolders.includes(name)
        ? activeFolders.filter((f) => f !== name)
        : [...activeFolders, name]
    );
  };

  /* "No Plays Recorded" and "Plays Recorded" partition the collection, so
     holding both on can only ever return nothing. Selecting one clears the
     other rather than letting the user build an empty result by hand. */
  const toggleNeverPlayed = () => {
    const next = !neverPlayedFilter;
    setNeverPlayedFilter(next);
    if (next) setPlaysRecordedFilter(false);
  };
  const togglePlaysRecorded = () => {
    const next = !playsRecordedFilter;
    setPlaysRecordedFilter(next);
    if (next) setNeverPlayedFilter(false);
  };

  return (
    <SlideOutPanel
      onClose={() => setShowFilterDrawer(false)}
      title="Filter Collection"
      headerAction={
        hasActiveFilters ? (
          <button
            onClick={handleReset}
            className="transition-colors"
            style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-link)" }}
          >
            Reset
          </button>
        ) : null
      }
      footer={
        /* Filters apply live — every chip writes straight to context and the
           grid behind the sheet is already filtered. So this button closes,
           and says what closing will show rather than claiming to apply. */
        <button
          onClick={() => setShowFilterDrawer(false)}
          className="w-full py-2.5 rounded-full transition-colors"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            backgroundColor: "#EBFD00",
            color: "#16181C",
            border: "1px solid rgba(22,24,28,0.25)",
          }}
        >
          {matchCount === 0
            ? "No releases match"
            : `Show ${matchCount} ${matchCount === 1 ? "release" : "releases"}`}
        </button>
      }
      backdropZIndex={60}
      sheetZIndex={70}
      className="lg:bottom-auto lg:top-[72px] lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-[480px] lg:rounded-[14px] lg:max-h-[calc(100dvh-100px)]"
    >
      <div className="p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <div className="mb-6">
          <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Folders</p>
          <div className="flex flex-wrap gap-2">
            {/* "All" is the absence of a selection, not a folder of its own —
                it clears rather than toggles. */}
            <button
              onClick={() => setActiveFolders([])}
              aria-pressed={activeFolders.length === 0}
              className="px-3 py-1.5 rounded-full transition-all"
              style={chipStyle(activeFolders.length === 0, isDarkMode)}
            >
              All
            </button>
            {folders.filter((f) => f.name !== "All").map((folder) => (
              <button
                key={folder.id}
                onClick={() => toggleFolder(folder.name)}
                aria-pressed={activeFolders.includes(folder.name)}
                className="px-3 py-1.5 rounded-full transition-all"
                style={chipStyle(activeFolders.includes(folder.name), isDarkMode)}
              >
                {folder.name}
              </button>
            ))}
          </div>
        </div>

        {/* Format — hidden for single-type (all-vinyl) collections */}
        {formatTypes.length > 1 && (
          <div className="mb-6">
            <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Format</p>
            <div className="flex flex-wrap gap-2">
              {formatTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setFormatFilter(formatFilter === t ? null : t)}
                  aria-pressed={formatFilter === t}
                  className="px-3 py-1.5 rounded-full transition-all"
                  style={chipStyle(formatFilter === t, isDarkMode)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Filters */}
        <div className="mb-6">
          <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Quick Filters</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={toggleNeverPlayed}
              aria-pressed={neverPlayedFilter}
              className="px-3 py-1.5 rounded-full transition-all"
              style={chipStyle(neverPlayedFilter, isDarkMode)}
            >
              No Plays Recorded
            </button>
            <button
              onClick={togglePlaysRecorded}
              aria-pressed={playsRecordedFilter}
              className="px-3 py-1.5 rounded-full transition-all"
              style={chipStyle(playsRecordedFilter, isDarkMode)}
            >
              Plays Recorded
            </button>
            {hasAnyRatings && (
              <button
                onClick={() => setUnratedFilter(!unratedFilter)}
                aria-pressed={unratedFilter}
                className="px-3 py-1.5 rounded-full transition-all"
                style={chipStyle(unratedFilter, isDarkMode)}
              >
                Unrated
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>Sort By</p>
          {/* Sort is one-of-many, unlike the chips above — radios, not toggles. */}
          <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Sort by">
            {SORT_OPTIONS.filter((opt) => opt.value !== "rating-high" || hasAnyRatings).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortOption(opt.value)}
                role="radio"
                aria-checked={sortOption === opt.value}
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
