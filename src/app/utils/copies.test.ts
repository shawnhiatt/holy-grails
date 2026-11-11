import { describe, expect, it } from "vitest";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { Id } from "../../../convex/_generated/dataModel";
import { foldByCopy } from "../../../convex/copies";
import { evaluateStackRule, type RuleAlbum, type StackRule } from "../../../convex/stackRules";
import {
  buildPlayMaps,
  cacheMatchArgs,
  cacheRemoveArgs,
  copyArgs,
  copyKey,
  defaultCopyOf,
  deriveAlbums,
  instanceOfKey,
  needsReleaseOnlyTagClear,
  sessionMemberArgs,
  sessionMemberKeys,
} from "./copies";

/* Every copy (DW-04c): the PWA's album is one copy. These pin the pieces
   app-context.tsx is built from, with a hand-made collection that owns two
   copies of one release (release 7: copies 71 and 72) beside a release owned
   once (release 8: copy 81). */

function row(releaseId: number, instanceId: number, extra: Partial<Doc<"collection">> = {}): Doc<"collection"> {
  return {
    _id: `row-${instanceId}` as Id<"collection">,
    _creationTime: 0,
    discogsUsername: "dj",
    releaseId,
    instanceId,
    folderId: 1,
    artist: `Artist ${releaseId}`,
    title: `Title ${releaseId}`,
    year: 1990,
    cover: `cover-${releaseId}`,
    folder: "Uncategorized",
    label: "Label",
    catalogNumber: "CAT",
    format: "Vinyl, LP",
    mediaCondition: "VG+",
    sleeveCondition: "VG",
    notes: "",
    dateAdded: "2024-01-01T00:00:00-08:00",
    ...extra,
  };
}

const TWO_COPIES = [row(7, 72, { folder: "Shelf B" }), row(7, 71, { folder: "Shelf A" }), row(8, 81)];

describe("copy keys", () => {
  it("round-trips an instance id", () => {
    expect(copyKey(123)).toBe("c-123");
    expect(instanceOfKey(copyKey(123))).toBe(123);
  });

  /* The reason for the prefix: anything that isn't a copy key — a bare
     release id from old code, a want id, a friend's album — is NaN, which the
     server refuses, never a valid-looking number. */
  it("is NaN for anything that isn't a copy key", () => {
    for (const id of ["123", "w-123", "c-", "c-1.5", "c-12a", "r-7", ""]) {
      expect(instanceOfKey(id)).toBeNaN();
    }
  });
});

describe("deriveAlbums", () => {
  it("makes one card per copy, each with its own id", () => {
    const albums = deriveAlbums(TWO_COPIES, []);
    expect(albums.map((a) => a.id)).toEqual(["c-72", "c-71", "c-81"]);
    expect(albums.map((a) => a.release_id)).toEqual([7, 7, 8]);
    expect(new Set(albums.map((a) => a.id)).size).toBe(albums.length);
  });

  it("gives each copy its own verdict", () => {
    const albums = deriveAlbums(TWO_COPIES, [{ release_id: 7, instance_id: 72, tag: "cut" }]);
    expect(albums.find((a) => a.id === "c-72")!.purgeTag).toBe("cut");
    expect(albums.find((a) => a.id === "c-71")!.purgeTag).toBeNull();
  });

  /* A release-only verdict (from before the copy migration) sits on the
     release's default copy, the lowest instance id, as the server folds it. */
  it("puts a release-only verdict on the default copy only", () => {
    const albums = deriveAlbums(TWO_COPIES, [{ release_id: 7, tag: "keep" }]);
    expect(albums.find((a) => a.id === "c-71")!.purgeTag).toBe("keep");
    expect(albums.find((a) => a.id === "c-72")!.purgeTag).toBeNull();
  });

  /* "Looks exactly as before": with one copy per release (the sync's sticky
     dedupe, until DW-04e) every verdict lands where the old by-release map
     put it, whichever shape its row has. */
  it("matches the old by-release verdicts for a one-copy collection", () => {
    const rows = [row(1, 11), row(2, 21), row(3, 31), row(4, 41)];
    const tags = [
      { release_id: 1, instance_id: 11, tag: "cut" as const },
      { release_id: 2, tag: "keep" as const },
      { release_id: 3, instance_id: 31, tag: "maybe" as const },
      { release_id: 9, tag: "cut" as const }, // not owned: shows nowhere
    ];
    const old = new Map(tags.map((t) => [t.release_id, t.tag]));
    for (const a of deriveAlbums(rows, tags)) {
      expect(a.purgeTag).toBe(old.get(a.release_id) ?? null);
    }
  });
});

