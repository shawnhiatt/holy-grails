import { useApp } from "./app-context";

/**
 * Empty-state note shown when a user's Discogs collection or wantlist is set to
 * not-browsable ("Allow others to browse my …" off). Discogs 403s that read
 * even for the owner's own token, so HG can't display it — this explains why
 * the screen is empty and what to change. No outbound link (discogs.com hrefs
 * are banned app-wide) — instructional copy only. Matches NoDiscogsCard's card.
 */
export function PrivateDataCard({ kind }: { kind: "collection" | "wantlist" }) {
  const { isDarkMode } = useApp();
  const cardBorder = isDarkMode ? "var(--c-border-strong)" : "#D7DADE";

  const heading = kind === "collection" ? "Collection is private" : "Wantlist is private";
  const subtext =
    kind === "collection"
      ? 'Turn on "Allow others to browse my collection" in your Discogs privacy settings to see it here.'
      : 'Turn on "Allow others to browse my wantlist" in your Discogs privacy settings to see it here.';

  return (
    <div className="flex-1 flex items-center justify-center px-[16px] lg:px-[24px]">
      <div
        className="w-full max-w-[400px] rounded-[12px] flex flex-col items-center px-[24px] pt-[24px] pb-[32px]"
        style={{
          backgroundColor: "var(--c-surface)",
          border: `1px solid ${cardBorder}`,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
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
        <p
          style={{
            fontSize: "14px",
            fontWeight: 400,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            color: "var(--c-text-muted)",
            marginTop: "8px",
            textAlign: "center",
            lineHeight: 1.5,
            maxWidth: "320px",
          }}
        >
          {subtext}
        </p>
      </div>
    </div>
  );
}
