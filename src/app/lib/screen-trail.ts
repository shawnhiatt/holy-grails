/**
 * Module-level breadcrumb of the last few screens the user visited, recorded
 * from the single setScreen chokepoint in app-context.
 *
 * Bug reports are filed from Settings, so "which screen were you on" is always
 * "settings" without this — the trail is what turns a report into "it broke on
 * the wantlist, two taps ago." Memory only; nothing is persisted.
 */

const MAX_TRAIL = 6;
const trail: string[] = [];

export function recordScreen(screen: string): void {
  if (trail[trail.length - 1] === screen) return;
  trail.push(screen);
  if (trail.length > MAX_TRAIL) trail.shift();
}

/** Oldest first, e.g. "feed → crate → settings". */
export function getScreenTrail(): string {
  return trail.join(" → ");
}
