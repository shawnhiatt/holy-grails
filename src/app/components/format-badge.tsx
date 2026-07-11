import { mediaType, type MediaType } from "./discogs-api";

/**
 * Non-vinyl media-type badge (all-formats plan D2). Renders a small chip
 * naming the medium — CD, Cassette, 78, … — for anything that classifies as a
 * non-vinyl physical/digital format. Vinyl stays unbadged so the default
 * aesthetic doesn't change for the vinyl majority; "Other" and missing/empty
 * formats (undefined) also render nothing (never assume vinyl).
 *
 * Two variants: "overlay" (scrim chip over artwork, theme-agnostic white on
 * black — matches the play-count/priority overlays) and "inline" (chip on a
 * themed surface using --c-chip-bg, for list rows and detail sections).
 */

const BADGE_LABEL: Partial<Record<MediaType, string>> = {
  Shellac: "78",
  CD: "CD",
  Cassette: "Cassette",
  Tape: "Tape",
  DVD: "DVD",
  "Blu-ray": "Blu-ray",
  Digital: "Digital",
  "Box Set": "Box Set",
};

/** The label to badge, or null when the format shouldn't be badged. */
export function formatBadgeLabel(format: string | undefined): string | null {
  if (!format) return null;
  return BADGE_LABEL[mediaType(format)] ?? null;
}

export function FormatBadge({
  format,
  variant = "inline",
  className,
}: {
  format: string | undefined;
  variant?: "overlay" | "inline";
  className?: string;
}) {
  const label = formatBadgeLabel(format);
  if (!label) return null;

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    borderRadius: "9999px",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontWeight: 600,
    fontSize: "10px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  const style: React.CSSProperties =
    variant === "overlay"
      ? {
          ...base,
          padding: "3px 6px",
          backgroundColor: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          color: "white",
        }
      : {
          ...base,
          padding: "2px 7px",
          backgroundColor: "var(--c-chip-bg)",
          color: "var(--c-text-secondary)",
        };

  return (
    <span className={className} style={style} aria-label={`Format: ${label}`}>
      {label}
    </span>
  );
}
