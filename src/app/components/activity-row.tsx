import type { ReactNode } from "react";
import { getInitial } from "../utils/format";
import { safeTap } from "../lib/safe-tap";

/**
 * One row of followed-user activity — "shtapes added to collection / Here In
 * The Real World / Alan Jackson / Jul 20" — shared by the Feed's Following
 * Activity card and the Following screen's activity list. The two were
 * byte-identical markup in two files before this.
 *
 * Type hierarchy is deliberate. The album title is the dominant line, not the
 * username: the actionable object is the release (the trailing control adds it
 * to your wantlist), and the same username repeats down consecutive rows, so
 * emphasizing it builds a wall of identical tokens and buries the part that
 * actually varies. The actor line is demoted to a caption.
 *
 * Spacing does the grouping. Title and artist are welded (1px) because they are
 * one object; the caption above and the date below are pushed away (4px / 6px).
 * The uniform 2px gap this replaced meant proximity grouped nothing.
 */

export interface ActivityRowItem {
  followedUsername: string;
  followedAvatar?: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
  albumThumb?: string;
  displayDate: string;
}

/** iOS Safari mangles Tailwind's `truncate` on album-facing text — see CLAUDE.md. */
const truncate = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  WebkitTextOverflow: "ellipsis",
  maxWidth: "100%",
} as React.CSSProperties;

const FONT = "'DM Sans', system-ui, sans-serif";

export function ActivityRow({
  item,
  verb,
  isDarkMode,
  paddingClassName = "px-[16px]",
  onOpenAlbum,
  action,
}: {
  item: ActivityRowItem;
  /** " added to collection" | " added to wantlist" */
  verb: string;
  isDarkMode: boolean;
  /** Horizontal padding differs per host — the feed card is tighter than the screen. */
  paddingClassName?: string;
  onOpenAlbum: () => void;
  /** Trailing control (wantlist heart / In Collection marker), owned by the host. */
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-[12px] py-[12px] ${paddingClassName}`}
      style={{
        borderColor: "var(--c-border)",
        borderTopWidth: "1px",
        borderTopStyle: "solid" as const,
      }}
    >
      {/* Album cover with avatar overlay */}
      <div
        className="relative flex-shrink-0 cursor-pointer"
        style={{ width: "60px", height: "60px", touchAction: "manipulation" }}
        {...safeTap(onOpenAlbum)}
      >
        <img
          loading="lazy"
          decoding="async"
          src={item.albumThumb || item.albumCover}
          alt={item.albumTitle}
          className="w-full h-full rounded-[8px] object-cover"
        />
        {/* Avatar overlay — bottom-left corner */}
        <div
          className="absolute flex items-center justify-center overflow-hidden"
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            bottom: "-6px",
            left: "-6px",
            border: `2px solid ${isDarkMode ? "oklab(from #101318 l a b / 0.65)" : "rgba(255,255,255,0.65)"}`,
            backgroundColor: isDarkMode ? "#252931" : "#ACDEF2",
          }}
        >
          {item.followedAvatar ? (
            <img
              loading="lazy"
              decoding="async"
              src={item.followedAvatar}
              alt={item.followedUsername}
              className="w-full h-full object-cover"
            />
          ) : (
            <span
              style={{
                fontSize: "9px",
                fontWeight: 700,
                color: isDarkMode ? "#ACDEF2" : "#16181C",
                fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
                lineHeight: 1,
              }}
            >
              {getInitial(item.followedUsername)}
            </span>
          )}
        </div>
      </div>

      {/* Text block */}
      <div className="flex-1" style={{ minWidth: 0, overflow: "hidden" }}>
        {/* Caption — who did what. Subordinate to the album on purpose. */}
        <p
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--c-text-muted)",
            fontFamily: FONT,
            lineHeight: 1.35,
            ...truncate,
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--c-text-secondary)" }}>
            {item.followedUsername}
          </span>
          {verb}
        </p>
        {/* Title — the dominant line */}
        <p
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--c-text)",
            fontFamily: FONT,
            lineHeight: 1.3,
            marginTop: "4px",
            ...truncate,
          }}
        >
          {item.albumTitle}
        </p>
        {/* Artist — welded to the title; the two are one object */}
        <p
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--c-text-secondary)",
            fontFamily: FONT,
            lineHeight: 1.35,
            marginTop: "1px",
            ...truncate,
          }}
        >
          {item.albumArtist}
        </p>
        <p
          style={{
            fontSize: "11px",
            fontWeight: 400,
            color: "var(--c-text-faint)",
            fontFamily: FONT,
            lineHeight: 1.35,
            marginTop: "6px",
          }}
        >
          {item.displayDate}
        </p>
      </div>

      {action}
    </div>
  );
}