describe("Purge Cut targets", () => {
  it("removes only the copy marked Cut, by its instance id", () => {
    const albums = deriveAlbums(TWO_COPIES, [{ release_id: 7, instance_id: 72, tag: "cut" }]);
    const cut = albums.filter((a) => a.purgeTag === "cut");
    expect(cut.map((a) => a.id)).toEqual(["c-72"]);
    expect(cacheRemoveArgs(cut[0])).toEqual({ releaseId: 7, instanceId: 72 });
    expect(copyArgs(cut[0])).toEqual({ release_id: 7, instance_id: 72 });
  });
});

describe("write arguments", () => {
  it("always name both the release and the copy", () => {
    const [b, a] = deriveAlbums(TWO_COPIES, []);
    expect(copyArgs(a)).toEqual({ release_id: 7, instance_id: 71 });
    expect(copyArgs(b)).toEqual({ release_id: 7, instance_id: 72 });
    expect(cacheMatchArgs(b)).toEqual({ releaseId: 7, matchInstanceId: 72 });
  });
});

describe("buildPlayMaps", () => {
  it("puts a play on the copy that was played, not its twin", () => {
    const { countMap, lastPlayedMap, playLog } = buildPlayMaps(
      [{ release_id: 7, instance_id: 72, played_at: 5000 }],
      TWO_COPIES
    );
    expect(countMap).toEqual({ "c-72": 1 });
    expect(lastPlayedMap["c-71"]).toBeUndefined();
    expect(lastPlayedMap["c-72"]).toBe(new Date(5000).toISOString());
    expect(playLog).toEqual([{ albumId: "c-72", releaseId: 7, playedAt: 5000 }]);
  });

  it("puts a release-only play on the default copy, and an unowned one on no card", () => {
    const { countMap, allTimestamps } = buildPlayMaps(
      [
        { release_id: 7, played_at: 1000 },
        { release_id: 99, played_at: 2000 },
      ],
      TWO_COPIES
    );
    expect(countMap["c-71"]).toBe(1);
    expect(countMap["c-72"]).toBeUndefined();
    // Still counted in totals and streaks, under a key no copy has.
    expect(allTimestamps).toEqual([1000, 2000]);
    expect(Object.keys(countMap).filter((k) => k.startsWith("c-"))).toEqual(["c-71"]);
  });

  /* The share link and the native app evaluate rules server-side with
     foldByCopy. The PWA's play maps must put every play on the same copy, or
     a rule on plays would match differently for the owner. */
  it("agrees with the server's foldByCopy", () => {
    const plays = [
      { release_id: 7, instance_id: 72, played_at: 3000 },
      { release_id: 7, instance_id: 72, played_at: 4000 },
      { release_id: 7, played_at: 9000 },
      { release_id: 8, instance_id: 81, played_at: 1000 },
      { release_id: 8, instance_id: 80, played_at: 8000 }, // a copy that left
      { release_id: 99, played_at: 7000 },
    ];
    const { countMap, lastPlayedMap } = buildPlayMaps(plays, TWO_COPIES);
    const fold = foldByCopy(TWO_COPIES, [], plays);
    for (const r of TWO_COPIES) {
      const f = fold.get(r.instanceId)!;
      expect(countMap[copyKey(r.instanceId)] ?? 0).toBe(f.playCount);
      const last = lastPlayedMap[copyKey(r.instanceId)];
      expect(last ? new Date(last).getTime() : null).toBe(f.lastPlayedAt);
    }
  });
});

