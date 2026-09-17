/**
 * Composes the lead line of a pressing row in the Look It Up picker.
 *
 * The picker lists every version of one master, so the year and the title are
 * the same on nearly every row — leading with them made a 14-pressing list
 * scan as one repeated line. What actually distinguishes the rows is the
 * FORMAT: an LP against a CD against a cassette, and among the LPs, the
 * colored variant against the black one. So the format leads, and the colour
 * leads the format.
 *
 * What the API gives us, and what it doesn't:
 * `/masters/{id}/versions` returns `format` as the release's `descriptions`
 * array joined ("LP, Album", "Album, Copy Protected, Numbered, Promo") — the
 * MEDIUM is not in that string, it is the separate `major_formats` array. That
 * is why the picker's medium badge never rendered: mediaType("LP, Album") has
 * no medium substring to find and classified every row as "Other". Colour, on
 * Discogs, is a third sibling field (`formats[].text`), so whether it reaches
 * the descriptor string at all is the API's call, not ours — `splitColorLead`
 * surfaces one when it is there and changes nothing when it isn't.
 */
import { mediaType, type MediaType } from "../components/discogs-api";

/**
 * Colour words Discogs' free-text vinyl colours are built from. Matching is
 * per-word against this set rather than a substring scan, so "Gold" hits and
 * "Golden Era" does not.
 */
const COLOR_WORDS = new Set([
  "black", "white", "red", "blue", "green", "yellow", "orange", "purple",
  "pink", "gold", "silver", "grey", "gray", "brown", "amber", "cream",
  "bone", "tan", "copper", "bronze", "magenta", "turquoise", "teal",
  "violet", "maroon", "olive", "aqua", "beige", "burgundy", "lavender",
  "mint", "peach", "rust", "sand", "sky", "smoke", "coke",
  // Finishes that only ever qualify a colour.
  "clear", "transparent", "translucent", "opaque", "metallic", "marbled",
  "marble", "splatter", "splattered", "swirl", "swirled", "haze", "hazy",
  "cloudy", "galaxy", "glitter", "neon", "glow", "milky", "frosted",
]);

/**
 * Descriptors that contain a colour word but name a pressing TYPE, not a
 * colour. "White Label" is the one that matters — it is a standard Discogs
 * description and reading it as a colour would put "White Label LP" in the
 * lead of every promo.
 */
const NOT_COLORS = new Set([
  "white label", "white label promo", "black label", "red label",
  "blue note", "gold disc", "picture disc",
]);

/**
 * Tokens naming the physical shape, in the order we'd rather show one. A
 * colour attaches to the shape ("Metallic Green LP") because that is the
 * phrase a collector says out loud. "Album" is deliberately NOT a shape: it
 * describes the contents, not the object, and "Clear Album" is not a thing
 * anyone says — a colour with no shape to attach to just leads on its own.
 */
const SHAPE_TOKENS = [
  "lp", "ep", "12\"", "10\"", "7\"", "maxi-single", "single",
  "mini-album", "mini-lp", "box set",
];

/** True when a descriptor token reads as a colour rather than a pressing type. */
export function isColorToken(token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t || NOT_COLORS.has(t)) return false;
  // Discogs' bracket convention for a specific shade — "Green [Lime Green]".
  const bare = t.replace(/\[[^\]]*\]/g, " ");
  return bare
    .split(/[\s/&-]+/)
    .filter(Boolean)
    .some((word) => COLOR_WORDS.has(word));
}

/**
 * Reorders a descriptor list so a colour leads, merged into the shape token it
 * qualifies. Returns the tokens unchanged when no colour is present, which is
 * the common case and the case where the API gives us nothing to work with.
 */
export function splitColorLead(tokens: string[]): { color: string | null; parts: string[] } {
  const colorIndex = tokens.findIndex(isColorToken);
  if (colorIndex === -1) return { color: null, parts: tokens };

  const color = tokens[colorIndex];
  const rest = tokens.filter((_, i) => i !== colorIndex);

  const shapeIndex = rest.findIndex((t) => SHAPE_TOKENS.includes(t.trim().toLowerCase()));
  if (shapeIndex === -1) return { color, parts: [color, ...rest] };

  const shape = rest[shapeIndex];
  return {
    color,
    parts: [`${color} ${shape}`, ...rest.filter((_, i) => i !== shapeIndex)],
  };
}

export interface PressingVariant {
  /** Badge text — "Vinyl", "CD", … — or null when the medium is unknown. */
  medium: MediaType | null;
  /** The lead descriptor line, colour first. Empty when there are none. */
  variant: string;
  /** The colour that was promoted, for callers that want to style it. */
  color: string | null;
}

/**
 * Builds a pressing row's lead line from the two fields the versions endpoint
 * actually returns.
 *
 * `majorFormats` is the medium and is authoritative; `format` is only consulted
 * for it as a fallback, which is what the picker did exclusively before and why
 * no badge ever appeared.
 */
export function pressingVariant(format: string, majorFormats: string[] = []): PressingVariant {
  const mediumSource = majorFormats.filter(Boolean).join(", ");
  const resolved = mediaType(mediumSource || format || "");
  const tokens = (format || "").split(",").map((t) => t.trim()).filter(Boolean);
  const { color, parts } = splitColorLead(tokens);
  return {
    medium: resolved === "Other" ? null : resolved,
    variant: parts.join(", "),
    color,
  };
}
