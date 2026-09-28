import { describe, it, expect, vi } from "vitest";
import { singleFlight } from "./single-flight";

describe("singleFlight", () => {
  it("runs the wrapped fn once for two concurrent calls, and both callers get the same result", async () => {
    let calls = 0;
    let resolve!: (v: number) => void;
    const gate = new Promise<number>((r) => {
      resolve = r;
    });
    const fn = vi.fn(async () => {
      calls++;
      return gate;
    });
    const wrapped = singleFlight(fn);

    const p1 = wrapped();
    const p2 = wrapped();

    expect(calls).toBe(1);
    expect(wrapped.isInFlight()).toBe(true);

    resolve(42);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(42);
    expect(r2).toBe(42);
    expect(r1).toBe(r2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh run after the previous call settles", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      return calls;
    });
    const wrapped = singleFlight(fn);

    const first = await wrapped();
    expect(wrapped.isInFlight()).toBe(false);
    const second = await wrapped();

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("releases the guard on rejection, and does not poison later calls", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    const wrapped = singleFlight(fn);

    await expect(wrapped()).rejects.toThrow("boom");
    expect(wrapped.isInFlight()).toBe(false);

    await expect(wrapped()).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a concurrent caller during a failing run also gets the rejection", async () => {
    let reject!: (e: Error) => void;
    const gate = new Promise<string>((_, r) => {
      reject = r;
    });
    const fn = vi.fn(async () => gate);
    const wrapped = singleFlight(fn);

    const p1 = wrapped();
    const p2 = wrapped();
    reject(new Error("nope"));

    await expect(p1).rejects.toThrow("nope");
    await expect(p2).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes args through on the leading call", async () => {
    const fn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
    const wrapped = singleFlight(fn);

    const result = await wrapped(1, "x");
    expect(result).toBe("1-x");
    expect(fn).toHaveBeenCalledWith(1, "x");
  });
});
