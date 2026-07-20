/* Pure logic for the cover-photo scan (Look It Up → Scan → Cover). Kept in its
   own plain module (no Convex deps) so the "use node" vision action and the
   vitest suite can both import it — same pattern as marketValue.ts. */

/** Model for cover identification. One-line bump to "claude-opus-4-8" if
    accuracy ever disappoints — cost is the reason Haiku was chosen. */
export const COVER_MODEL = "claude-haiku-4-5";

/** What the model is asked to do. Short on purpose — the structured-output
    schema does the shaping, the prompt just sets the task. */
export const COVER_PROMPT =
  "Identify the album from this photo of its cover. Return the primary artist name and album title exactly as they would appear in a music database. If you cannot identify the album with reasonable confidence, set identified to false.";

/** Strict JSON schema for the structured output. `additionalProperties: false`
    + required on every field guarantees the response parses into the shape
    parseCoverIdentity expects. */
export const COVER_SCHEMA = {
  type: "object",
  properties: {
    identified: {
      type: "boolean",
      description: "True only when the album is identified with reasonable confidence.",
    },
    artist: { type: "string", description: "Primary artist name, empty string if unidentified." },
    title: { type: "string", description: "Album title, empty string if unidentified." },
  },
  required: ["identified", "artist", "title"],
  additionalProperties: false,
} as const;

export interface CoverIdentity {
  artist: string;
  title: string;
}

/* The identified strings feed the search box, so cap them at something no
   real artist/title exceeds — a runaway string would just produce a garbage
   Discogs query, but there's no reason to let it through. */
const MAX_FIELD_LENGTH = 200;

/**
 * Validate a structured-output payload into a usable identity, or null.
 * Null means "couldn't read that cover" regardless of why: the model said
 * identified: false, a field is empty/whitespace, the payload isn't the
 * expected shape, or a field is absurdly long.
 */
export function parseCoverIdentity(raw: unknown): CoverIdentity | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.identified !== true) return null;
  if (typeof o.artist !== "string" || typeof o.title !== "string") return null;
  const artist = o.artist.trim();
  const title = o.title.trim();
  if (!artist || !title) return null;
  if (artist.length > MAX_FIELD_LENGTH || title.length > MAX_FIELD_LENGTH) return null;
  return { artist, title };
}
