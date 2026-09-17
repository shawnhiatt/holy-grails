import { describe, expect, it } from "vitest";
import { isColorToken, splitColorLead, pressingVariant } from "./pressing-format";

describe("isColorToken", () => {
  it("reads Discogs' free-text vinyl colours", () => {
    for (const c of ["Green", "Metallic Green", "Gold", "Clear", "Blue Marbled", "Red/Yellow Splatter"]) {
      expect(isColorToken(c), c).toBe(true);
    }
  });

  it("reads the bracketed shade convention", () => {
    expect(isColorToken("Green [Lime Green]")).toBe(true);
    expect(isColorToken("Gold [Metallic Gold]")).toBe(true);
  });

  it("does not read a pressing type that happens to contain a colour word", () => {
    // The one that matters: every promo would otherwise lead with "White Label".
    expect(isColorToken("White Label")).toBe(false);
    expect(isColorToken("White Label Promo")).toBe(false);
    expect(isColorToken("Picture Disc")).toBe(false);
  });

  it("does not match a colour word buried inside a longer word", () => {
    expect(isColorToken("Golden Age")).toBe(false);
    expect(isColorToken("Redux")).toBe(false);
  });

  it("ignores ordinary descriptors", () => {
    for (const d of ["LP", "Album", "Reissue", "Limited Edition", "Copy Protected", "Numbered", "Promo", ""]) {
      expect(isColorToken(d), d).toBe(false);
    }
  });
});

describe("splitColorLead", () => {
  it("merges the colour into the shape token it qualifies", () => {
    expect(splitColorLead(["LP", "Album", "Limited Edition", "Metallic Green"])).toEqual({
      color: "Metallic Green",
      parts: ["Metallic Green LP", "Album", "Limited Edition"],
    });
  });

  it("leads with the colour alone when no shape token is present", () => {
    expect(splitColorLead(["Album", "Reissue", "Clear"])).toEqual({
      color: "Clear",
      parts: ["Clear", "Album", "Reissue"],
    });
  });

  // The common case, and the one that holds if the versions endpoint turns out
  // never to carry colour: the tokens must come back exactly as they went in.
  it("returns the tokens untouched when there is no colour", () => {
    const tokens = ["LP", "Album"];
    expect(splitColorLead(tokens)).toEqual({ color: null, parts: ["LP", "Album"] });
    expect(splitColorLead([])).toEqual({ color: null, parts: [] });
  });
});

describe("pressingVariant", () => {
  it("takes the medium from major_formats, which is where it actually lives", () => {
    // The regression this whole module exists for: "LP, Album" has no medium
    // substring, so classifying off `format` alone returned "Other" and the
    // badge never rendered.
    expect(pressingVariant("LP, Album", ["Vinyl"])).toEqual({
      medium: "Vinyl",
      variant: "LP, Album",
      color: null,
    });
    expect(pressingVariant("Album, Copy Protected, Numbered, Promo", ["CD"]).medium).toBe("CD");
    expect(pressingVariant("Album, Reissue", ["Cassette"]).medium).toBe("Cassette");
  });

  it("falls back to the descriptor string when major_formats is missing", () => {
    expect(pressingVariant("Vinyl, LP, Album", []).medium).toBe("Vinyl");
    expect(pressingVariant("LP, Album", []).medium).toBeNull();
  });

  it("promotes a colour into the lead", () => {
    expect(pressingVariant("LP, Album, Metallic Green", ["Vinyl"])).toEqual({
      medium: "Vinyl",
      variant: "Metallic Green LP, Album",
      color: "Metallic Green",
    });
  });

  it("survives empty and missing input without throwing", () => {
    expect(pressingVariant("", [])).toEqual({ medium: null, variant: "", color: null });
    expect(pressingVariant("", ["Vinyl"]).variant).toBe("");
  });
});
