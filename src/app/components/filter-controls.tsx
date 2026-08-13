/**
 * Shared filter UI — every filter drawer in the app is built from these.
 *
 * There are three drawers (Collection, followed-user profile, Look It Up's
 * pressing picker) plus the trigger buttons and active-filter chips on the
 * screens behind them. They had drifted: three private copies of `chipStyle`,
 * three of the section label, three of the Reset button, two declarations of
 * `MEDIA_TYPE_ORDER`, and a selected-chip ring that existed in one drawer and
 * not the others. A fix applied to one was a fix applied to one.
 *
 * Rule: no filter drawer builds its own chip, label, Reset, or footer. If a
 * surface needs something these don't do, widen the component rather than
 * hand-rolling beside it.
 */

import type { CSSProperties, ReactNode } from "react";
import { SlidersHorizontal, X } from "./icons";
import { mediaType, type MediaType } from "./discogs-api";

/** Display order for Format chips — common media first. */
export const MEDIA_TYPE_ORDER: MediaType[] = [
  "Vinyl", "CD", "Cassette", "Shellac", "Tape", "DVD", "Blu-ray", "Digital", "Box Set", "Other",
];

/** Media types actually present in a set of items, in display order. A Format
 *  section with one entry filters nothing, so callers hide it below 2. */
export function presentMediaTypes(items: { format?: string }[]): MediaType[] {
  const present = new Set<MediaType>();
  for (const it of items) present.add(mediaType(it.format || ""));
  return MEDIA_TYPE_ORDER.filter((t) => present.has(t));
}

/**
 * Chip fill. Selected carries a ring as well as a tint: the tint alone is
 * nearly invisible against the dark chip background, which is what made
 * selection so easy to miss. The unselected border is transparent rather than
 * absent so toggling a chip never shifts it by a pixel.
 */
export function filterChipStyle(active: boolean, isDarkMode: boolean): CSSProperties {
  const base = { fontSize: "13px", fontWeight: 500 } as const;
  return active
    ? {
        ...base,
        backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)",
        color: isDarkMode ? "#ACDEF2" : "#00527A",
        border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.45)" : "#00527A"}`,
      }
    : {
        ...base,
        backgroundColor: isDarkMode ? "var(--c-chip-bg)" : "#EFF1F3",
        color: "var(--c-text-secondary)",
        border: "1px solid transparent",
      };
}

/** A filter pill. `aria-pressed` is not optional — these are toggles, and a
 *  chip that doesn't announce its state is the accessibility gap that kept
 *  reappearing when each drawer wrote its own. */
