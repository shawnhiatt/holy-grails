import { useState, useEffect } from "react";

const MOBILE_SRC =
  "https://raw.githubusercontent.com/shawnhiatt/Holygrails/main/holy_grails_splash_screen-mobile.mp4";
const DESKTOP_SRC =
  "https://raw.githubusercontent.com/shawnhiatt/Holygrails/main/holy_grails_splash_screen-desktop.mp4";

/** Breakpoint matching the app's lg: (1024px) Tailwind threshold */
const DESKTOP_MQ = "(min-width: 1024px)";

/**
 * Fullscreen looping video background for splash / login screens.
 * Serves the desktop video on viewports >= 1024 px, mobile video below.
 * Falls back silently — if the video fails to load, the parent's gradient
 * background shows through underneath.
 */
export function SplashVideo() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_MQ).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MQ);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <video
      key={isDesktop ? "desktop" : "mobile"}
      autoPlay
      loop
      muted
      playsInline
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        zIndex: 0,
      }}
      src={isDesktop ? DESKTOP_SRC : MOBILE_SRC}
    />
  );
}
