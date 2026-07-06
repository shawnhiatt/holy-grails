import { afterEach, describe, expect, it, vi } from "vitest";
import { pickRandom, shuffle } from "./shuffle";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const frozen = [...input];
    const result = shuffle(input);
    expect(input).toEqual(frozen);
    expect([...result].sort((a, b) => a - b)).toEqual(frozen);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([42])).toEqual([42]);
  });

  it("is a correct Fisher–Yates walk for a deterministic random sequence", () => {
    // With Math.random() pinned to 0, every swap targets index 0:
    // [a,b,c] → swap(2,0) → [c,b,a] → swap(1,0) → [b,c,a]
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(shuffle(["a", "b", "c"])).toEqual(["b", "c", "a"]);
  });
});

describe("pickRandom", () => {
  it("stays within bounds at the extremes of Math.random", () => {
    const arr = ["first", "middle", "last"];
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickRandom(arr)).toBe("first");
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(pickRandom(arr)).toBe("last");
  });
});
