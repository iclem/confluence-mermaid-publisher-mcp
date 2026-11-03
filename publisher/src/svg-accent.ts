export const SVG_ACCENTS = ["default", "blue", "green", "yellow", "pink", "orange", "purple", "white"] as const;
export type SvgAccent = typeof SVG_ACCENTS[number];

export const SVG_ACCENT_GUIDANCE = "SVG accent palette only (embeddingMode svg), independent of style and layout. Omit or select default to retain the selected style's original palette (blue for codex). Named colors adapt to light/dark mode; white means neutral dark ink in light mode and near-white ink in dark mode. Explicit Mermaid colors and supported themeVariables take precedence. Applies to every Mermaid block in a Markdown request; updates use default when omitted.";

const PALETTES = {
  blue: { light: ["#0969da", "#eff6ff", "#c8d8eb"], dark: ["#78a9f5", "#071b38", "#273446"] },
  green: { light: ["#047857", "#ecfdf5", "#a7d8c4"], dark: ["#34d399", "#052e25", "#245444"] },
  yellow: { light: ["#a16207", "#fefce8", "#e6cf92"], dark: ["#facc15", "#302509", "#62521a"] },
  pink: { light: ["#be185d", "#fdf2f8", "#e8b6ce"], dark: ["#f472b6", "#320e24", "#653047"] },
  orange: { light: ["#c2410c", "#fff7ed", "#edc3a5"], dark: ["#fb923c", "#331b0b", "#674126"] },
  purple: { light: ["#7e22ce", "#faf5ff", "#d9bdec"], dark: ["#c084fc", "#241036", "#503368"] },
  white: { light: ["#374151", "#f3f4f6", "#cbd5e1"], dark: ["#e5e7eb", "#1f2937", "#4b5563"] },
} as const;

/** Resolve a named accent, retaining the style palette when omitted. */
export function parseSvgAccent(value?: string): SvgAccent {
  if (value === undefined) return "default";
  if (SVG_ACCENTS.includes(value as SvgAccent)) return value as SvgAccent;
  throw new Error(`Unsupported SVG accent: ${value}. Choose ${SVG_ACCENTS.join(", ")}`);
}

/** Override style defaults while leaving authored Mermaid colors higher priority. */
export function svgAccentColors(accent: SvgAccent, dark: boolean) {
  if (accent === "default") return undefined;
  const [fg, surface, border] = PALETTES[accent][dark ? "dark" : "light"];
  return { fg, muted: fg, surface, border };
}
