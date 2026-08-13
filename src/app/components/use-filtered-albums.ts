import { useMemo } from "react";
import { hasRating, mediaType, type Album, type MediaType } from "./discogs-api";
import type { SortOption } from "./app-context";

/**
 * Collection filtering + sorting, owned by the screen that renders the
 * results. Search state deliberately lives in the screen (not app-context)
 * so a keystroke re-renders only the Collection screen, not every consumer
 * of the app context.
 *
 * While searching, results are always grouped/sorted by artist A→Z — the
 * chosen sortOption (and its Date Added grouping) resumes once search clears.
 */
export interface FilterAlbumsOptions {
  albums: Album[];
  /** Folders to include, OR'd together. Empty = no folder filter. A release
   *  lives in exactly one folder, so OR is the only sensible combinator —
   *  AND across two folders would always match nothing. */
  activeFolders: string[];
  searchQuery: string;
  neverPlayedFilter: boolean;
  playsRecordedFilter: boolean;
  /** Records the user has never rated. Expressed via hasRating, never as
   *  `rating < 1` — Discogs' 0 means unrated and is stripped at the mapper. */
  unratedFilter?: boolean;
  /** Single-select media-type filter (all-formats), null = all formats. */
  formatFilter?: MediaType | null;
  lastPlayed: Record<string, string>;
  effectiveSortOption: SortOption;
}

/** Epoch ms an album was added, or 0 when the row carries no usable date.
 *  The sync writes "" when Discogs omits `date_added`. */
function addedMs(a: Album): number {
  const t = new Date(a.dateAdded).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Pure filter + sort — the hook wraps this in useMemo. Exported for tests. */
export function filterAndSortAlbums(opts: FilterAlbumsOptions): Album[] {
  const { albums, activeFolders, searchQuery, neverPlayedFilter, playsRecordedFilter, unratedFilter, formatFilter, lastPlayed, effectiveSortOption } = opts;
  let result = [...albums];

  if (activeFolders.length > 0) {
    const wanted = new Set(activeFolders);
    result = result.filter((a) => wanted.has(a.folder));
  }

  if (formatFilter) {
    result = result.filter((a) => mediaType(a.format) === formatFilter);
  }

  if (neverPlayedFilter) {
    result = result.filter((a) => !lastPlayed[a.id]);
  }

  if (playsRecordedFilter) {
    result = result.filter((a) => !!lastPlayed[a.id]);
  }

  if (unratedFilter) {
    result = result.filter((a) => !hasRating(a.rating));
  }

  // Match on the TRIMMED query. Gating on `.trim()` while matching the raw
  // string meant a trailing space — which iOS autocorrect appends after every
  // completed word — matched nothing and read as "your collection is empty".
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (a) =>
        a.artist.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.label.toLowerCase().includes(q)
    );
  }

  switch (effectiveSortOption) {
    case "artist-az":
      result.sort((a, b) => a.artist.localeCompare(b.artist));
      break;
    case "artist-za":
      result.sort((a, b) => b.artist.localeCompare(a.artist));
      break;
    case "title-az":
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "year-new":
      result.sort((a, b) => b.year - a.year);
      break;
    case "year-old":
      // Unknown year (Discogs' 0) sorts last rather than leading "oldest
      // first" with a block of blank years. Matches the year-old rule in
      // convex/stackRules.ts, and the year-display convention generally.
      result.sort((a, b) => (a.year || Infinity) - (b.year || Infinity));
      break;
    case "added-new":
      // Missing dateAdded sinks. `new Date("")` is NaN, and a comparator that
      // returns NaN leaves the whole order implementation-defined.
      result.sort((a, b) => addedMs(b) - addedMs(a));
      break;
    case "added-old":
      result.sort(
        (a, b) =>
          (addedMs(a) || Infinity) - (addedMs(b) || Infinity)
      );
      break;
    case "label-az":
      result.sort((a, b) => a.label.localeCompare(b.label));
      break;
    case "rating-high":
      // Highest first, unrated last — an unrated record is not a zero-star
      // record, so it sorts to the bottom rather than competing with 1-stars.
      result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "last-played-oldest":
      result.sort((a, b) => {
        const aDate = lastPlayed[a.id] ? new Date(lastPlayed[a.id]).getTime() : 0;
        const bDate = lastPlayed[b.id] ? new Date(lastPlayed[b.id]).getTime() : 0;
        return aDate - bDate;
      });
      break;
  }

  return result;
}

export function useFilteredAlbums(opts: {
  albums: Album[];
  activeFolders: string[];
  sortOption: SortOption;
  searchQuery: string;
  neverPlayedFilter: boolean;
  playsRecordedFilter: boolean;
  unratedFilter?: boolean;
  formatFilter?: MediaType | null;
  lastPlayed: Record<string, string>;
}): { filteredAlbums: Album[]; effectiveSortOption: SortOption } {
  const { albums, activeFolders, sortOption, searchQuery, neverPlayedFilter, playsRecordedFilter, unratedFilter = false, formatFilter = null, lastPlayed } = opts;

  const effectiveSortOption: SortOption = searchQuery.trim() ? "artist-az" : sortOption;

  const filteredAlbums = useMemo(
    () => filterAndSortAlbums({ albums, activeFolders, searchQuery, neverPlayedFilter, playsRecordedFilter, unratedFilter, formatFilter, lastPlayed, effectiveSortOption }),
    [albums, activeFolders, searchQuery, effectiveSortOption, neverPlayedFilter, playsRecordedFilter, unratedFilter, formatFilter, lastPlayed]
  );

  return { filteredAlbums, effectiveSortOption };
}
