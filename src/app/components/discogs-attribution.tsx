/**
 * The line Discogs' API Terms of Use require "directly next to any data" from the
 * API, linked to the discogs.com page that has the data (audit D-01). One quiet
 * footnote at the bottom of each detail screen that shows a release — album
 * detail, wantlist detail, Look It Up / feed release detail. Matches the iOS
 * app's DiscogsAttribution.
 *
 * THE ONE discogs.com LINK IN THE APP. eslint.config.js bans every other
 * discogs.com href (and exempts this file alone), because the Discogs app's
 * Universal Link can strand an installed-PWA user on its home screen. The terms
 * require a real link here, so this one is accepted. See "Outbound Discogs
 * links" in CLAUDE.md before adding another — don't.
 */

/** The terms' exact wording. Don't edit it for style. */
export const DISCOGS_ATTRIBUTION_TEXT = "Data provided by Discogs";

/** The notice Discogs requires "prominently" (audit D-02). Shown in Settings; same text as iOS. */
export const DISCOGS_NOTICE =
  "This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media, LLC.";

export function DiscogsAttribution({ releaseId }: { releaseId: number }) {
  return (
    <div className="px-4 pt-6 pb-2 flex justify-center">
      <a
        href={`https://www.discogs.com/release/${releaseId}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${DISCOGS_ATTRIBUTION_TEXT}. Opens this release on Discogs.`}
        className="inline-flex items-center justify-center"
        style={{
          minHeight: "44px",
          padding: "0 16px",
          fontSize: "12px",
          fontWeight: 400,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          color: "var(--c-text-secondary)",
          textDecoration: "underline",
          textUnderlineOffset: "2px",
          touchAction: "manipulation",
        }}
      >
        {DISCOGS_ATTRIBUTION_TEXT}
      </a>
    </div>
  );
}
