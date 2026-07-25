import { describe, expect, it } from "vitest";
import {
  availableFields,
  describeCondition,
  describeRule,
  generateStackName,
  shouldRegenerateName,
} from "./stack-rule-labels";
import type { StackRule } from "../../../convex/stackRules";
import { makeAlbum } from "../../test/factories";

function rule(conditions: StackRule["conditions"], match: "all" | "any" = "all"): StackRule {
  return { match, conditions, sort: "artist-az", rotation: "off" };
}

describe("describeCondition", () => {
  it("renders each field as a short phrase, not as field/op/value", () => {
    expect(describeCondition({ field: "genre", op: "includesAny", value: ["Jazz"] })).toBe("Jazz");
    expect(describeCondition({ field: "genre", op: "excludesAll", value: ["Rock"] })).toBe("not Rock");
    expect(describeCondition({ field: "year", op: "before", value: 1980 })).toBe("before 1980");
    expect(describeCondition({ field: "year", op: "between", value: [1970, 1979] })).toBe("1970–1979");
    expect(describeCondition({ field: "decade", op: "is", value: 1970 })).toBe("the 1970s");
    expect(describeCondition({ field: "rating", op: "atLeast", value: 4 })).toBe("4 stars and up");
    expect(describeCondition({ field: "rating", op: "unrated" })).toBe("unrated");
    expect(describeCondition({ field: "purgeTag", op: "is", value: "keep" })).toBe("tagged keep");
    expect(describeCondition({ field: "purgeTag", op: "untagged" })).toBe("unjudged");
    expect(describeCondition({ field: "lastPlayed", op: "never" })).toBe("never played");
    expect(describeCondition({ field: "label", op: "is", value: "Blue Note" })).toBe("on Blue Note");
    expect(describeCondition({ field: "mediaCondition", op: "atLeast", value: "VG+" })).toBe("VG+ or better");
  });

  it("pluralizes day counts", () => {
    expect(describeCondition({ field: "dateAdded", op: "withinDays", value: 1 })).toBe("added in the last 1 day");
    expect(describeCondition({ field: "dateAdded", op: "withinDays", value: 90 })).toBe("added in the last 90 days");
  });

  it("degrades gracefully for an operator this build doesn't know", () => {
    // Matches the engine's forward compatibility: a newer rule still renders
    // chips rather than blowing up the panel.
    expect(describeCondition({ field: "runtime", op: "atMost", value: 40 })).toBe("runtime atMost 40");
  });
});

describe("generateStackName", () => {
  it("names a session after its criteria", () => {
    expect(
      generateStackName(
        rule([
          { field: "genre", op: "includesAny", value: ["Jazz"] },
          { field: "year", op: "before", value: 1980 },
        ])
      )
    ).toBe("Jazz, before 1980");
  });

  it("joins with 'or' when the rule matches any condition", () => {
    expect(
      generateStackName(
        rule(
          [
            { field: "genre", op: "includesAny", value: ["Jazz"] },
            { field: "genre", op: "includesAny", value: ["Soul"] },
          ],
          "any"
        )
      )
    ).toBe("Jazz or Soul");
  });

  it("stops at three criteria so the title stays a name, not a query string", () => {
    const name = generateStackName(
      rule([
        { field: "genre", op: "includesAny", value: ["Jazz"] },
        { field: "year", op: "before", value: 1980 },
        { field: "rating", op: "atLeast", value: 4 },
        { field: "lastPlayed", op: "never" },
        { field: "purgeTag", op: "untagged" },
      ])
    );
    expect(name).toBe("Jazz, before 1980, 4 stars and up, and more");
  });

  it("falls back to a usable name for an empty rule", () => {
    expect(generateStackName(rule([]))).toBe("New Session");
  });

  it("capitalizes the first character only", () => {
    expect(generateStackName(rule([{ field: "lastPlayed", op: "never" }]))).toBe("Never played");
  });
});

describe("shouldRegenerateName", () => {
  it("keeps regenerating while the name is still the generated one", () => {
    expect(shouldRegenerateName("Jazz, before 1980", "Jazz, before 1980")).toBe(true);
  });

  it("freezes permanently once the user types their own", () => {
    expect(shouldRegenerateName("Sunday Morning", "Jazz, before 1980")).toBe(false);
  });

  it("regenerates into an empty field", () => {
    expect(shouldRegenerateName("", "Jazz")).toBe(true);
    expect(shouldRegenerateName("   ", undefined)).toBe(true);
  });

  it("does not resume regenerating just because the generator changed", () => {
    // The reason the last generated name is stored rather than recomputed:
    // a change to the generator must not un-freeze a name the user chose.
    expect(shouldRegenerateName("Sunday Morning", undefined)).toBe(false);
  });
});

describe("availableFields", () => {
  it("hides genre until something in the collection carries one", () => {
    const bare = [makeAlbum(), makeAlbum()];
    expect(availableFields(bare).map((f) => f.field)).not.toContain("genre");
    const tagged = [makeAlbum({ genres: ["Jazz"] }), makeAlbum()];
    expect(availableFields(tagged).map((f) => f.field)).toContain("genre");
  });

  it("hides rating until something is rated", () => {
    expect(availableFields([makeAlbum()]).map((f) => f.field)).not.toContain("rating");
    expect(availableFields([makeAlbum({ rating: 4 })]).map((f) => f.field)).toContain("rating");
  });

  it("hides format for a single-medium collection", () => {
    const allVinyl = [makeAlbum({ format: "Vinyl, LP" }), makeAlbum({ format: "Vinyl, 7\"" })];
    expect(availableFields(allVinyl).map((f) => f.field)).not.toContain("mediaType");
    const mixed = [...allVinyl, makeAlbum({ format: "CD, Album" })];
    expect(availableFields(mixed).map((f) => f.field)).toContain("mediaType");
  });

  it("always offers the fields that need no synced data", () => {
    const fields = availableFields([makeAlbum()]).map((f) => f.field);
    expect(fields).toEqual(expect.arrayContaining(["year", "decade", "purgeTag", "lastPlayed", "folder"]));
  });
});

describe("describeRule", () => {
  it("renders every condition, so the chips never hide part of the rule", () => {
    const chips = describeRule(
      rule([
        { field: "genre", op: "includesAny", value: ["Jazz"] },
        { field: "year", op: "before", value: 1980 },
        { field: "rating", op: "atLeast", value: 4 },
        { field: "lastPlayed", op: "never" },
      ])
    );
    expect(chips).toHaveLength(4);
    expect(chips[3]).toBe("never played");
  });
});
