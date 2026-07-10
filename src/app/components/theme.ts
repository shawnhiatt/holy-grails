/** Content-area theme tokens. Header & nav are unaffected by dark mode. */

export const lightTokens: Record<string, string> = {
  "--c-bg": "#F9F9FA",
  "--c-surface": "#FFFFFF",
  "--c-surface-hover": "#EFF1F3",
  "--c-surface-alt": "#F9F9FA",
  "--c-text": "#16181C",
  "--c-text-secondary": "#565A61",
  "--c-text-tertiary": "#70747C",
  "--c-text-muted": "#666A72",
  "--c-text-faint": "#767A82",
  "--c-border": "#D7DADE",
  "--c-border-strong": "#868B93",
  "--c-chip-bg": "#EFF1F3",
  "--c-input-bg": "#F9F9FA",
  "--c-destructive": "#FF33B6",
  "--c-destructive-hover": "#E6009E",
  "--c-destructive-tint": "rgba(255, 51, 182, 0.12)",
  "--c-link": "#0078B4",
  "--c-link-hover": "#005F8E",
  "--c-card-shadow": "0 4px 20px rgba(22,24,28,0.08)",
  "--c-sheet-shadow": "0 -8px 32px rgba(22, 24, 28, 0.1)",
  "--c-shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.15)",
  "--c-shadow-modal": "0 16px 48px rgba(22, 24, 28, 0.15)",
  // Light-mode accents: cyan/pink are the dark accents dropped to Oklab
  // L=0.52 with hue preserved (resolved: cyan #0078A5, pink #A428A1) so 11px
  // eyebrow text clears WCAG 4.5:1 on --c-bg. Yellow is the exception:
  // hue-preserved darkening of #EBFD00 (h≈115°, green side) can only produce
  // olive/mud, so it hue-shifts to a brass gold — oklch(0.54 0.115 86°),
  // 4.9:1 on --c-bg. Darkened gold reads "yellow family"; darkened yellow doesn't.
  "--c-accent-cyan": "oklab(from #00CFFF 0.52 a b)",
  "--c-accent-pink": "oklab(from #F276EC 0.52 a b)",
  "--c-accent-yellow": "#8C6800",
};

// Dark mode is a cool near-neutral gray family (v0.7 retheme — the navy family
// was deprecated so the app/brand no longer reads as "blue"). The whole ramp is
// derived in Oklab from one cool-gray anchor (#14171D — a hint of blue chroma,
// deliberately not fully desaturated), preserving the a/b axes so every layer
// carries the same subtle cool tint. Elevation is the same perceptual-step
// hierarchy as before: --c-bg lowest, borders highest. Accent pops (yellow link,
// pink destructive, cyan/pink/yellow accents) are unchanged — the color lives in
// the accents, not the surfaces.
export const darkTokens: Record<string, string> = {
  "--c-bg": "oklab(from #14171D calc(l - 0.035) a b)",
  "--c-surface": "#14171D",
  "--c-surface-hover": "oklab(from #14171D calc(l + 0.04) a b)",
  "--c-surface-alt": "oklab(from #14171D calc(l - 0.015) a b)",
  "--c-text": "#E6E8EC",
  "--c-text-secondary": "#AAB0BA",
  "--c-text-tertiary": "#969CA6",
  "--c-text-muted": "#868C96",
  "--c-text-faint": "#727882",
  "--c-border": "oklab(from #14171D calc(l + 0.06) a b)",
  "--c-border-strong": "oklab(from #14171D calc(l + 0.14) a b)",
  "--c-chip-bg": "oklab(from #14171D calc(l + 0.04) a b)",
  "--c-input-bg": "oklab(from #14171D calc(l - 0.015) a b)",
  "--c-destructive": "#FF33B6",
  "--c-destructive-hover": "#E6009E",
  "--c-destructive-tint": "rgba(255, 51, 182, 0.08)",
  "--c-link": "#EBFD00",
  "--c-link-hover": "#d9e800",
  "--c-card-shadow": "0 4px 20px rgba(0,0,0,0.25)",
  "--c-sheet-shadow": "0 -8px 32px rgba(0, 0, 0, 0.3)",
  "--c-shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.15)",
  "--c-shadow-modal": "0 16px 48px rgba(0, 0, 0, 0.4)",
  "--c-accent-cyan": "#00CFFF",
  "--c-accent-pink": "#F276EC",
  "--c-accent-yellow": "#EBFD00",
};

export function getContentTokens(isDark: boolean) {
  return isDark ? darkTokens : lightTokens;
}
