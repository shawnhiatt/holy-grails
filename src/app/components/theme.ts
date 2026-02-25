/** Content-area theme tokens. Header & nav are unaffected by dark mode. */

export const lightTokens: Record<string, string> = {
  "--c-bg": "#F9F9FA",
  "--c-surface": "#FFFFFF",
  "--c-surface-hover": "#EFF1F3",
  "--c-surface-alt": "#F9F9FA",
  "--c-text": "#0C284A",
  "--c-text-secondary": "#455B75",
  "--c-text-tertiary": "#617489",
  "--c-text-muted": "#6B7B8E",
  "--c-text-faint": "#8494A5",
  "--c-border": "#D2D8DE",
  "--c-border-strong": "#74889C",
  "--c-chip-bg": "#EFF1F3",
  "--c-input-bg": "#F9F9FA",
  "--c-card-shadow": "0 4px 20px rgba(12,40,74,0.08)",
};

export const darkTokens: Record<string, string> = {
  "--c-bg": "#0C1A2E",
  "--c-surface": "#132B44",
  "--c-surface-hover": "#1A3350",
  "--c-surface-alt": "#0F2238",
  "--c-text": "#E2E8F0",
  "--c-text-secondary": "#9EAFC2",
  "--c-text-tertiary": "#8A9BB0",
  "--c-text-muted": "#7D92A8",
  "--c-text-faint": "#6A8099",
  "--c-border": "#1A3350",
  "--c-border-strong": "#2D4A66",
  "--c-chip-bg": "#1A3350",
  "--c-input-bg": "#0F2238",
  "--c-card-shadow": "0 4px 20px rgba(0,0,0,0.25)",
};

export function getContentTokens(isDark: boolean) {
  return isDark ? darkTokens : lightTokens;
}