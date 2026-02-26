import { useState, useEffect } from "react";
import { Disc3 } from "lucide-react";
import { SplashVideo } from "./splash-video";

interface LoadingScreenProps {
  message: string;
}

/**
 * Unified full-screen loading state used across both the OAuth callback flow
 * and the post-login sync. Shows the same splash video background as the
 * login screen, a Disc3 spinner, and an animated ellipsis below the message.
 */
export function LoadingScreen({ message }: LoadingScreenProps) {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center overflow-hidden"
      style={{
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        backgroundColor: "#0C1A2E",
        background:
          "radial-gradient(ellipse 120% 60% at 50% 0%, #132B44 0%, #0C1A2E 100%)",
        position: "relative",
      }}
    >
      <SplashVideo />

      <div
        className="flex flex-col items-center gap-3"
        style={{ position: "relative", zIndex: 1 }}
      >
        <Disc3 size={32} className="disc-spinner" style={{ color: "#ACDEF2" }} />

        {/* Fixed-width wrapper keyed to the longest possible message so dots
            grow rightward without causing horizontal layout shift. */}
        <div style={{ position: "relative", display: "inline-block" }}>
          <span
            aria-hidden
            style={{
              visibility: "hidden",
              fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
              fontSize: 14,
              fontWeight: 400,
            }}
          >
            Fetching your profile...
          </span>
          <p
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              margin: 0,
              fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
              fontSize: 14,
              fontWeight: 400,
              color: "#9EAFC2",
              whiteSpace: "nowrap",
            }}
          >
            {message}
            {".".repeat(dots)}
          </p>
        </div>
      </div>
    </div>
  );
}