export function FilterChipButton({
  label, active, onClick, isDarkMode, count,
}: {
  label: ReactNode;
  active: boolean;
  onClick: () => void;
  isDarkMode: boolean;
  /** Optional trailing count badge (the followed profile's Relationship chips). */
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5"
      style={filterChipStyle(active, isDarkMode)}
    >
      {label}
      {count !== undefined && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            backgroundColor: active ? (isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(0,82,122,0.12)") : "var(--c-border)",
            color: active ? (isDarkMode ? "#ACDEF2" : "#00527A") : "var(--c-text-muted)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Section eyebrow inside a filter drawer. */
export function FilterSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="uppercase tracking-wider mb-2.5" style={{ fontSize: "12px", fontWeight: 500, color: "var(--c-text-muted)" }}>
      {children}
    </p>
  );
}

/** Labelled section with its chips in a wrapping row. */
export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <FilterSectionLabel>{title}</FilterSectionLabel>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Sort is one-of-many, unlike the chips above it — radios, not toggles.
 *  Every drawer got this wrong in the same way before it was shared. */
export function FilterSortList<T extends string>({
  options, value, onChange, isDarkMode,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  isDarkMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Sort by">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          role="radio"
          aria-checked={value === opt.value}
          className="px-3 py-2.5 rounded-[8px] text-left transition-colors"
          style={value !== opt.value
            ? { fontSize: "14px", fontWeight: 400, color: "var(--c-text-secondary)" }
            : { fontSize: "14px", fontWeight: 500, backgroundColor: isDarkMode ? "rgba(172,222,242,0.2)" : "rgba(172,222,242,0.5)", color: isDarkMode ? "#ACDEF2" : "#00527A" }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Drawer header Reset. Callers pass it to SlideOutPanel's `headerAction`,
 *  gated on whether anything is actually active. */
export function FilterResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="transition-colors"
      style={{ fontSize: "13px", fontWeight: 500, fontFamily: "'DM Sans', system-ui, sans-serif", color: "var(--c-link)" }}
    >
      Reset
    </button>
  );
}

/**
 * Drawer footer CTA.
 *
 * Pass `matchCount` where the filters apply live — the list behind the sheet
 * is already filtered, so the button only closes and should say what closing
 * will show rather than claim to apply. Pass `label` instead where the drawer
 * genuinely stages a draft and applies it on tap (the pressing picker), which
 * is the one place "Apply Filters" is honest.
 */
export function FilterApplyButton({
  onClick, matchCount, label,
}: {
  onClick: () => void;
  matchCount?: number;
  label?: string;
}) {
  const text = label ?? (
    matchCount === 0
      ? "No releases match"
      : `Show ${matchCount} ${matchCount === 1 ? "release" : "releases"}`
  );
  return (
    <button
      onClick={onClick}
      className="w-full py-2.5 rounded-full transition-colors"
      style={{
        fontSize: "14px",
        fontWeight: 600,
        backgroundColor: "#EBFD00",
        color: "#16181C",
        border: "1px solid rgba(22,24,28,0.25)",
      }}
    >
      {text}
    </button>
  );
}

/** The SlidersHorizontal trigger that opens a filter drawer, with the dot that
 *  marks filters as active. The dot used to exist on the followed profile and
 *  not on the collection. */
export function FilterButton({
  onClick, active, compact = false, ariaLabel = "Filter",
}: {
  onClick: () => void;
  active: boolean;
  /** Mobile search rows run 34px; desktop runs 40px. */
  compact?: boolean;
  ariaLabel?: string;
}) {
  const size = compact ? "w-[34px] h-[34px]" : "w-10 h-10";
  const offset = compact ? 5 : 6;
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`${size} rounded-[10px] flex items-center justify-center transition-colors relative flex-shrink-0`}
      style={{ backgroundColor: "var(--c-surface)", border: "1px solid var(--c-border-strong)", color: "var(--c-text-muted)" }}
    >
      <SlidersHorizontal size={18} />
      {active && (
        <span className="absolute rounded-full" style={{ top: offset, right: offset, width: 6, height: 6, backgroundColor: "var(--c-link)" }} />
      )}
    </button>
  );
}

/** Dismissible chip summarising one active filter, shown on the screen behind
 *  the drawer. Tapping clears that filter. */
export function ActiveFilterChip({
  label, onClear, isDarkMode,
}: {
  label: string;
  onClear: () => void;
  isDarkMode: boolean;
}) {
  return (
    <button
      onClick={onClear}
      aria-label={`Clear filter: ${label}`}
      className="flex items-center gap-1.5 rounded-full tappable transition-colors shrink-0"
      style={{
        fontSize: "12px",
        fontWeight: 500,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        backgroundColor: isDarkMode ? "rgba(172,222,242,0.15)" : "rgba(172,222,242,0.5)",
        color: isDarkMode ? "#ACDEF2" : "var(--c-text-secondary)",
        border: `1px solid ${isDarkMode ? "rgba(172,222,242,0.3)" : "var(--c-border-strong)"}`,
        height: "24px",
        paddingLeft: "10px",
        paddingRight: "8px",
      }}
    >
      {label}
      <X size={11} style={{ color: isDarkMode ? "rgba(172,222,242,0.5)" : "#868B93" }} />
    </button>
  );
}
