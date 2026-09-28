/**
 * Applies the `format_scope` preference ("all" | "vinyl") to a collection
 * array. Pure — no React, no Convex.
 *
 * Scope is display-only (see "Formats (all-formats)" in CLAUDE.md): the data
 * layer stores every format, and this filter exists purely so screens can
 * show a vinyl-only view when the user asks for one. Rule evaluation
 * (stackMembership/previewStackRule) and the Session Builder must NOT go
 * through this — they read the unscoped collection so an owner and a
 * share-link viewer (which evaluates rules over the full collection
 * server-side) agree on the same pool.
 */
import { mediaType } from "../components/discogs-api";
import type { Album } from "../components/discogs-api";

/** Matches app-context.tsx's `FormatScope` — duplicated as a plain string
 *  union (rather than imported) so this pure util has no dependency on the
 *  load-bearing app-context module. */
export type FormatScope = "all" | "vinyl";

export function scopeAlbums<T extends Pick<Album, "format">>(
  albums: T[],
  formatScope: FormatScope
): T[] {
  if (formatScope !== "vinyl") return albums;
  return albums.filter((a) => mediaType(a.format) === "Vinyl");
}
