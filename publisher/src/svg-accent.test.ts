import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { renderAdaptiveSvg } from "./svg.js";
import { parseSvgAccent } from "./svg-accent.js";

const pairs = [
  ["default", "#0969da", "#78a9f5"],
  ["blue", "#0969da", "#78a9f5"],
  ["green", "#047857", "#34d399"],
  ["yellow", "#a16207", "#facc15"],
  ["pink", "#be185d", "#f472b6"],
  ["orange", "#c2410c", "#fb923c"],
  ["purple", "#7e22ce", "#c084fc"],
  ["white", "#374151", "#e5e7eb"],
] as const;
const source = "flowchart TD\nA[Prepared data] -->|Validate| B[Published SVG]";
const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");

describe("named SVG accents", () => {
  it.each(pairs)("renders %s with both palettes and unchanged content/layout", async (accent, light, dark) => {
    for (const style of ["codex", "github"] as const) {
      for (const layout of ["elk", "agentic"] as const) {
        const baseline = await renderAdaptiveSvg(source, style, layout);
        const result = await renderAdaptiveSvg(source, style, layout, accent);
        if (accent === "default") {
          expect(result.svg).toBe(baseline.svg);
        } else {
          expect(result.svg).toContain(`--fg:${light}`);
          expect(result.svg).toContain(`--fg:${dark}`);
        }
        expect([result.width, result.height]).toEqual([baseline.width, baseline.height]);
        const doc = parse(result.svg);
        expect(doc.getElementsByTagName("metadata")[0]?.textContent).toBe(source);
        expect(Array.from(doc.getElementsByTagName("g")).filter((e) => e.getAttribute("data-role") === "node")).toHaveLength(2);
        expect(doc.getElementsByTagName("script")).toHaveLength(0);
      }
    }
  });

  it("keeps blue identical to the default Codex palette", async () => {
    expect((await renderAdaptiveSvg(source, "codex", "elk", "blue")).svg)
      .toBe((await renderAdaptiveSvg(source)).svg);
  });

  it.each(["codex", "github"] as const)("keeps authored colors above the accent (%s)", async (style) => {
    const source = '---\nconfig:\n  theme: base\n  themeVariables:\n    primaryColor: "#aabbcc"\n    lineColor: "#a12345"\n---\nflowchart LR\nA[Custom]:::custom --> B[Theme]\nclassDef custom fill:#123456,stroke:#654321,color:#fedcba';
    const result = await renderAdaptiveSvg(source, style, "elk", "purple");
    const doc = parse(result.svg);
    const node = Array.from(doc.getElementsByTagName("rect")).find((e) => e.getAttribute("data-id") === "node-shape:A")!;
    const themed = Array.from(doc.getElementsByTagName("rect")).find((e) => e.getAttribute("data-id") === "node-shape:B")!;
    expect(node.getAttribute("fill")).toBe("#123456");
    expect(node.getAttribute("stroke")).toBe("#654321");
    expect(themed.getAttribute("fill")).toBe("#aabbcc");
    expect(result.svg).toContain('fill="#fedcba"');
    const darkCss = Array.from(doc.getElementsByTagName("style")).at(-1)!.textContent!;
    for (const element of [node, themed]) {
      for (const name of (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)) {
        const rule = darkCss.split("\n").find((line) => line.startsWith(`.${name} {`));
        expect(rule ?? "").not.toContain("fill:");
      }
    }
    const edge = Array.from(doc.getElementsByTagName("path")).find((e) => e.hasAttribute("data-from"))!;
    expect(edge.getAttribute("stroke")).toBe("#a12345");
  });

  it.each(["#ff0000", "violet", "", "Purple"])("rejects unsupported accents: %s", async (value) => {
    expect(() => parseSvgAccent(value)).toThrow("Unsupported SVG accent");
    await expect(renderAdaptiveSvg(source, "codex", "elk", value as never)).rejects.toThrow("Unsupported SVG accent");
  });
});
