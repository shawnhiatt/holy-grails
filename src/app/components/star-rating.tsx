import React, { useState } from "react";
import { Star } from "./icons";

/**
 * The user's own Discogs star rating — display and, when `onRate` is passed,
 * edit. Shared by album detail and the purge evaluator so one grammar covers
 * both: filled amber stars up to the rating, light outlines past it.
 *
 * Not the community average rating (album detail shows that separately from
 * the enriched release fetch). Different number, different meaning, and they
 * sit near each other — so this one is always labeled as yours.
 *
 * Rating 0 / undefined means UNRATED (see `hasRating` in discogs-api.ts), and
 * renders as five empty stars rather than as zero. Tapping the currently-set
 * star clears the rating, which is the only way back to unrated.
 */

/** Amber, the app's existing rating accent (see the permitted-accents list). */
const STAR_COLOR = "#FFC107";

export function StarRating({
  rating,
  onRate,
  size = 18,
  disabled = false,
  isDark = true,
}: {
  rating: number | undefined;
  /** Omit for a read-only display. Receives 1–5, or 0 to clear. */
  onRate?: (rating: number) => void;
  size?: number;
  disabled?: boolean;
  isDark?: boolean;
}) {
  // Which star the pointer is over, for hover preview on desktop. Never set
  // on touch — a tap fires click without a meaningful hover.
  const [hover, setHover] = useState<number | null>(null);
  const interactive = !!onRate && !disabled;
  const shown = hover ?? rating ?? 0;

  const stars = [1, 2, 3, 4, 5].map((n) => {
    const filled = n <= shown;
    const star = (
      <Star
        size={size}
        weight={filled ? "fill" : "light"}
        color={filled ? STAR_COLOR : isDark ? "#727882" : "#767A82"}
      />
    );

    if (!interactive) return <span key={n} style={{ display: "flex" }}>{star}</span>;

    return (
      <button
        key={n}
        type="button"
        aria-label={n === rating ? `Clear rating` : `Rate ${n} star${n === 1 ? "" : "s"}`}
        aria-pressed={n <= (rating ?? 0)}
        onClick={() => onRate(n === rating ? 0 : n)}
        onMouseEnter={() => setHover(n)}
        onMouseLeave={() => setHover(null)}
        style={{
          display: "flex",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: "2px",
          margin: 0,
          cursor: "pointer",
          touchAction: "manipulation",
        }}
      >
        {star}
      </button>
    );
  });

  return (
    <div
      role={interactive ? "group" : "img"}
      aria-label={
        rating ? `Your rating: ${rating} of 5 stars` : "Not rated"
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: interactive ? "0px" : "2px",
        opacity: disabled ? 0.5 : 1,
        // Pull the button padding back so an interactive row lines up with a
        // read-only one at the same left edge.
        marginLeft: interactive ? "-2px" : 0,
      }}
    >
      {stars}
    </div>
  );
}
