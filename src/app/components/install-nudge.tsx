import { useState, useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
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
  const { sessionToken, isDarkMode } = useApp();
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
        <motion.div
          initial={{ y: "0", opacity: 1 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
          className="lg:hidden"
          style={{
            backgroundColor: "var(--c-surface)",
            borderBottom: "1px solid var(--c-border)",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
          >
            <img
              src="/favicon-96x96.png"
              alt=""
              className="w-8 h-8 rounded-[6px] flex-shrink-0"
            />
            <p
              className="flex-1 min-w-0"
              style={{
                fontSize: "13px",
                fontWeight: 400,
                color: "var(--c-text-secondary)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                lineHeight: 1.4,
              }}
            >
              {isIOS
                ? "Tap Share then \u2018Add to Home Screen\u2019 to install Holy Grails."
                : "Add Holy Grails to your home screen for the best experience."}
            </p>
            {!isIOS && deferredPromptRef.current && (
              <button
                onClick={handleInstall}
                className="flex-shrink-0 px-3 py-1.5 rounded-full cursor-pointer"
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: "#EBFD00",
                  color: "#0C284A",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                Add to Home Screen
              </button>
            )}
            <button
              onClick={dismiss}
              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer"
              style={{
                color: "var(--c-text-muted)",
              }}
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
