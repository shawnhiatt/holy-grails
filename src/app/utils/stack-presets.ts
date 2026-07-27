import type { Album } from "../components/discogs-api";
import { hasRating } from "../components/discogs-api";
import type { StackRule } from "../../../convex/stackRules";

/**
 * Session presets — the 80% of what people actually want from a session that
 * fills itself, without touching a condition-row builder.
 *
 * **Presets are generated from the real collection, not from a fixed list.**
 * Only offer Jazz if he owns jazz; only offer star ratings if anything is
 * rated. That is a product decision first (a preset that yields nothing is
 * worse than no preset), and it also makes the free-data backfill invisible:
 * a user whose collection hasn't re-synced yet simply doesn't see the genre
 * or rating presets, rather than seeing one that quietly matches nothing.
 */

export interface StackPreset {
  id: string;
  /** The session name this preset creates — also its label in the picker. */
  name: string;
  /** One line of what it will contain. Collector vernacular, no filler. */
  blurb: string;
  rule: StackRule;
  /** How many records it currently matches. Used to sort and to gate. */
  matchCount: number;
}

/**
 * Cap and rotation come from the user's Settings defaults, threaded in rather
 * than hardcoded, so a preset session obeys the same "an evening" choice a
 * hand-built one does.
 */
export interface RuleDefaults {
  limit: number | undefined;
  rotation: "off" | "daily" | "weekly";
}

function makeRule(
  defaults: RuleDefaults,
  conditions: StackRule["conditions"],
  sort: string,
  match: "all" | "any" = "all"
): StackRule {
  return {
    match,
    conditions,
    sort,
    ...(defaults.limit ? { limit: defaults.limit } : {}),
    rotation: defaults.rotation,
  };
}

/** A preset has to be worth tapping — below this it isn't a session. */
const MIN_MATCHES = 5;

/**
 * Build the presets this collection can actually fill, best-populated first.
 *
 * `count` takes a predicate rather than running the rule engine: these are
 * fixed, known shapes, and counting directly keeps the picker cheap to render
 * on every keystroke of the builder.
 */
export function buildStackPresets(
  albums: Album[],
  lastPlayed: Record<string, string>,
  defaults: RuleDefaults
): StackPreset[] {
  const out: StackPreset[] = [];
  const rule = (
    conditions: StackRule["conditions"],
    sort: string,
    match: "all" | "any" = "all"
  ) => makeRule(defaults, conditions, sort, match);
  const count = (fn: (a: Album) => boolean) => albums.filter(fn).length;
  const now = Date.now();
  const DAY = 86_400_000;

  const add = (p: Omit<StackPreset, "matchCount">, matchCount: number) => {
    if (matchCount >= MIN_MATCHES) out.push({ ...p, matchCount });
  };

  // ── Play history (always available — it's Holy Grails' own data) ──
  add(
    {
      id: "never-played",
      name: "Never played",
      blurb: "Nothing logged yet.",
      rule: rule([{ field: "lastPlayed", op: "never" }], "added-old"),
    },
    count((a) => !lastPlayed[a.id])
  );

  add(
    {
      id: "not-in-a-year",
      name: "Not in a year",
      blurb: "Owned, loved once, untouched since.",
      rule: rule([{ field: "lastPlayed", op: "notWithinDays", value: 365 }], "last-played-oldest"),
    },
    count((a) => {
      const t = lastPlayed[a.id] ? new Date(lastPlayed[a.id]).getTime() : null;
      return t === null || now - t > 365 * DAY;
    })
  );

  // ── Purge ──
  add(
    {
      id: "tagged-keep",
      name: "The keepers",
      blurb: "Everything you've tagged Keep.",
      rule: rule([{ field: "purgeTag", op: "is", value: "keep" }], "artist-az"),
    },
    count((a) => a.purgeTag === "keep")
  );

  add(
    {
      id: "unjudged",
      name: "Still undecided",
      blurb: "No purge verdict yet.",
      rule: rule([{ field: "purgeTag", op: "untagged" }], "added-old"),
    },
    count((a) => a.purgeTag === null)
  );

  // ── Recency ──
  add(
    {
      id: "recently-added",
      name: "Recent pickups",
      blurb: "Added in the last three months.",
      rule: rule([{ field: "dateAdded", op: "withinDays", value: 90 }], "added-new"),
    },
    count((a) => {
      const t = new Date(a.dateAdded).getTime();
      return Number.isFinite(t) && now - t <= 90 * DAY;
    })
  );

  // ── Rating (only once anything is rated — see the header note) ──
  const anyRated = albums.some((a) => hasRating(a.rating));
  if (anyRated) {
    add(
      {
        id: "four-plus",
        name: "Four stars and up",
        blurb: "The ones you rated highest.",
        rule: rule([{ field: "rating", op: "atLeast", value: 4 }], "rating-high"),
      },
      count((a) => hasRating(a.rating) && a.rating! >= 4)
    );

    add(
      {
        id: "neglected-favorites",
        name: "Neglected favorites",
        blurb: "Rated four or better, not played in a year.",
        rule: rule(
          [
            { field: "rating", op: "atLeast", value: 4 },
            { field: "lastPlayed", op: "notWithinDays", value: 365 },
          ],
          "rating-high"
        ),
      },
      count((a) => {
        if (!hasRating(a.rating) || a.rating! < 4) return false;
        const t = lastPlayed[a.id] ? new Date(lastPlayed[a.id]).getTime() : null;
        return t === null || now - t > 365 * DAY;
      })
    );
  }

  // ── Decades: offer the collection's own best-populated ones ──
  const byDecade = new Map<number, number>();
  for (const a of albums) {
    if (!a.year) continue; // Discogs year 0 = no release date
    const d = Math.floor(a.year / 10) * 10;
    byDecade.set(d, (byDecade.get(d) || 0) + 1);
  }
  for (const [decade, n] of [...byDecade.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    add(
      {
        id: `decade-${decade}`,
        name: `The ${decade}s`,
        blurb: `Pressed between ${decade} and ${decade + 9}.`,
        rule: rule([{ field: "decade", op: "is", value: decade }], "year-old"),
      },
      n
    );
  }

  // ── Genres and styles: same idea, straight from what's on the shelf.
  // Styles lead — "Hard Bop" is session-shaped in a way "Jazz" isn't.
  const tagCounts = new Map<string, number>();
  for (const a of albums) {
    for (const tag of [...(a.styles || []), ...(a.genres || [])]) {
      if (!tag) continue;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    add(
      {
        id: `tag-${tag.toLowerCase()}`,
        name: tag,
        blurb: `Everything filed under ${tag}.`,
        rule: rule([{ field: "genre", op: "includesAny", value: [tag] }], "artist-az"),
      },
      n
    );
  }

  return out;
}
