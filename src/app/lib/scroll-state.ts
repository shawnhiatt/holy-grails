// Module-level scroll state — tracks last scroll time across all scroll containers.
// A single passive capture listener on document catches overflow-y scroll events
// from any container in the app.

let lastScrollTime = 0;

if (typeof window !== "undefined") {
  window.addEventListener(
    "scroll",
    () => { lastScrollTime = Date.now(); },
    { capture: true, passive: true }
  );
}

export function getLastScrollTime(): number {
  return lastScrollTime;
}

export function isScrollingRecently(cooldownMs = 80): boolean {
  return Date.now() - lastScrollTime < cooldownMs;
}
