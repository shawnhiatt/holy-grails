import { useMemo, useState } from "react";
import { Disc3 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { getContentTokens } from "./theme";

type Pending = "share" | "private" | null;

export function ShareActivityPrompt() {
  const { setShareActivity, isDarkMode } = useApp();
  const [pending, setPending] = useState<Pending>(null);
  const contentTokens = useMemo(() => getContentTokens(isDarkMode), [isDarkMode]);

  const handleChoice = async (value: boolean) => {
    setPending(value ? "share" : "private");
    try {
      await setShareActivity(value);
    } catch (err) {
      console.error("[ShareActivityPrompt] setShareActivity failed:", err);
      toast.error("Could not save. Try again.");
      setPending(null);
    }
  };

  const disabled = pending !== null;

  return (
    <div
      className="w-screen flex flex-col items-center justify-center px-6"
      style={{
        ...contentTokens,
        height: "100dvh",
        backgroundColor: "var(--c-bg)",
        color: "var(--c-text)",
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      } as React.CSSProperties}
    >
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <h1
          style={{
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            fontWeight: 700,
            fontSize: "32px",
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            color: "var(--c-text)",
            margin: 0,
          }}
        >
           Do you want to share your activity?
        </h1>

        <p
          style={{
            fontSize: "15px",
            fontWeight: 400,
            lineHeight: 1.5,
            color: "var(--c-text-secondary)",
            marginTop: "16px",
            marginBottom: 0,
          }}
        >
          Followers who use Holy Grails can see your play counts and recent
          listens. You can change this any time in Settings.
        </p>

        <div className="w-full flex flex-col" style={{ marginTop: 32, gap: 12 }}>
          <button
            onClick={() => handleChoice(true)}
            disabled={disabled}
            className="w-full py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer flex-shrink-0 hover:bg-[#d9e800]"
            style={{
              backgroundColor: "#EBFD00",
              color: "#0C284A",
              fontSize: "14px",
              fontWeight: 600,
              lineHeight: 1.5,
              border: "1px solid rgba(12,40,74,0.25)",
              opacity: disabled && pending !== "share" ? 0.5 : pending === "share" ? 0.85 : 1,
            }}
          >
            {pending === "share" && (
              <Disc3 size={16} strokeWidth={2} className="disc-spinner" />
            )}
            Share my activity
          </button>

          <button
            onClick={() => handleChoice(false)}
            disabled={disabled}
            className="w-full py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer flex-shrink-0"
            style={{
              backgroundColor: "transparent",
              color: "var(--c-text-secondary)",
              fontSize: "14px",
              fontWeight: 500,
              lineHeight: 1.5,
              border: "none",
              opacity: disabled && pending !== "private" ? 0.5 : 1,
            }}
          >
            {pending === "private" && (
              <Disc3 size={16} strokeWidth={2} className="disc-spinner" />
            )}
            Keep it private
          </button>
        </div>
      </div>
    </div>
  );
}
