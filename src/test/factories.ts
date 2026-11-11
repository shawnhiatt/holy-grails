import type { Album } from "../app/components/discogs-api";
import { copyKey } from "../app/utils/copies";

let seq = 0;

/** Minimal valid Album for tests — override only what the test cares about.
 *  One album is one copy (DW-04): its id is the copy key of its instance id,
 *  as the app derives it, so an `instance_id` override moves the id too. Two
 *  copies of one release: two albums with the same `release_id`. */
export function makeAlbum(overrides: Partial<Album> = {}): Album {
  seq += 1;
  const instance_id = overrides.instance_id ?? 2000 + seq;
  return {
    id: copyKey(instance_id),
    release_id: 1000 + seq,
    instance_id,
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
    notes: "",
    dateAdded: "2024-01-01T00:00:00-08:00",
    discogsUrl: "",
    purgeTag: null,
    ...overrides,
  };
}