describe("defaultCopyOf", () => {
  it("is the lowest instance id of the release", () => {
    const albums = deriveAlbums(TWO_COPIES, []);
    expect(defaultCopyOf(albums, 7)!.id).toBe("c-71");
    expect(defaultCopyOf(albums, 8)!.id).toBe("c-81");
    expect(defaultCopyOf(albums, 99)).toBeUndefined();
  });
});

describe("needsReleaseOnlyTagClear", () => {
  const albums = deriveAlbums(TWO_COPIES, []);
  const [b, a] = albums;
  it("is false with no release-only verdict for the release", () => {
    expect(needsReleaseOnlyTagClear(a, albums, [{ release_id: 7, instance_id: 71, tag: "cut" }])).toBe(false);
  });
  it("is true only for the default copy when a release-only verdict exists", () => {
    const tags = [{ release_id: 7, tag: "cut" as const }];
    expect(needsReleaseOnlyTagClear(a, albums, tags)).toBe(true);
    expect(needsReleaseOnlyTagClear(b, albums, tags)).toBe(false);
  });
});

describe("session members", () => {
  const albums = deriveAlbums(TWO_COPIES, []);

  it("hold the chosen copy, with its release beside it", () => {
    expect(sessionMemberArgs(["c-72"], albums)).toEqual({ copy_ids: [72], album_ids: [7] });
    expect(sessionMemberArgs(["c-72", "c-81", "c-71"], albums)).toEqual({
      copy_ids: [72, 81, 71],
      album_ids: [7, 8],
    });
  });

  it("keep a copy that has left the collection (it shows nowhere)", () => {
    expect(sessionMemberArgs(["c-55"], albums)).toEqual({ copy_ids: [55], album_ids: [] });
  });

  it("refuse anything that isn't a copy key", () => {
    expect(() => sessionMemberArgs(["7"], albums)).toThrow();
    expect(() => sessionMemberArgs(["c-0"], albums)).toThrow();
  });

  it("hydrate from copy_ids, or from each release's default copy", () => {
    expect(sessionMemberKeys({ copy_ids: [72, 55], album_ids: [7] }, TWO_COPIES)).toEqual(["c-72", "c-55"]);
    expect(sessionMemberKeys({ album_ids: [7, 99, 8, 7] }, TWO_COPIES)).toEqual(["c-71", "c-81"]);
    expect(sessionMemberKeys({ copy_ids: [], album_ids: [7] }, TWO_COPIES)).toEqual([]);
  });
});

describe("auto sessions over two copies", () => {
  const rule: StackRule = {
    match: "all",
    conditions: [{ field: "artist", op: "contains", value: "Artist 7" }],
    sort: "artist-az",
    rotation: "off",
  };
  const ruleAlbums: RuleAlbum[] = deriveAlbums(TWO_COPIES, []).map((a) => ({
    releaseId: a.release_id,
    instanceId: a.instance_id,
    artist: a.artist,
    title: a.title,
    label: a.label,
    year: a.year,
    format: a.format,
    folder: a.folder,
    mediaCondition: a.mediaCondition,
    dateAdded: a.dateAdded,
  }));

  it("shows both matching copies (Q3)", () => {
    const res = evaluateStackRule(ruleAlbums, rule, { stackId: "s1" });
    expect(res.albums.map((a) => copyKey(a.instanceId!))).toEqual(["c-71", "c-72"]);
  });

  it("excludes one copy without the other", () => {
    const res = evaluateStackRule(ruleAlbums, rule, { stackId: "s1", excludedCopyIds: [instanceOfKey("c-72")] });
    expect(res.albums.map((a) => copyKey(a.instanceId!))).toEqual(["c-71"]);
  });
});
