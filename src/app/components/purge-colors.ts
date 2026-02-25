/**
 * Shared purge-tag color palette.
 * Every screen that renders Keep / Purge / Maybe / Unrated visuals
 * should import from here so the palette stays in sync.
 *
 * Design-system canonical colors:
 *   Keep:  #3E9842
 *   Cut:   dark #FF98DA / light #9A207C
 *   Maybe: dark #ACDEF2 / light #00476C
 */

import { toast } from "sonner";

/* ── per-tag primary color (the number / icon / border accent) ── */
export function purgeTagColor(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":    return "#3E9842";
    case "cut":     return isDark ? "#FF98DA" : "#9A207C";
    case "maybe":   return isDark ? "#ACDEF2" : "#00476C";
    case "unrated": return isDark ? "#9EAFC2" : "#01294D";
    default:        return isDark ? "#9EAFC2" : "#455B75";
  }
}

/* ── tinted background for stat cards / chips ── */
export function purgeTagBg(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":    return isDark ? "rgba(62,152,66,0.15)"   : "#DAF8DF";
    case "cut":     return isDark ? "rgba(255,152,218,0.15)" : "#FFF0FA";
    case "maybe":   return isDark ? "rgba(172,222,242,0.15)" : "#E2F4FB";
    case "unrated": return isDark ? "#0F2238"                : "#F5F5F6";
    default:        return isDark ? "#0F2238"                : "#F5F5F6";
  }
}

/* ── subtle border for stat cards ── */
export function purgeTagBorder(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":    return isDark ? "rgba(62,152,66,0.3)"    : "rgba(12,40,74,0.2)";
    case "cut":     return isDark ? "rgba(255,152,218,0.3)"  : "rgba(12,40,74,0.2)";
    case "maybe":   return isDark ? "rgba(172,222,242,0.3)"  : "rgba(12,40,74,0.2)";
    case "unrated": return isDark ? "#2D4A66"                : "rgba(12,40,74,0.2)";
    default:        return isDark ? "#2D4A66"                : "rgba(12,40,74,0.2)";
  }
}

/* ── label color inside stat cards (slightly different from the number) ── */
export function purgeTagLabel(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":    return isDark ? "#E2E8F0" : "#0C284A";
    case "cut":     return isDark ? "#9EAFC2" : "#9BA4B2";
    case "maybe":   return isDark ? "#E2E8F0" : "#0C284A";
    case "unrated": return isDark ? "#E2E8F0" : "#0C284A";
    default:        return isDark ? "#E2E8F0" : "#0C284A";
  }
}

/* ── light-opacity tint for interactive backgrounds (buttons, swipe reveal) ── */
export function purgeTagTint(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":    return isDark ? "rgba(62,152,66,0.12)"   : "rgba(62,152,66,0.12)";
    case "cut":     return isDark ? "rgba(255,152,218,0.12)" : "rgba(154,32,124,0.10)";
    case "maybe":   return isDark ? "rgba(172,222,242,0.15)" : "rgba(0,71,108,0.10)";
    case "unrated": return isDark ? "rgba(158,175,194,0.10)" : "rgba(1,41,77,0.06)";
    default:        return "transparent";
  }
}

/* ── left-border / dot indicator (a single color per tag, always vivid) ── */
export function purgeIndicatorColor(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":  return "#3E9842";
    case "cut":   return isDark ? "#FF98DA" : "#9A207C";
    case "maybe": return isDark ? "#ACDEF2" : "#00476C";
    default:      return "transparent";
  }
}

/* ── solid button fill (Keep / Cut / Maybe action buttons) ── */
export function purgeButtonBg(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":  return "#3E9842";
    case "cut":   return isDark ? "#FF98DA" : "#9A207C";
    case "maybe": return isDark ? "#ACDEF2" : "#00476C";
    default:      return isDark ? "#9EAFC2" : "#455B75";
  }
}

/* ── text color on solid purge buttons ── */
export function purgeButtonText(tag: string, isDark: boolean): string {
  switch (tag) {
    case "keep":  return "#FFFFFF";
    case "cut":   return isDark ? "#0C284A" : "#FFFFFF";
    case "maybe": return isDark ? "#0C284A" : "#FFFFFF";
    default:      return "#FFFFFF";
  }
}

/* ── color-coded purge toast ── */

const purgeToastLabels: Record<string, string> = {
  keep: "Kept.",
  cut: "Cut.",
  maybe: "Maybe.",
};

export function purgeToast(tag: string, isDark: boolean): void {
  const label = purgeToastLabels[tag] ?? "Tag cleared.";
  const bg = purgeButtonBg(tag, isDark);
  const text = purgeButtonText(tag, isDark);
  toast.dismiss();
  toast(label, {
    duration: 1500,
    style: {
      backgroundColor: bg,
      color: text,
      border: "none",
      fontWeight: 600,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    },
  });
}

export function purgeClearToast(): void {
  toast.dismiss();
  toast("Tag cleared.", { duration: 1500 });
}