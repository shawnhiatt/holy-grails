import { describe, expect, it } from "vitest";
import { buildFieldMap, isVinylFormat, type DiscogsCustomField } from "./discogs-api";

describe("isVinylFormat", () => {
  it("matches vinyl case-insensitively and rejects other formats", () => {
    expect(isVinylFormat("Vinyl, LP, Album")).toBe(true);
    expect(isVinylFormat("vinyl")).toBe(true);
    expect(isVinylFormat("CD, Album")).toBe(false);
    expect(isVinylFormat("Cassette")).toBe(false);
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
