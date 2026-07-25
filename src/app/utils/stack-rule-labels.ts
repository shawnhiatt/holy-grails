import type { Album } from "../components/discogs-api";
import { hasRating, mediaType, CONDITION_GRADES, type MediaType } from "../components/discogs-api";
import type { StackRule, StackRuleCondition } from "../../../convex/stackRules";

/**
 * Human-readable vocabulary for the rule builder, and the title generator.
 *
 * Kept out of the component so the generated-title logic is testable without
 * React, alongside insights.ts and accounts.ts.
 */

export type ValueKind = "text" | "number" | "select" | "none" | "yearRange";

export interface OpSpec {
  op: string;
  /** Reads as a sentence fragment after the field name: "artist **is** …". */
  label: string;
  value: ValueKind;
}

export interface FieldSpec {
  field: string;
  label: string;
  ops: OpSpec[];
  /** Options for `select` operators, derived from the collection. */
  options?: (albums: Album[]) => string[];
  /** True when the field can't say anything useful about this collection. */
  hidden?: (albums: Album[]) => boolean;
}

const uniqueSorted = (values: (string | undefined)[]): string[] =>
  [...new Set(values.filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b)
  );

/**
 * The fields a rule can be built from, in the order they appear in the picker
 * — the ones people reach for first, first.
 *
 * Deliberately absent: country, tracklist, runtime, credits, community rating.
 * Those come only from `/releases/{id}` — one request per release against a
 * 60/min budget — which is the market-value drip problem again and would mean
 * a second drip table. "Sessions under 40 minutes" is a lovely idea that costs
 * a whole subsystem.
 */
export const RULE_FIELDS: FieldSpec[] = [
  {
    field: "genre",
    label: "Genre or style",
    ops: [
      { op: "includesAny", label: "is any of", value: "select" },
      { op: "excludesAll", label: "is none of", value: "select" },
    ],
    options: (albums) =>
      uniqueSorted(albums.flatMap((a) => [...(a.styles || []), ...(a.genres || [])])),
    // Before a user's first sync after the free-data pass, nothing carries
    // genres — offering the field would produce a rule that matches nothing.
    hidden: (albums) => !albums.some((a) => a.genres?.length || a.styles?.length),
  },
  {
    field: "year",
    label: "Year",
    ops: [
      { op: "before", label: "is before", value: "number" },
      { op: "after", label: "is after", value: "number" },
      { op: "between", label: "is between", value: "yearRange" },
      { op: "is", label: "is", value: "number" },
    ],
  },
  {
    field: "decade",
    label: "Decade",
    ops: [{ op: "is", label: "is", value: "select" }],
    options: (albums) =>
      [
        ...new Set(
          albums.filter((a) => a.year).map((a) => String(Math.floor(a.year / 10) * 10))
        ),
      ].sort(),
  },
  {
    field: "rating",
    label: "Your rating",
    ops: [
      { op: "atLeast", label: "is at least", value: "number" },
      { op: "atMost", label: "is at most", value: "number" },
      { op: "is", label: "is", value: "number" },
      { op: "unrated", label: "is not set", value: "none" },
    ],
    hidden: (albums) => !albums.some((a) => hasRating(a.rating)),
  },
  {
    field: "purgeTag",
    label: "Purge verdict",
    ops: [
      { op: "is", label: "is", value: "select" },
      { op: "isNot", label: "is not", value: "select" },
      { op: "untagged", label: "is not set", value: "none" },
    ],
    options: () => ["keep", "maybe", "cut"],
  },
  {
    field: "lastPlayed",
    label: "Last played",
    ops: [
      { op: "never", label: "never", value: "none" },
      { op: "notWithinDays", label: "not in the last", value: "number" },
      { op: "withinDays", label: "within the last", value: "number" },
    ],
  },
  {
    field: "playCount",
    label: "Play count",
    ops: [
      { op: "atLeast", label: "is at least", value: "number" },
      { op: "atMost", label: "is at most", value: "number" },
    ],
  },
  {
    field: "artist",
    label: "Artist",
    ops: [
      { op: "is", label: "is", value: "select" },
      { op: "contains", label: "contains", value: "text" },
    ],
    options: (albums) => uniqueSorted(albums.map((a) => a.artist)),
  },
  {
    field: "label",
    label: "Label",
    ops: [
      { op: "is", label: "is", value: "select" },
      { op: "contains", label: "contains", value: "text" },
    ],
    options: (albums) => uniqueSorted(albums.map((a) => a.label)),
  },
  {
    field: "folder",
    label: "Folder",
    ops: [
      { op: "is", label: "is", value: "select" },
      { op: "isNot", label: "is not", value: "select" },
    ],
    options: (albums) => uniqueSorted(albums.map((a) => a.folder)),
  },
  {
    field: "mediaType",
    label: "Format",
    ops: [
      { op: "is", label: "is", value: "select" },
      { op: "isNot", label: "is not", value: "select" },
    ],
    options: (albums) => uniqueSorted(albums.map((a) => mediaType(a.format) as MediaType)),
    // A single-medium collection has nothing to choose between.
    hidden: (albums) => new Set(albums.map((a) => mediaType(a.format))).size < 2,
  },
  {
    field: "format",
    label: "Pressing detail",
    ops: [{ op: "contains", label: "contains", value: "text" }],
  },
  {
    field: "mediaCondition",
    label: "Condition",
    ops: [
      { op: "atLeast", label: "is at least", value: "select" },
      { op: "is", label: "is", value: "select" },
    ],
    options: () => CONDITION_GRADES,
    hidden: (albums) => !albums.some((a) => a.mediaCondition),
  },
  {
    field: "dateAdded",
    label: "Added",
    ops: [{ op: "withinDays", label: "within the last", value: "number" }],
  },
  {
    field: "title",
    label: "Title",
    ops: [{ op: "contains", label: "contains", value: "text" }],
  },
];

