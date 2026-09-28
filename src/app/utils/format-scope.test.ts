import { describe, expect, it } from "vitest";
import { scopeAlbums } from "./format-scope";
import { makeAlbum } from "../../test/factories";

describe("scopeAlbums", () => {
  it("returns the same array reference for 'all'", () => {
    const albums = [makeAlbum({ format: "Vinyl, LP" }), makeAlbum({ format: "CD" })];
    expect(scopeAlbums(albums, "all")).toBe(albums);
  });

  it("keeps vinyl and drops CD/cassette for 'vinyl'", () => {
    const vinyl = makeAlbum({ format: "Vinyl, LP" });
    const cd = makeAlbum({ format: "CD" });
    const cassette = makeAlbum({ format: "Cassette" });
    const result = scopeAlbums([vinyl, cd, cassette], "vinyl");
    expect(result).toEqual([vinyl]);
  });

  it("drops an empty-format ('Other') row for 'vinyl'", () => {
    const vinyl = makeAlbum({ format: "Vinyl, LP" });
    const empty = makeAlbum({ format: "" });
    const result = scopeAlbums([vinyl, empty], "vinyl");
    expect(result).toEqual([vinyl]);
  });
});
