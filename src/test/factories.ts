import type { Album } from "../app/components/discogs-api";

let seq = 0;

/** Minimal valid Album for tests — override only what the test cares about. */
export function makeAlbum(overrides: Partial<Album> = {}): Album {
  seq += 1;
  return {
    id: `album-${seq}`,
    release_id: 1000 + seq,
    instance_id: 2000 + seq,
    folder_id: 1,
    title: `Test Album ${seq}`,
    artist: `Test Artist ${seq}`,
    year: 1980,
    thumb: "",
    cover: "",
    folder: "Uncategorized",
    label: "Test Label",
    catalogNumber: "",
    format: "Vinyl, LP",
    mediaCondition: "",
    sleeveCondition: "",
    pricePaid: "",
    notes: "",
    dateAdded: "2024-01-01T00:00:00-08:00",
    discogsUrl: "",
    purgeTag: null,
    ...overrides,
  };
}
