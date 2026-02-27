import { useEffect, useRef, useState } from "react";

const PROJECT_ID = "cnsv252lbgNqAPR7Odzz";
const CDN_SRC =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.0.5/dist/unicornStudio.umd.js";

// Performance note: if the scene causes frame drops on the loading screen during
// active sync, lower SCENE_SCALE to 0.5 and tune SCENE_DPI accordingly.

interface UnicornSceneProps {
  className?: string;
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ||
      (canvas.getContext as (id: string) => RenderingContext | null)(
        "experimental-webgl"
      )
    );
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    UnicornStudio?: {
      isInitialized: boolean;
      init: () => void;
    };
  }
}

/**
 * Wrapper around the Unicorn Studio WebGL scene for use as a fullscreen
 * background. Falls back to a plain #01294D div if WebGL is unavailable or
 * the scene fails to load — the parent's gradient shows through underneath.
 *
 * Usage: <UnicornScene className="absolute inset-0 w-full h-full" />
 */
export function UnicornScene({ className }: UnicornSceneProps) {
  // Detect WebGL synchronously on first render — avoids a flicker cycle.
  const [webGLSupported] = useState<boolean>(() =>
    typeof window !== "undefined" ? isWebGLAvailable() : true
  );
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!webGLSupported || failed) return;

    const loadAndInit = () => {
      if (window.UnicornStudio?.isInitialized) {
        window.UnicornStudio.init();
        return;
      }

      if (document.querySelector(`script[src="${CDN_SRC}"]`)) return;

      const script = document.createElement("script");
      script.src = CDN_SRC;
      script.type = "text/javascript";
      script.onload = () => {
        try {
          window.UnicornStudio?.init();
        } catch {
          setFailed(true);
        }
      };
      script.onerror = () => setFailed(true);
      (document.head || document.body).appendChild(script);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadAndInit, {
        once: true,
      });
    } else {
      loadAndInit();
    }
  }, [webGLSupported, failed]);

  if (!webGLSupported || failed) {
    return (
      <div
        className={className}
        style={{ zIndex: 0, backgroundColor: "#01294D" }}
      />
    );
  }

  return (
    <div className={className} style={{ zIndex: 0 }} ref={containerRef}>
      <div
        data-us-project={PROJECT_ID}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
