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
 */
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;
let needRefresh = false;
let toastVisible = false;

export function isUpdateReady(): boolean {
  return needRefresh;
}

/** Activate the waiting worker and reload the page in place. */
export function applyUpdate(): void {
  void updateSW?.(true);
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

/** Called once at startup (main.tsx). Safe to no-op outside a browser/SW env. */
export function initPwaUpdate(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  updateSW = registerSW({
    onNeedRefresh() {
      needRefresh = true;
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
