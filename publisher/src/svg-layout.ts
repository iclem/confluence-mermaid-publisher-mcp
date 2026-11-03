export const SVG_LAYOUTS = ["elk", "agentic"] as const;
export type SvgLayout = typeof SVG_LAYOUTS[number];

export const SVG_LAYOUT_GUIDANCE = "SVG layout only (embeddingMode svg), independent of svgStyle. Omit for elk: direct ELK layered placement and orthogonal routing for flowcharts. Select agentic for the previous Agentic Mermaid placement and routing adjustments. Other diagram families retain their native layouts. Applies to every Mermaid block in a Markdown request; updates use elk when omitted. Both options are browserless.";

export function parseSvgLayout(value?: string): SvgLayout {
  if (value === undefined) return "elk";
  if (SVG_LAYOUTS.includes(value as SvgLayout)) return value as SvgLayout;
  throw new Error(`Unsupported SVG layout: ${value}. Choose ${SVG_LAYOUTS.join(" or ")}`);
}
