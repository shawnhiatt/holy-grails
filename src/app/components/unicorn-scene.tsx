import { useEffect, useRef, useState } from "react";

const CDN_SRC =
  "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.1.4/dist/unicornStudio.umd.js";
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
interface DebugMeasurements {
  innerHeight: number;
  innerWidth: number;
  screenHeight: number;
  screenWidth: number;
  docClientHeight: number;
  docClientWidth: number;
  containerRectH: number;
  containerRectW: number;
  containerOffsetH: number;
  containerOffsetW: number;
  standalone: boolean | undefined;
}

interface DebugPostMeasurements {
  canvasRectH: number | null;
  canvasRectW: number | null;
  canvasStyleH: string | null;
  canvasStyleW: string | null;
  canvasOffsetH: number | null;
  canvasOffsetW: number | null;
}

function capturePreMeasurements(containerEl: HTMLElement): DebugMeasurements {
  const rect = containerEl.getBoundingClientRect();
  return {
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    screenHeight: screen.height,
    screenWidth: screen.width,
    docClientHeight: document.documentElement.clientHeight,
    docClientWidth: document.documentElement.clientWidth,
    containerRectH: rect.height,
    containerRectW: rect.width,
    containerOffsetH: containerEl.offsetHeight,
    containerOffsetW: containerEl.offsetWidth,
    standalone: (navigator as unknown as { standalone?: boolean }).standalone,
  };
}

function capturePostMeasurements(containerEl: HTMLElement): DebugPostMeasurements {
  const canvas = containerEl.querySelector("canvas");
  if (!canvas) {
    return { canvasRectH: null, canvasRectW: null, canvasStyleH: null, canvasStyleW: null, canvasOffsetH: null, canvasOffsetW: null };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    canvasRectH: rect.height,
    canvasRectW: rect.width,
    canvasStyleH: canvas.style.height || null,
    canvasStyleW: canvas.style.width || null,
    canvasOffsetH: canvas.offsetHeight,
    canvasOffsetW: canvas.offsetWidth,
  };
}

function DebugOverlay({ pre, post }: { pre: DebugMeasurements | null; post: DebugPostMeasurements | null }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !pre) return null;

  const style: React.CSSProperties = {
    position: "fixed",
    bottom: 8,
    left: 8,
    zIndex: 9999,
    background: "rgba(0,0,0,0.75)",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 1.4,
    padding: 8,
    borderRadius: 4,
    maxWidth: 260,
    pointerEvents: "auto",
  };

  const row = (label: string, value: unknown) => (
    <div key={label}>{label}: {String(value)}</div>
  );

  return (
    <div style={style}>
      <div style={{ position: "relative", paddingRight: 16 }}>
        <button
          onClick={() => setDismissed(true)}
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: "none",
            border: "none",
            color: "#fff",
            fontFamily: "monospace",
            fontSize: 13,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>PRE-INIT</div>
        {row("innerHeight", pre.innerHeight)}
        {row("innerWidth", pre.innerWidth)}
        {row("screen.height", pre.screenHeight)}
        {row("screen.width", pre.screenWidth)}
        {row("docClientH", pre.docClientHeight)}
        {row("docClientW", pre.docClientWidth)}
        {row("containerRect.h", pre.containerRectH)}
        {row("containerRect.w", pre.containerRectW)}
        {row("containerOffset.h", pre.containerOffsetH)}
        {row("containerOffset.w", pre.containerOffsetW)}
        {row("standalone", pre.standalone)}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.3)", margin: "6px 0" }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>POST-INIT</div>
        {post ? (
          <>
            {row("canvasRect.h", post.canvasRectH)}
            {row("canvasRect.w", post.canvasRectW)}
            {row("canvas.style.h", post.canvasStyleH)}
            {row("canvas.style.w", post.canvasStyleW)}
            {row("canvasOffset.h", post.canvasOffsetH)}
            {row("canvasOffset.w", post.canvasOffsetW)}
          </>
        ) : (
          <div style={{ color: "#9EAFC2" }}>Loading...</div>
        )}
      </div>
    </div>
  );
}

export function UnicornScene({ className }: UnicornSceneProps) {
  // Detect WebGL synchronously on first render — avoids a flicker cycle.
  const [webGLSupported] = useState<boolean>(() =>
    typeof window !== "undefined" ? isWebGLAvailable() : true
  );
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sceneRef = useRef<UnicornScene | null>(null);
  const [bottomExtension] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    // Only extend in iOS standalone PWA mode.
    // screen.height - window.innerHeight gives the exact pixel gap between
    // the layout viewport and the physical screen bottom.
    if (!(navigator as any).standalone) return 0;
    return Math.max(0, window.screen.height - window.innerHeight);
  });

  // Debug overlay state — only active when localStorage flag is set
  const [debugEnabled] = useState<boolean>(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("hg_debug_viewport") === "1"; } catch { return false; }
  });
  const [debugPre, setDebugPre] = useState<DebugMeasurements | null>(null);
  const [debugPost, setDebugPost] = useState<DebugPostMeasurements | null>(null);

  useEffect(() => {
    if (!webGLSupported || failed) return;
    let stale = false;

    const initScene = () => {
      if (!window.UnicornStudio || stale) return;

      // Capture pre-init measurements for debug overlay
      if (debugEnabled) {
        const containerEl = document.getElementById(ELEMENT_ID);
        if (containerEl) setDebugPre(capturePreMeasurements(containerEl));
      }

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

            // Capture post-init measurements for debug overlay
            if (debugEnabled) {
              const containerEl = document.getElementById(ELEMENT_ID);
              if (containerEl) setDebugPost(capturePostMeasurements(containerEl));
            }
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
        bottom: bottomExtension > 0 ? `-${bottomExtension}px` : "calc(-1 * env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        id={ELEMENT_ID}
        style={{ width: "100%", height: "100%" }}
      />
      {debugEnabled && <DebugOverlay pre={debugPre} post={debugPost} />}
    </div>
  );
}
