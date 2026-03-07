/**
 * Shared condition grade color spectrum.
 * Maps vinyl grading scale to a pink-to-green spectrum:
 *   P/F = pink (poor/fair), G/G+ = pink-blue, VG = blue, VG+ = blue-green, NM/M = green
 */

export const CONDITION_SPECTRUM: Record<string, { dark: string; light: string }> = {
  "M":    { dark: "#3E9842", light: "#2D7A31" },
  "MINT": { dark: "#3E9842", light: "#2D7A31" },
  "NM":   { dark: "#3E9842", light: "#2D7A31" },
  "NEARMINT": { dark: "#3E9842", light: "#2D7A31" },
  "VG+":  { dark: "#5FBFA0", light: "#1A7A5A" },
  "VG":   { dark: "#ACDEF2", light: "#00527A" },
  "VERYGOOD+": { dark: "#5FBFA0", light: "#1A7A5A" },
  "VERYGOOD":  { dark: "#ACDEF2", light: "#00527A" },
  "G+":   { dark: "#C9A0E0", light: "#7A3A9A" },
  "GOOD+": { dark: "#C9A0E0", light: "#7A3A9A" },
  "G":    { dark: "#E88CC4", light: "#9A207C" },
  "GOOD": { dark: "#E88CC4", light: "#9A207C" },
  "F":    { dark: "#FF98DA", light: "#9A207C" },
  "FAIR": { dark: "#FF98DA", light: "#9A207C" },
  "P":    { dark: "#FF98DA", light: "#9A207C" },
  "POOR": { dark: "#FF98DA", light: "#9A207C" },
};

/** Parse a condition grade string and return the themed color. */
export function conditionGradeColor(grade: string, isDarkMode: boolean): string | undefined {
  const rawParen = grade.match(/\(([^)]+)\)/);
  let key: string;
  if (rawParen) {
    key = rawParen[1].trim().split(/\s/)[0].toUpperCase();
  } else {
    key = grade.trim().toUpperCase().replace(/[\s-]/g, "");
  }
  const entry = CONDITION_SPECTRUM[key];
  if (!entry) return undefined;
  return isDarkMode ? entry.dark : entry.light;
}
