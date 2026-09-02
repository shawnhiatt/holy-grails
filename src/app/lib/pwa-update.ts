/**
 * PWA update flow (see CLAUDE.md — Running the Project / PWA).
 *
 * The service worker is registered in 'prompt' mode: a new build installs and
 * waits rather than reloading silently. This module surfaces that waiting
 * update as an "Update available." toast with a Refresh action, and re-checks
 * for updates whenever the PWA regains visibility (an installed iOS PWA
 * resumed from the background never re-checks on its own, so this is the only
 * cue for a long-lived session). Settings also exposes a manual check.
 *
 * Reloading is done in place via updateServiceWorker(true): it posts
 * SKIP_WAITING to the waiting worker and reloads on controllerchange — no
 * force-close required.
 *
 * Two cases deliberately skip the toast and apply the update on the spot,
 * because in both of them there is no in-progress work a reload could lose:
 *
 *  1. THE BOOT WINDOW. An update that was already waiting when the app
 *     launched (downloaded during an earlier session) is applied immediately.
 *     This is 'prompt' mode still — the toast exists for updates that land
 *     mid-session, which is the case the mode was chosen for. At launch the
 *     user is looking at the loading screen, so the reload is invisible, and
 *     applying it here is what force-closing the PWA used to do by hand.
 *     The window closes on the first interaction or after BOOT_WINDOW_MS.
 *
 *  2. STALE-BUILD RECOVERY. The root ErrorBoundary calls
 *     recoverFromStaleBuild() when it catches an error meaning the running
 *     build no longer matches the backend (see lib/stale-build.ts) — the
 *     red-screen-after-a-Convex-deploy case. The matching build is usually
 *     mid-download at that moment, so this hurries the check along, applies
 *     the update the instant it is ready, and gives up to the caller if none
 *     arrives.
 *
 * This cannot loop: applyUpdate() only reloads once a genuinely new service
 * worker takes control, so a given build can only ever reload the page once.
 * If the error survives that, no further worker is waiting, recovery times
 * out, and the boundary shows its manual Reload card instead.
 */
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

/** How long after launch an update still counts as "nothing to interrupt". */
const BOOT_WINDOW_MS = 20_000;
/** How long stale-build recovery waits for a matching build to install. */
const RECOVERY_TIMEOUT_MS = 15_000;

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let needRefresh = false;
let toastVisible = false;

let bootWindowOpen = true;
let recoveryPending = false;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

export function isUpdateReady(): boolean {
  return needRefresh;
}

/** Activate the waiting worker and reload the page in place. */
export function applyUpdate(): void {
  void updateSW?.(true);
}

function closeBootWindow(): void {
  bootWindowOpen = false;
}

function showUpdateToast(): void {
  if (toastVisible) return;
  toastVisible = true;
  toast("Update available.", {
    duration: Infinity,
    action: {
      label: "Refresh",
      onClick: () => applyUpdate(),
    },
    onDismiss: () => { toastVisible = false; },
  });
}

/**
 * Called by the root ErrorBoundary when it catches a stale-build error. Applies
 * a waiting update right away, or waits for one to finish installing. Resolves
 * false when nothing arrived in time, which is the boundary's cue to stop
 * showing a spinner and offer a Reload button instead.
 */
export function recoverFromStaleBuild(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }
  // A build is already waiting — take it now.
  if (needRefresh || registration?.waiting) {
    applyUpdate();
    return Promise.resolve(true);
  }
  // Otherwise hurry the check along and let onNeedRefresh apply it on arrival.
  recoveryPending = true;
  registration?.update().catch(() => {});
  return new Promise((resolve) => {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => {
      recoveryPending = false;
      resolve(false);
    }, RECOVERY_TIMEOUT_MS);
  });
}

/**
 * Last resort behind the ErrorBoundary's Reload button, once automatic
 * recovery has already failed to produce a matching build. Takes a waiting
 * update if there is one; otherwise unregisters the worker so the reload goes
 * to the network instead of the precache it is stuck on. That is the same
 * hammer as force-closing the PWA, minus the part where the user has to know
 * about it — the worker re-registers and re-precaches on the next load.
 */
export function hardReload(): void {
  if (needRefresh || registration?.waiting) {
    applyUpdate();
    return;
  }
  const reload = () => window.location.reload();
  if (!("serviceWorker" in navigator)) {
    reload();
    return;
  }
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => {})
    .then(reload, reload);
}

/** Called once at startup (main.tsx). Safe to no-op outside a browser/SW env. */
export function initPwaUpdate(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  setTimeout(closeBootWindow, BOOT_WINDOW_MS);
  window.addEventListener("pointerdown", closeBootWindow, { once: true });
  window.addEventListener("keydown", closeBootWindow, { once: true });

  updateSW = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      // Recovery and launch both want the new build immediately; only a
      // mid-session update is worth interrupting someone to ask about.
      if (recoveryPending || bootWindowOpen) {
        applyUpdate();
        return;
      }
      showUpdateToast();
    },
    onRegisteredSW(_swUrl, reg) {
      registration = reg;
    },
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      registration?.update().catch(() => {});
    }
  });
}

/**
 * Manual check (Settings "Check for updates"). Triggers a service-worker
 * update and reports whether a newer build is pending. When one is found the
 * "Update available." toast is shown by onNeedRefresh; this settle window lets
 * the updatefound/installing events fire before we read the state.
 */
export async function checkForUpdates(): Promise<"updated" | "current" | "error"> {
  try {
    if (!("serviceWorker" in navigator)) return "current";
    const reg = registration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg) return "current";
    await reg.update();
    await new Promise((r) => setTimeout(r, 600));
    if (needRefresh || reg.waiting || reg.installing) return "updated";
    return "current";
  } catch {
    return "error";
  }
}
