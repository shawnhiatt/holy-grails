import React from "react";
import { Check, HelpCircle, StackMinus } from "./icons";
import { purgeButtonBg, purgeButtonText, purgeTagColor, purgeOutlineBorder } from "./purge-colors";

/**
 * Shared Keep / Maybe / Cut verdict button row.
 * One visual grammar everywhere: solid fill = selected verdict,
 * tag-colored outline = available choice. Icons match the Purge
 * Tracker row buttons (Check / HelpCircle / StackMinus).
 *
 * Selection semantics live at the call site — the feed evaluator
 * commits and advances, the album detail toggles (tap active to clear).
 */

export type PurgeVerdict = "keep" | "maybe" | "cut";

const VERDICTS: { tag: PurgeVerdict; label: string; Icon: typeof Check }[] = [
  { tag: "keep", label: "Keep", Icon: Check },
  { tag: "maybe", label: "Maybe", Icon: HelpCircle },
  { tag: "cut", label: "Cut", Icon: StackMinus },
];

export function PurgeVerdictButtons({ activeTag, onSelect, isDark }: {
  activeTag: string | null | undefined;
  onSelect: (tag: PurgeVerdict) => void;
  isDark: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "8px" }}>
      {VERDICTS.map(({ tag, label, Icon }) => {
        const isActive = activeTag === tag;
        return (
          <button
            key={tag}
            className="tappable"
            onClick={() => onSelect(tag)}
            style={{
              flex: 1,
              height: "36px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              border: `1.5px solid ${isActive ? "transparent" : purgeOutlineBorder(tag, isDark)}`,
              fontSize: "13px",
              fontWeight: 600,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              backgroundColor: isActive ? purgeButtonBg(tag, isDark) : "transparent",
              color: isActive ? purgeButtonText(tag, isDark) : purgeTagColor(tag, isDark),
              cursor: "pointer",
              touchAction: "manipulation",
              transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
            }}
          >
            <Icon size={14} weight="bold" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
