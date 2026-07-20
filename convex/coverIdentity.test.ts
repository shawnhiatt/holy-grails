import { describe, it, expect } from "vitest";
import { parseCoverIdentity } from "./coverIdentity";

describe("parseCoverIdentity", () => {
  it("returns artist and title for a confident identification", () => {
    expect(
      parseCoverIdentity({ identified: true, artist: "Fleetwood Mac", title: "Rumours" })
    ).toEqual({ artist: "Fleetwood Mac", title: "Rumours" });
  });

  it("trims surrounding whitespace", () => {
    expect(
      parseCoverIdentity({ identified: true, artist: "  Nina Simone ", title: " Pastel Blues\n" })
    ).toEqual({ artist: "Nina Simone", title: "Pastel Blues" });
  });

  it("returns null when the model is not confident", () => {
    expect(parseCoverIdentity({ identified: false, artist: "", title: "" })).toBeNull();
  });

  it("returns null when identified is truthy but not literally true", () => {
    expect(parseCoverIdentity({ identified: "yes", artist: "A", title: "B" })).toBeNull();
  });

  it("returns null for empty or whitespace-only fields", () => {
    expect(parseCoverIdentity({ identified: true, artist: "", title: "Rumours" })).toBeNull();
    expect(parseCoverIdentity({ identified: true, artist: "   ", title: "Rumours" })).toBeNull();
    expect(parseCoverIdentity({ identified: true, artist: "Fleetwood Mac", title: "" })).toBeNull();
  });

  it("returns null for non-string fields", () => {
    expect(parseCoverIdentity({ identified: true, artist: 42, title: "Rumours" })).toBeNull();
    expect(parseCoverIdentity({ identified: true, artist: "Fleetwood Mac", title: null })).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseCoverIdentity(null)).toBeNull();
    expect(parseCoverIdentity(undefined)).toBeNull();
    expect(parseCoverIdentity("Fleetwood Mac - Rumours")).toBeNull();
    expect(parseCoverIdentity([])).toBeNull();
  });

  it("returns null for absurdly long fields", () => {
    expect(
      parseCoverIdentity({ identified: true, artist: "x".repeat(201), title: "Rumours" })
    ).toBeNull();
    expect(
      parseCoverIdentity({ identified: true, artist: "Fleetwood Mac", title: "x".repeat(201) })
    ).toBeNull();
  });
});
