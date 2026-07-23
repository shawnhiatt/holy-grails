/* Pure logic for the cover-photo scan (Look It Up → Scan → Cover). Kept in its
   own plain module (no Convex deps) so the "use node" vision action and the
   vitest suite can both import it — same pattern as marketValue.ts. */

/** Model for cover identification. Sonnet 5 reads stylized/letterpress cover
    type and small hype-sticker text far better than Haiku did, and its
    high-resolution vision suits the OCR-fallback path — Haiku plateaued on
    exactly those covers. Cover scans are rare, deliberate shutter presses, so
    the per-scan cost of Sonnet over Haiku is negligible. Bump to
    "claude-opus-4-8" if accuracy ever still disappoints. */
export const COVER_MODEL = "claude-sonnet-5";

/** What the model is asked to do. The structured-output schema does the
    shaping; the prompt sets the task and — critically — tells the model to
    fall back to transcribing printed text when it doesn't recognize the
    release (most scans are obscure pressings the model has never seen, so
    reading the cover text is the common path, not the exception). */
export const COVER_PROMPT =
  "This is a photo of a record album cover. Identify the release: first try to recognize it; if you don't recognize it, read the artist name and album title directly from the text printed on the cover and transcribe them exactly as printed, even if the type is stylized. Return the primary artist and album title as they would appear in a music database. Only set identified to false when there is no readable artist/title text on the cover AND you do not recognize the album.";

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
