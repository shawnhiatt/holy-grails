import { useLayoutEffect, useRef, useState } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows to fit what's typed into it instead of scrolling
 * inside a fixed box, up to a ceiling — the GitHub comment-box behavior. Used
 * by every free-text field in the app: album detail's Notes and custom fields,
 * the Settings profile About field, and the bug report message.
 *
 * `resize: none` stays on all of them: a drag handle is a desktop affordance
 * that does nothing on a phone, which is where these get typed. Auto-grow is
 * what replaces it.
 *
 * This owns the BEHAVIOR only — `className` and `style` pass through, so the
 * call sites keep the borders, radii and padding they each already had.
 * Flattening those into one look would be a design change nobody asked for.
 */
type AutoGrowTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  /** Receives the new text directly — call sites never touch the event. */
  onChange: (value: string) => void;
  /** Floors the height, exactly as the `rows` attribute did before. */
  rows: number;
  /**
   * Ceiling, in rows. Past it the field stops growing and scrolls its own
   * content. Ten is roughly where an uncapped field starts pushing the
   * controls under it off a phone screen with the keyboard up — the sheets
   * these live in scroll, but hunting for the Save button below a field that
   * grew to fill the viewport is worse than a scrollbar inside the field.
   */
  maxRows?: number;
};

export function AutoGrowTextarea({
  value,
  onChange,
  rows,
  maxRows = 10,
  style,
  ...rest
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  /**
   * The heights `rows` and `maxRows` produce, measured once before we ever
   * assign an explicit one. Measuring beats arithmetic here: only one call
   * site sets an explicit line-height, so `rows × 1.5em` would silently
   * resize the others. Latched on the first layout pass — after that the
   * element's height is ours, not the browser's, so it can't be re-read.
   */
  const boundsRef = useRef<{ floor: number; ceiling: number } | null>(null);
  /**
   * Overflow is React-owned rather than set imperatively beside the height:
   * a re-render for any other reason would re-apply the style prop and undo
   * an imperative `overflowY`, silently stranding a capped field with no way
   * to scroll. The guarded setState only re-renders when the field actually
   * crosses the ceiling, which is rare.
   */
  const [atCeiling, setAtCeiling] = useState(false);

  // useLayoutEffect, not useEffect: the resize has to land in the same frame
  // as the keystroke that caused it, or the box visibly trails a line behind
  // what has been typed. It also runs on mount, which is what sizes existing
  // content correctly the moment the field appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!boundsRef.current && el.offsetHeight > 0) {
      // Borrow the `rows` attribute to measure the ceiling, then put it back
      // and read the floor. Both reads happen before any explicit height
      // exists, so each is the browser's own answer for that row count.
      el.rows = Math.max(maxRows, rows);
      const ceiling = el.offsetHeight;
      el.rows = rows;
      boundsRef.current = { floor: el.offsetHeight, ceiling };
    }
    const bounds = boundsRef.current;

    el.style.height = "auto"; // release the previous height, or it can only grow
    // scrollHeight is content + padding and excludes the border, while an
    // assigned height under border-box INCLUDES it — so a bare scrollHeight
    // leaves the box a border short and the text scrolls by a hair.
    // offsetHeight - clientHeight is exactly that border: overflowX is always
    // hidden, so no horizontal scrollbar is in the difference.
    const border = el.offsetHeight - el.clientHeight;
    const wanted = Math.max(el.scrollHeight + border, bounds?.floor ?? 0);
    const capped = bounds ? Math.min(wanted, bounds.ceiling) : wanted;
    el.style.height = `${capped}px`;

    const hitCeiling = bounds ? wanted > bounds.ceiling : false;
    setAtCeiling((prev) => (prev === hitCeiling ? prev : hitCeiling));
  }, [value, rows, maxRows]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...style,
        resize: "none",
        // Below the ceiling the box always fits its content, so a scrollbar
        // could only ever flash for the frame between a keystroke and the
        // resize. At the ceiling it becomes the field's own scroll.
        overflowY: atCeiling ? "auto" : "hidden",
        overflowX: "hidden",
      }}
    />
  );
}
