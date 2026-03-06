import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "./app-context";
import { EASE_OUT, DURATION_NORMAL } from "./motion-tokens";

const DISMISS_KEY = "hg_install_nudge_dismissed";

function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if ((navigator as any).standalone === true) return true;
  } catch { /* ignore */ }
  return false;
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !isStandalone();
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

function persistDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "true");
  } catch { /* ignore */ }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallNudge() {
  const { sessionToken } = useApp();
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Determine if we should show the nudge at all
  useEffect(() => {
    if (!sessionToken) return;
    if (isStandalone()) return;
    if (wasDismissed()) return;

    if (isIOSSafari()) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    // Android / Chrome — wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [sessionToken]);

  const dismiss = useCallback(() => {
    persistDismiss();
    setVisible(false);
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferredPromptRef.current = null;
    if (outcome === "accepted" || outcome === "dismissed") {
      dismiss();
    }
  }, [dismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
            className="lg:hidden"
            onClick={dismiss}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 149,
              backgroundColor: "rgba(0, 0, 0, 0.4)",
            }}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
            className="lg:hidden"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 150,
              backgroundColor: "var(--c-surface)",
              borderTop: "1px solid var(--c-border)",
              borderRadius: "20px 20px 0 0",
              paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
            }}
          >
            {/* Drag handle (decorative) */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "var(--c-border-strong)",
                }}
              />
            </div>

            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px" }}>
              <img
                src="/favicon-96x96.png"
                alt=""
                style={{ width: 48, height: 48, borderRadius: 8 }}
              />

              <p
                style={{
                  marginTop: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  color: "var(--c-text)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  textAlign: "center",
                }}
              >
                Holy Grails
              </p>

              <p
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  fontWeight: 400,
                  color: "var(--c-text-secondary)",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {isIOS
                  ? "Tap the Share button below, then choose \u2018Add to Home Screen\u2019."
                  : "Add Holy Grails to your home screen for the best experience."}
              </p>
            </div>

            {/* Buttons */}
            <div style={{ marginTop: 20, padding: "0 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              {!isIOS && deferredPromptRef.current && (
                <button
                  onClick={handleInstall}
                  className="cursor-pointer"
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 9999,
                    border: "none",
                    backgroundColor: "#EBFD00",
                    color: "#0C284A",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Add to Home Screen
                </button>
              )}

              <button
                onClick={dismiss}
                className="cursor-pointer"
                style={{
                  width: isIOS ? "100%" : "auto",
                  height: isIOS ? 48 : "auto",
                  borderRadius: 9999,
                  border: isIOS ? "1px solid var(--c-border)" : "none",
                  backgroundColor: "transparent",
                  color: isIOS ? "var(--c-text)" : "var(--c-text-muted)",
                  fontSize: isIOS ? 15 : 14,
                  fontWeight: isIOS ? 500 : 400,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  marginTop: isIOS ? 0 : 12,
                }}
              >
                Maybe Later
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
