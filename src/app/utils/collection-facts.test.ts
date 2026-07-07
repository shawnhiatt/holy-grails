import { describe, expect, it } from "vitest";
import { deriveCollectionFacts } from "./collection-facts";
import { makeAlbum } from "../../test/factories";

function fact(facts: { label: string; value: string }[], label: string) {
  return facts.find((f) => f.label === label);
}

describe("deriveCollectionFacts", () => {
  it("returns no facts for an empty collection", () => {
    expect(deriveCollectionFacts([])).toEqual([]);
  });

  it("gates top decade behind the 5-album minimum", () => {
    const four = Array.from({ length: 4 }, () => makeAlbum({ year: 1973 }));
    expect(fact(deriveCollectionFacts(four), "Top decade")).toBeUndefined();

    const five = [...four, makeAlbum({ year: 1978 })];
    expect(fact(deriveCollectionFacts(five), "Top decade")?.value).toBe("The 1970s");
  });

  it("ignores year 0 and pre-1900 years for decade and oldest pressing", () => {
    const albums = [
      makeAlbum({ year: 0 }),
      makeAlbum({ year: 1899 }),
      makeAlbum({ year: 1962 }),
    ];
    const facts = deriveCollectionFacts(albums);
    expect(fact(facts, "Top decade")).toBeUndefined();
    expect(fact(facts, "Oldest pressing")?.value).toBe("1962");
  });

  it("gates top artist behind the 3-album minimum and strips disambiguation suffixes", () => {
    const albums = [
      makeAlbum({ artist: "Nirvana (2)" }),
      makeAlbum({ artist: "Nirvana" }),
      makeAlbum({ artist: "Nirvana (2)" }),
    ];
    // All three group under "Nirvana" once the "(2)" suffix is stripped
    expect(fact(deriveCollectionFacts(albums), "Top artist")?.value).toBe("Nirvana");
  });

  it("excludes Various Artists and Unknown from top artist", () => {
    const albums = [
      ...Array.from({ length: 5 }, () => makeAlbum({ artist: "Various Artists" })),
      ...Array.from({ length: 3 }, () => makeAlbum({ artist: "Unknown Artist" })),
      ...Array.from({ length: 3 }, () => makeAlbum({ artist: "Broadcast" })),
    ];
    expect(fact(deriveCollectionFacts(albums), "Top artist")?.value).toBe("Broadcast");
  });

  it("gates top label behind the 3-album minimum and skips 'Unknown'", () => {
    const albums = [
      ...Array.from({ length: 4 }, () => makeAlbum({ label: "Unknown" })),
      ...Array.from({ length: 2 }, () => makeAlbum({ label: "4AD" })),
    ];
    expect(fact(deriveCollectionFacts(albums), "Top label")).toBeUndefined();

    const withEnough = [...albums, makeAlbum({ label: "4AD" })];
    expect(fact(deriveCollectionFacts(withEnough), "Top label")?.value).toBe("4AD");
  });

  it("latest pickup includes the artist and strips its disambiguation suffix", () => {
    const albums = [
      makeAlbum({ dateAdded: "2024-01-01T00:00:00-08:00" }),
      makeAlbum({
        artist: "Low (2)",
        title: "Things We Lost in the Fire",
        dateAdded: "2026-05-01T00:00:00-08:00",
      }),
    ];
    expect(fact(deriveCollectionFacts(albums), "Latest pickup")?.value).toBe(
      "Low – Things We Lost in the Fire"
    );
  });

  it("skips latest pickup when no album has a dateAdded", () => {
    const albums = [makeAlbum({ dateAdded: "" })];
    expect(fact(deriveCollectionFacts(albums), "Latest pickup")).toBeUndefined();
  });

  it("derives Most rotated for the highest-play record with 2+ plays", () => {
    // The feed shuffles fact order for the ticker; the derivation itself
    // returns Most rotated as the first fact.
    const a = makeAlbum({ id: "r1", artist: "Low (2)", title: "Hey What" });
    const b = makeAlbum({ id: "r2", artist: "Broadcast", title: "Tender Buttons" });
    const facts = deriveCollectionFacts([a, b], { r1: 3, r2: 1 });
    expect(facts[0]).toEqual({ label: "Most rotated", value: "Low – Hey What" });
  });

  it("gates Most rotated behind the 2-play minimum", () => {
    const a = makeAlbum({ id: "r1" });
    expect(fact(deriveCollectionFacts([a], { r1: 1 }), "Most rotated")).toBeUndefined();
  });

  it("omits Most rotated when playCounts is not supplied", () => {
    const a = makeAlbum({ id: "r1" });
    expect(fact(deriveCollectionFacts([a]), "Most rotated")).toBeUndefined();
  });
});
