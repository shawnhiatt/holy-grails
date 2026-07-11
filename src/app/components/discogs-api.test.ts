import { describe, expect, it } from "vitest";
import { buildFieldMap, mediaType, type DiscogsCustomField } from "./discogs-api";

describe("mediaType", () => {
  it("classifies the common vinyl and CD/cassette formats", () => {
    // Ported from the old isVinylFormat cases.
    expect(mediaType("Vinyl, LP, Album")).toBe("Vinyl");
    expect(mediaType("vinyl")).toBe("Vinyl");
    expect(mediaType("CD, Album")).toBe("CD");
    expect(mediaType("Cassette")).toBe("Cassette");
  });

  it("buckets the vinyl family (flexi/lathe/acetate)", () => {
    expect(mediaType("Flexi-disc, 7\"")).toBe("Vinyl");
    expect(mediaType("Lathe Cut, 10\"")).toBe("Vinyl");
    expect(mediaType("Acetate")).toBe("Vinyl");
  });

  it("buckets the CD family (CDr/SACD/Minidisc)", () => {
    expect(mediaType("CDr")).toBe("CD");
    expect(mediaType("SACD, Album, Hybrid")).toBe("CD");
    expect(mediaType("Minidisc")).toBe("CD");
  });

  it("buckets shellac-era and tape formats", () => {
    expect(mediaType("Shellac, 10\", 78 RPM")).toBe("Shellac");
    expect(mediaType("Reel-To-Reel")).toBe("Tape");
    expect(mediaType("DAT")).toBe("Tape");
  });

  it("buckets video and digital formats", () => {
    expect(mediaType("DVD, DVD-Video")).toBe("DVD");
    expect(mediaType("Blu-ray")).toBe("Blu-ray");
    expect(mediaType("File, FLAC")).toBe("Digital");
  });

  it("prefers the physical medium over Box Set / All Media", () => {
    expect(mediaType("Box Set, Vinyl, LP; Vinyl, LP")).toBe("Vinyl");
    expect(mediaType("Box Set, CD; CD")).toBe("CD");
    expect(mediaType("Box Set")).toBe("Box Set");
  });

  it("falls through to Other for unknown or empty strings", () => {
    expect(mediaType("")).toBe("Other");
    expect(mediaType("All Media")).toBe("Other");
    expect(mediaType("Hybrid")).toBe("Other");
  });
});

describe("buildFieldMap", () => {
  const field = (id: number, name: string, type = "dropdown"): DiscogsCustomField => ({
    id,
    name,
    type,
    public: false,
  });

  it("maps the three standard fields by name, case-insensitively", () => {
    const map = buildFieldMap([
      field(1, "Media Condition"),
      field(2, "Sleeve Condition"),
      field(3, "Notes", "textarea"),
    ]);
    expect(map.mediaConditionId).toBe(1);
    expect(map.sleeveConditionId).toBe(2);
    expect(map.notesId).toBe(3);
    expect(map.otherFields.size).toBe(0);
  });

  it("accepts the short 'Media'/'Sleeve' aliases with surrounding whitespace", () => {
    const map = buildFieldMap([field(7, " media "), field(8, "SLEEVE")]);
    expect(map.mediaConditionId).toBe(7);
    expect(map.sleeveConditionId).toBe(8);
  });

  it("routes user-defined fields into otherFields with their metadata", () => {
    const map = buildFieldMap([
      { id: 5, name: "Acquired From", type: "text", public: false },
      { id: 6, name: "Wash Status", type: "dropdown", options: ["Clean", "Dirty"], public: false },
    ]);
    expect(map.mediaConditionId).toBeNull();
    expect(map.otherFields.get(5)).toEqual({ name: "Acquired From", type: "text", options: undefined });
    expect(map.otherFields.get(6)?.options).toEqual(["Clean", "Dirty"]);
  });
});
