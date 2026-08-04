import { describe, expect, it } from "vitest";
import { buildStackPresets } from "./stack-presets";
import { evaluateStackRule, type RuleAlbum } from "../../../convex/stackRules";
import { makeAlbum } from "../../test/factories";
import type { Album } from "../components/discogs-api";

/* Presets are generated from the real collection, and each carries a
   `matchCount` computed by a hand-rolled predicate rather than by the rule
   engine — the picker has to stay cheap to render. That shortcut is only safe
   while the two agree, so the central test here runs every generated preset's
   rule through the actual evaluator and demands the same number. A preset that
   promises 12 records and opens holding 6 is worse than no preset. */

const DEFAULTS = { limit: undefined, rotation: "off" as const };

/** The adapter the client uses to feed collection rows to the rule engine. */
function toRuleAlbum(a: Album, lastPlayed: Record<string, string>): RuleAlbum {
  return {
    releaseId: a.release_id,
    artist: a.artist,
    title: a.title,
    label: a.label,
    year: a.year,
    genres: a.genres,
    styles: a.styles,
    format: a.format,
    folder: a.folder,
    mediaCondition: a.mediaCondition,
    rating: a.rating,
    dateAdded: a.dateAdded,
    purgeTag: a.purgeTag,
    lastPlayedAt: lastPlayed[a.id] ? new Date(lastPlayed[a.id]).getTime() : null,
  };
}

function expectCountsMatchEngine(albums: Album[], lastPlayed: Record<string, string> = {}) {
  const presets = buildStackPresets(albums, lastPlayed, DEFAULTS);
  expect(presets.length).toBeGreaterThan(0);
  const ruleAlbums = albums.map((a) => toRuleAlbum(a, lastPlayed));
  for (const p of presets) {
    const poolSize = evaluateStackRule(ruleAlbums, p.rule, { stackId: "s" }).poolSize;
    expect(`${p.id}=${p.matchCount}`).toBe(`${p.id}=${poolSize}`);
  }
  return presets;
}

describe("buildStackPresets", () => {
  it("counts a release once even when a word is both its genre and its style", () => {
    // Discogs files some releases under the same word twice — "Classical" as
    // the genre and again as a style. Counting occurrences reported 12 matches
    // for a 6-record collection.
    const albums = Array.from({ length: 6 }, () =>
      makeAlbum({ genres: ["Classical"], styles: ["Classical", "Modern"], year: 1975 })
    );
    const presets = expectCountsMatchEngine(albums);
    const classical = presets.find((p) => p.id === "tag-classical");
    expect(classical?.matchCount).toBe(6);
  });

  it("treats a tag as one tag regardless of case", () => {
    const albums = [
      ...Array.from({ length: 3 }, () => makeAlbum({ genres: ["Folk"] })),
      ...Array.from({ length: 3 }, () => makeAlbum({ genres: ["folk"] })),
    ];
    const presets = buildStackPresets(albums, {}, DEFAULTS);
    const folk = presets.filter((p) => p.id.startsWith("tag-folk"));
    expect(folk).toHaveLength(1);
    expect(folk[0].matchCount).toBe(6);
  });

  it("agrees with the rule engine across a mixed collection", () => {
    const now = Date.now();
    const iso = (daysAgo: number) =>
      new Date(now - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const albums = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeAlbum({
          genres: ["Jazz"], styles: ["Hard Bop"], year: 1965 + i,
          rating: 5, purgeTag: "keep", dateAdded: iso(10),
        })
      ),
      ...Array.from({ length: 6 }, () =>
        makeAlbum({ genres: ["Rock"], year: 1972, rating: 4, dateAdded: iso(400) })
      ),
      ...Array.from({ length: 5 }, () =>
        makeAlbum({ genres: [], styles: [], year: 0, dateAdded: iso(5) })
      ),
    ];
    expectCountsMatchEngine(albums);
  });

  it("omits presets the collection cannot fill", () => {
    // Nothing rated → no rating presets, rather than presets matching nothing.
    const albums = Array.from({ length: 6 }, () => makeAlbum({ rating: undefined }));
    const presets = buildStackPresets(albums, {}, DEFAULTS);
    expect(presets.map((p) => p.id)).not.toContain("four-plus");
    expect(presets.map((p) => p.id)).not.toContain("neglected-favorites");
  });

  it("drops anything below the minimum to be worth tapping", () => {
    const albums = Array.from({ length: 3 }, () => makeAlbum({ genres: ["Dub"] }));
    expect(buildStackPresets(albums, {}, DEFAULTS)).toHaveLength(0);
  });
});