export function fieldSpec(field: string): FieldSpec | undefined {
  return RULE_FIELDS.find((f) => f.field === field);
}

export function opSpec(field: string, op: string): OpSpec | undefined {
  return fieldSpec(field)?.ops.find((o) => o.op === op);
}

/** Fields worth offering for this particular collection. */
export function availableFields(albums: Album[]): FieldSpec[] {
  return RULE_FIELDS.filter((f) => !f.hidden?.(albums));
}

// ─── Human-readable rendering ───

const titleCase = (s: string) =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);

/**
 * One condition as a short phrase. Used both for the chips under the title
 * and, for the first few conditions, for the generated title itself.
 */
export function describeCondition(cond: StackRuleCondition): string {
  const { field, op, value } = cond;
  const v = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const plural = (n: string, unit: string) => `${n} ${unit}${n === "1" ? "" : "s"}`;

  switch (field) {
    case "genre":
    case "style":
      return op === "excludesAll" ? `not ${v}` : v;
    case "year":
      if (op === "before") return `before ${v}`;
      if (op === "after") return `after ${v}`;
      if (op === "between" && Array.isArray(value)) return `${value[0]}–${value[1]}`;
      return `${v}`;
    case "decade":
      return `the ${v}s`;
    case "rating":
      if (op === "unrated") return "unrated";
      if (op === "atLeast") return `${v} stars and up`;
      if (op === "atMost") return `${v} stars and under`;
      return `${v} stars`;
    case "purgeTag":
      if (op === "untagged") return "unjudged";
      return op === "isNot" ? `not ${v}` : `tagged ${v}`;
    case "lastPlayed":
      if (op === "never") return "never played";
      if (op === "notWithinDays") return `unplayed in ${plural(v, "day")}`;
      return `played in the last ${plural(v, "day")}`;
    case "playCount":
      return op === "atMost" ? `${v} plays or fewer` : `${v}+ plays`;
    case "artist":
      return op === "contains" ? `artist like ${v}` : v;
    case "label":
      return op === "contains" ? `label like ${v}` : `on ${v}`;
    case "folder":
      return op === "isNot" ? `not in ${v}` : `in ${v}`;
    case "mediaType":
      return op === "isNot" ? `not ${v}` : v;
    case "format":
      return v;
    case "mediaCondition":
      return op === "atLeast" ? `${v} or better` : v;
    case "dateAdded":
      return `added in the last ${plural(v, "day")}`;
    case "title":
      return `title like ${v}`;
    default:
      // Forward compatible with the engine: an operator this build doesn't
      // know still renders as something rather than blowing up the chips.
      return `${field} ${op} ${v}`.trim();
  }
}

/** All of a rule's conditions as chips, in rule order. */
export function describeRule(rule: StackRule): string[] {
  return (rule.conditions || []).map(describeCondition);
}

/**
 * Generate a session title from a rule.
 *
 * A required blank-name step is friction at the moment of excitement, so a
 * name always exists. It also doubles as a readback — the user can verify they
 * built what they meant before saving.
 *
 * Only the first few criteria go in: cram five conditions into a title and it
 * stops being a name and becomes a query string. The full criteria always
 * render as chips underneath, so nothing is hidden by the truncation.
 */
export function generateStackName(rule: StackRule): string {
  const parts = describeRule(rule).filter(Boolean);
  if (parts.length === 0) return "New Session";

  const joiner = rule.match === "any" ? " or " : ", ";
  const shown = parts.slice(0, 3);
  const name = titleCase(shown.join(joiner));
  // "…and more" beats a truncated phrase that reads like a mistake.
  return parts.length > shown.length ? `${name}, and more` : name;
}

/**
 * Should the title keep regenerating as the rule is edited?
 *
 * Yes while it still matches what the generator last produced; the moment the
 * user types their own it diverges and freezes permanently. Comparing against
 * the *stored* last-generated value rather than a fresh generation means the
 * freeze survives a change to the generator itself.
 */
export function shouldRegenerateName(
  currentName: string,
  lastGenerated: string | undefined
): boolean {
  if (!currentName.trim()) return true;
  return currentName === lastGenerated;
}
