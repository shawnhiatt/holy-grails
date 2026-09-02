import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows to fit what's typed into it instead of scrolling
 * inside a fixed box. Used by every free-text field in the app: album detail's
 * Notes and custom fields, the Settings profile About field, and the bug
 * report message.
 *
 * `resize: none` stays on all of them: a drag handle is a desktop affordance
 * that does nothing on a phone, which is where these get typed. Auto-grow is
 * what replaces it.
 *
 * This owns the BEHAVIOR only — `className` and `style` pass through, so the
 * three call sites keep the borders, radii and padding they each already had.
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
};

export function AutoGrowTextarea({ value, onChange, style, ...rest }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  /**
   * The height `rows` produces, measured once before we ever assign an
   * explicit one. Measuring beats arithmetic here: only one of the three call
   * sites sets an explicit line-height, so `rows × 1.5em` would silently
   * resize the other two. Latched on the first layout pass — after that the
   * element's own height is ours, not the browser's, so it can't be re-read.
   */
  const floorRef = useRef<number | null>(null);

  // useLayoutEffect, not useEffect: the resize has to land in the same frame
  // as the keystroke that caused it, or the box visibly trails a line behind
  // what has been typed. It also runs on mount, which is what sizes existing
  // content correctly the moment the field appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (floorRef.current === null && el.offsetHeight > 0) {
      floorRef.current = el.offsetHeight;
    }
    el.style.height = "auto"; // release the previous height, or it can only grow
    // scrollHeight is content + padding and excludes the border, while an
    // assigned height under border-box INCLUDES it — so a bare scrollHeight
    // leaves the box a border short and the text scrolls by a hair.
    // offsetHeight - clientHeight is exactly that border (overflow is hidden,
    // so no scrollbar is in the difference).
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.max(el.scrollHeight + border, floorRef.current ?? 0)}px`;
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        ...style,
        resize: "none",
        // The box always fits its content, so a scrollbar could only ever
        // flash for the frame between a keystroke and the resize.
        overflow: "hidden",
      }}
    />
  );
}
