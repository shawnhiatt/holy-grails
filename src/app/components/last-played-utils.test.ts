import { describe, it, expect } from "vitest";
import { playCountLabel, playMonthLabel } from "./last-played-utils";

const NOW = new Date("2026-06-20T12:00:00").getTime();
const at = (iso: string) => new Date(iso).getTime();

describe("playCountLabel", () => {
  it("returns a bare count for a single play", () => {
    expect(playCountLabel(1, at("2026-05-09T15:15:00"), NOW)).toBe("1 play");
  });

  it("falls back to a bare count when the first play is unknown", () => {
    expect(playCountLabel(10, undefined, NOW)).toBe("10 plays");
  });

  it("says 'this month' when the first play is in the current month", () => {
    expect(playCountLabel(3, at("2026-06-02T09:00:00"), NOW)).toBe("3 plays this month");
  });

  it("omits the year when the first play is earlier in the current year", () => {
    expect(playCountLabel(10, at("2026-05-09T15:15:00"), NOW)).toBe("10 plays since May");
  });

  it("includes the year when the first play is in a prior year", () => {
    expect(playCountLabel(42, at("2024-11-03T20:00:00"), NOW)).toBe("42 plays since Nov 2024");
  });

  it("handles the empty case", () => {
    expect(playCountLabel(0, undefined, NOW)).toBe("No plays");
  });
});

describe("playMonthLabel", () => {
  it("formats a timestamp as month + year", () => {
    expect(playMonthLabel(at("2026-06-20T08:44:00"))).toBe("Jun 2026");
  });
});
