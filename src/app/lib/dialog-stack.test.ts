import { describe, expect, it } from "vitest";
import { pushDialog, popDialog, isTopDialog, hasOpenDialogs } from "./dialog-stack";

/**
 * The contract every Escape-closable overlay depends on: one keypress closes
 * one layer. Each overlay pushes on mount, pops on unmount, and acts only
 * while its token is topmost; the non-modal desktop side panel defers to
 * hasOpenDialogs(). Module-level state, so each test drains what it pushed.
 */

describe("dialog stack", () => {
  it("is empty until something registers", () => {
    expect(hasOpenDialogs()).toBe(false);
  });

  it("gives Escape to the topmost layer only", () => {
    const sheet = pushDialog();
    expect(isTopDialog(sheet)).toBe(true);

    // A picker opens over the sheet — it takes Escape, the sheet stops responding.
    const picker = pushDialog();
    expect(isTopDialog(picker)).toBe(true);
    expect(isTopDialog(sheet)).toBe(false);
    expect(hasOpenDialogs()).toBe(true);

    // Picker closes; the sheet gets Escape back rather than having closed too.
    popDialog(picker);
    expect(isTopDialog(sheet)).toBe(true);

    popDialog(sheet);
    expect(hasOpenDialogs()).toBe(false);
  });

  it("handles an unmount out of order", () => {
    // React does not guarantee that nested overlays unmount top-down (a parent
    // re-render can drop the lower one first), so popping from the middle must
    // not strand the stack or hand Escape to a closed layer.
    const a = pushDialog();
    const b = pushDialog();
    popDialog(a);
    expect(isTopDialog(b)).toBe(true);
    expect(isTopDialog(a)).toBe(false);

    popDialog(b);
    expect(hasOpenDialogs()).toBe(false);
    // A double pop (StrictMode double-invoked cleanup) is a no-op.
    popDialog(b);
    expect(hasOpenDialogs()).toBe(false);
  });
});
