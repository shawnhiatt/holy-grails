/**
 * Minimum native build — the native iOS app's "Update needed" gate.
 *
 * A PWA updates itself; a native build installed from TestFlight or the App
 * Store does not, so once a backend change leaves old builds behind, those
 * builds need telling. The floor lives in the `HG_MIN_NATIVE_BUILD` Convex
 * environment variable (a whole build number) so raising it needs no deploy.
 *
 * Fails OPEN, unlike the admin and OAuth allowlists: unset, blank, or anything
 * that is not a plain non-negative whole number reads as 0, which blocks
 * nothing. A typo here should never lock everyone out of the app — the worst
 * it can do is fail to show an update card.
 *
 * Pure module, no Convex imports (same pattern as admin.ts and
 * oauthCallback.ts) so the parsing is unit-testable without a deployment.
 */

export function parseMinNativeBuild(raw: string | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return 0;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : 0;
}
