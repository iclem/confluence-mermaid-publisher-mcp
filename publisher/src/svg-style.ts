import type { RenderOptions, StyleSpec } from "agentic-mermaid";
import { svgAccentColors, type SvgAccent } from "./svg-accent.js";

export const SVG_STYLES = ["codex", "github"] as const;
export type SvgStyle = typeof SVG_STYLES[number];

export const SVG_STYLE_GUIDANCE = "SVG appearance only (embeddingMode svg). Omit for codex: rounded nodes, blue accents, monospace text, and outlined edge labels. Select github for the original Inter typography and GitHub palettes. Both styles adapt automatically to light/dark mode and preserve explicit Mermaid colors. Applies to every Mermaid block in a Markdown request; updates use codex when omitted.";

/** Resolve the named SVG look before rendering or publishing. */
export function parseSvgStyle(value?: string): SvgStyle {
  if (value === undefined) return "codex";
  if (SVG_STYLES.includes(value as SvgStyle)) return value as SvgStyle;
  throw new Error(`Unsupported SVG style: ${value}. Choose ${SVG_STYLES.join(" or ")}`);
}

/** Keep geometry identical across palettes while selecting their paints. */
export function svgRenderOptions(style: SvgStyle, dark: boolean, accent: SvgAccent = "default"): RenderOptions {
  const accentColors = svgAccentColors(accent, dark);
  if (style === "github") {
    const palette = dark ? "github-dark" : "github-light";
    return { security: "strict", style: accentColors ? [palette, { colors: accentColors }] : palette };
  }
  const colors = dark
    ? { bg: "#0d1117", fg: "#78a9f5", muted: "#78a9f5", surface: "#071b38", border: "#273446", line: "#7b8188", accent: "#7b8188" }
    : { bg: "#ffffff", fg: "#0969da", muted: "#0969da", surface: "#eff6ff", border: "#c8d8eb", line: "#66717e", accent: "#66717e" };
  const look: StyleSpec = {
    colors: { ...colors, ...accentColors },
    font: "'Share Tech Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    roles: {
      node: { cornerRadius: 16, fontSize: 14, fontWeight: 500, paddingX: 24, paddingY: 18 },
      actor: { cornerRadius: 16, fontSize: 14, fontWeight: 500, paddingX: 24, paddingY: 18 },
      edge: { fontSize: 13, fontWeight: 500, bendRadius: 8 },
      label: { fontSize: 13, fontWeight: 500 },
      group: { cornerRadius: 16 },
    },
  };
  return { security: "strict", style: look, padding: 16, nodeSpacing: 48, layerSpacing: 56, wrappingWidth: 240 };
}
