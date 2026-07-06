/** Content-area theme tokens. Header & nav are unaffected by dark mode. */

export const lightTokens: Record<string, string> = {
  "--c-bg": "#F9F9FA",
  "--c-surface": "#FFFFFF",
  "--c-surface-hover": "#EFF1F3",
  "--c-surface-alt": "#F9F9FA",
  "--c-text": "#0C284A",
  "--c-text-secondary": "#455B75",
  "--c-text-tertiary": "#617489",
  "--c-text-muted": "#5E6E80",
  "--c-text-faint": "#6E8093",
  "--c-border": "#D2D8DE",
  "--c-border-strong": "#74889C",
  "--c-chip-bg": "#EFF1F3",
  "--c-input-bg": "#F9F9FA",
  "--c-destructive": "#FF33B6",
  "--c-destructive-hover": "#E6009E",
  "--c-destructive-tint": "rgba(255, 51, 182, 0.12)",
  "--c-link": "#0078B4",
  "--c-link-hover": "#005F8E",
  "--c-card-shadow": "0 4px 20px rgba(12,40,74,0.08)",
  "--c-sheet-shadow": "0 -8px 32px rgba(12, 40, 74, 0.1)",
  "--c-shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.15)",
  "--c-shadow-modal": "0 16px 48px rgba(12, 40, 74, 0.15)",
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

export const darkTokens: Record<string, string> = {
  "--c-bg": "oklab(from #081A31 calc(l - 0.06) a b)",
  "--c-surface": "#071B30",
  "--c-surface-hover": "oklab(from #172E4C calc(l - 0.03) a b)",
  "--c-surface-alt": "oklab(from #0C1F35 calc(l - 0.04) a b)",
  "--c-text": "#E2E8F0",
  "--c-text-secondary": "#9EAFC2",
  "--c-text-tertiary": "#8A9BB0",
  "--c-text-muted": "#7D92A8",
  "--c-text-faint": "#6A8099",
  "--c-border": "#172E4C",
  "--c-border-strong": "#2A4762",
  "--c-chip-bg": "oklab(from #172E4C calc(l - 0.03) a b)",
  "--c-input-bg": "oklab(from #0C1F35 calc(l - 0.04) a b)",
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