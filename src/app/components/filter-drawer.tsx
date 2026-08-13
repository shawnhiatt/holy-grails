import { useMemo } from "react";
import { useApp, type SortOption } from "./app-context";
import { hasRating } from "./discogs-api";
import { SlideOutPanel } from "./slide-out-panel";
import {
  FilterApplyButton,
  FilterChipButton,
  FilterResetButton,
  FilterSection,
  FilterSectionLabel,
  FilterSortList,
  presentMediaTypes,
} from "./filter-controls";

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

/** The count is passed in rather than derived here: the collection screen owns
 *  `searchQuery` (deliberately kept out of app context), and a count that
 *  ignored an active search would disagree with the grid behind the sheet. */
export function FilterDrawer({ matchCount }: { matchCount: number }) {
  const { setShowFilterDrawer, activeFolders, setActiveFolders, sortOption, setSortOption, isDarkMode, folders, neverPlayedFilter, setNeverPlayedFilter, playsRecordedFilter, setPlaysRecordedFilter, unratedFilter, setUnratedFilter, albums, formatFilter, setFormatFilter } = useApp();

  // The rating chips only make sense once something is rated — before the
  // free-data backfill reaches this user, every record reads unrated and an
  // "Unrated" filter that matches the whole collection is just noise.
  const hasAnyRatings = useMemo(() => albums.some((a) => hasRating(a.rating)), [albums]);

  // The Format section hides entirely for a single-type (all-vinyl) collection.
  const formatTypes = useMemo(() => presentMediaTypes(albums), [albums]);

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
        hasActiveFilters ? <FilterResetButton onClick={handleReset} /> : null
      }
      footer={<FilterApplyButton onClick={() => setShowFilterDrawer(false)} matchCount={matchCount} />}
      backdropZIndex={60}
      sheetZIndex={70}
      className="lg:bottom-auto lg:top-[72px] lg:left-1/2 lg:-translate-x-1/2 lg:right-auto lg:w-[480px] lg:rounded-[14px] lg:max-h-[calc(100dvh-100px)]"
    >
      <div className="p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
        <FilterSection title="Folders">
          {/* "All" is the absence of a selection, not a folder of its own —
              it clears rather than toggles. */}
          <FilterChipButton
            label="All"
            active={activeFolders.length === 0}
            onClick={() => setActiveFolders([])}
            isDarkMode={isDarkMode}
          />
          {folders.filter((f) => f.name !== "All").map((folder) => (
            <FilterChipButton
              key={folder.id}
              label={folder.name}
              active={activeFolders.includes(folder.name)}
              onClick={() => toggleFolder(folder.name)}
              isDarkMode={isDarkMode}
            />
          ))}
        </FilterSection>

        {/* Format — hidden for single-type (all-vinyl) collections */}
        {formatTypes.length > 1 && (
          <FilterSection title="Format">
            {formatTypes.map((t) => (
              <FilterChipButton
                key={t}
                label={t}
                active={formatFilter === t}
                onClick={() => setFormatFilter(formatFilter === t ? null : t)}
                isDarkMode={isDarkMode}
              />
            ))}
          </FilterSection>
        )}

        {/* Quick Filters */}
        <FilterSection title="Quick Filters">
          <FilterChipButton label="No Plays Recorded" active={neverPlayedFilter} onClick={toggleNeverPlayed} isDarkMode={isDarkMode} />
          <FilterChipButton label="Plays Recorded" active={playsRecordedFilter} onClick={togglePlaysRecorded} isDarkMode={isDarkMode} />
          {hasAnyRatings && (
            <FilterChipButton label="Unrated" active={unratedFilter} onClick={() => setUnratedFilter(!unratedFilter)} isDarkMode={isDarkMode} />
          )}
        </FilterSection>

        <div>
          <FilterSectionLabel>Sort By</FilterSectionLabel>
          <FilterSortList
            options={SORT_OPTIONS.filter((opt) => opt.value !== "rating-high" || hasAnyRatings)}
            value={sortOption}
            onChange={setSortOption}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>
    </SlideOutPanel>
  );
}
