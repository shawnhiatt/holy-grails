import { useState } from "react";
import { UnicornScene as LibraryScene } from "unicornstudio-react";

// Performance note: if the scene causes frame drops on the loading screen during
// active sync, lower SCENE_SCALE to 0.5 and tune SCENE_DPI accordingly.
const SCENE_SCALE = 0.75;
const SCENE_DPI = 1.5;
const PROJECT_ID = "YOUR_PROJECT_EMBED_ID";

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

  if (!webGLSupported || failed) {
    return (
      <div
        className={className}
        style={{ zIndex: 0, backgroundColor: "#01294D" }}
      />
    );
  }

  return (
    <div className={className} style={{ zIndex: 0 }}>
      <LibraryScene
        projectId={PROJECT_ID}
        scale={SCENE_SCALE}
        dpi={SCENE_DPI}
        lazyLoad={false}
        width="100%"
        height="100%"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
