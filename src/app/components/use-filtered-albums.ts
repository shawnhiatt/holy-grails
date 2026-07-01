import { useMemo } from "react";
import type { Album } from "./discogs-api";
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
export function useFilteredAlbums(opts: {
  albums: Album[];
  activeFolder: string;
  sortOption: SortOption;
  searchQuery: string;
  neverPlayedFilter: boolean;
  playsRecordedFilter: boolean;
  lastPlayed: Record<string, string>;
}): { filteredAlbums: Album[]; effectiveSortOption: SortOption } {
  const { albums, activeFolder, sortOption, searchQuery, neverPlayedFilter, playsRecordedFilter, lastPlayed } = opts;

  const effectiveSortOption: SortOption = searchQuery.trim() ? "artist-az" : sortOption;

  const filteredAlbums = useMemo(() => {
    let result = [...albums];

    if (activeFolder !== "All") {
      result = result.filter((a) => a.folder === activeFolder);
    }

    if (neverPlayedFilter) {
      result = result.filter((a) => !lastPlayed[a.id]);
    }

    if (playsRecordedFilter) {
      result = result.filter((a) => !!lastPlayed[a.id]);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
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
        result.sort((a, b) => a.year - b.year);
        break;
      case "added-new":
        result.sort(
          (a, b) =>
            new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
        );
        break;
      case "added-old":
        result.sort(
          (a, b) =>
            new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
        );
        break;
      case "label-az":
        result.sort((a, b) => a.label.localeCompare(b.label));
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
  }, [albums, activeFolder, searchQuery, effectiveSortOption, neverPlayedFilter, playsRecordedFilter, lastPlayed]);

  return { filteredAlbums, effectiveSortOption };
}
