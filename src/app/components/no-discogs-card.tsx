import { useApp } from "./app-context";

/**
 * Shared "no Discogs connected" empty state card.
 *
 * Displayed on any screen when the user is signed in but hasn't
 * connected their Discogs account yet. Matches the Feed's
 * manually-styled card exactly.
 */
export function NoDiscogsCard({
  heading = "No albums found.",
  subtext = "Connect your Discogs collection to get started. It takes about 30 seconds.",
}: {
  heading?: string;
  subtext?: string;
}) {
  const { isDarkMode, requestConnectDiscogs } = useApp();

  const cardBg = "var(--c-surface)";
  const cardBorder = isDarkMode ? "var(--c-border-strong)" : "#D1D8DF";

  return (
    <div className="flex-1 flex items-center justify-center px-[16px] lg:px-[24px]">
      <div
        className="w-full max-w-[400px] rounded-[12px] flex flex-col items-center px-[24px] pt-[24px] pb-[32px]"
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${cardBorder}`,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {/* Primary text */}
        <p
          style={{
            fontSize: "18px",
            fontWeight: 600,
            fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
            color: "var(--c-text)",
            textAlign: "center",
            letterSpacing: "-0.2px",
            lineHeight: 1.3,
          }}
        >
          {heading}
        </p>

        {/* Secondary text */}
        <p
          style={{
            fontSize: "14px",
            fontWeight: 400,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: "var(--c-text-muted)",
            marginTop: "8px",
            textAlign: "center",
            lineHeight: 1.5,
            maxWidth: "300px",
          }}
        >
          {subtext}
        </p>

        {/* Connect button */}
        <button
          onClick={requestConnectDiscogs}
          className="w-full py-3 rounded-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-90"
          style={{
            backgroundColor: "#EBFD00",
            color: "#0C284A",
            fontSize: "15px",
            fontWeight: 600,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            lineHeight: 1.5,
            border: "1px solid rgba(12,40,74,0.25)",
            minHeight: "46px",
            marginTop: "24px",
          }}
        >
          Connect Discogs
        </button>
      </div>
    </div>
  );
}
