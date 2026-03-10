import { useEffect, useRef, useState } from "react";

const CDN_SRC =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.1.0-1/dist/unicornStudio.umd.js";
const SCENE_JSON = "/splash-screen.json";

// Performance note: if the scene causes frame drops on the loading screen during
// active sync, lower scale to 0.5 and tune dpi accordingly.

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

interface UnicornScene {
  destroy: () => void;
  resize: () => void;
  paused: boolean;
}

declare global {
  interface Window {
    UnicornStudio?: {
      addScene: (opts: {
        elementId: string;
        filePath: string;
        fps?: number;
        scale?: number;
        dpi?: number;
        lazyLoad?: boolean;
        interactivity?: {
          mouse?: { disableMobile?: boolean; disabled?: boolean };
        };
      }) => Promise<UnicornScene>;
      destroy: () => void;
    };
  }
}

const ELEMENT_ID = "us-splash";

/**
 * Wrapper around the Unicorn Studio WebGL scene for use as a fullscreen
 * background. Loads from a self-hosted JSON export via addScene().
 * Falls back to a plain #01294D div if WebGL is unavailable or
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
  const [loaded, setLoaded] = useState(false);
  const sceneRef = useRef<UnicornScene | null>(null);

  useEffect(() => {
    if (!webGLSupported || failed) return;
    let stale = false;

    const initScene = () => {
      if (!window.UnicornStudio || stale) return;
      window.UnicornStudio.addScene({
        elementId: ELEMENT_ID,
        filePath: SCENE_JSON,
        fps: 60,
        scale: 1,
        dpi: 1.5,
      })
        .then((scene) => {
          if (stale) {
            scene.destroy();
          } else {
            sceneRef.current = scene;
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!stale) setFailed(true);
        });
    };

    const loadSDKAndInit = () => {
      // SDK already loaded
      if (window.UnicornStudio) {
        initScene();
        return;
      }

      // Script tag exists but SDK not ready yet — wait for load
      const existing = document.querySelector(`script[src="${CDN_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", initScene, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = CDN_SRC;
      script.type = "text/javascript";
      script.onload = initScene;
      script.onerror = () => {
        if (!stale) setFailed(true);
      };
      (document.head || document.body).appendChild(script);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadSDKAndInit, {
        once: true,
      });
    } else {
      loadSDKAndInit();
    }

    return () => {
      stale = true;
      if (sceneRef.current) {
        sceneRef.current.destroy();
        sceneRef.current = null;
      }
    };
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
    <div
      className={className}
      style={{
        zIndex: 0,
        opacity: loaded ? 1 : 0,
        transition: "opacity 0.6s ease-out",
      }}
    >
      <div
        id={ELEMENT_ID}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
