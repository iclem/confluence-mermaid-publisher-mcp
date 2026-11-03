import { DOMParser, type Element } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { renderAdaptiveSvg } from "./svg.js";

const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
const node = (svg: string, id: string) => Array.from(parse(svg).getElementsByTagName("g")).find((e) => e.getAttribute("data-id") === id)!;
const box = (group: Element) => {
  const rect = group.getElementsByTagName("rect")[0]!;
  const translation = /translate\(([-\d.]+),([-\d.]+)\)/.exec(group.getAttribute("transform") ?? "");
  return { x: Number(rect.getAttribute("x")) + Number(translation?.[1] ?? 0), y: Number(rect.getAttribute("y")) + Number(translation?.[2] ?? 0), width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) };
};

describe("Codex ELK layout fidelity", () => {
  it("preserves the renderer's sanitized inline formatting", async () => {
    const { svg } = await renderAdaptiveSvg('flowchart TD\nA["<b>bold</b> text"] -->|<i>italic</i> label| B[End]', "codex", "elk");
    const a = node(svg, "A");
    expect(a.getElementsByTagName("text")[0]?.textContent).toBe("bold text");
    expect(Array.from(a.getElementsByTagName("tspan")).some((e) => ["700", "bold"].includes(e.getAttribute("font-weight") ?? ""))).toBe(true);
    const label = Array.from(parse(svg).getElementsByTagName("g")).find((e) => e.getAttribute("class") === "edge-label")!;
    expect(label.getElementsByTagName("text")[0]?.textContent).toBe("italic label");
    expect(Array.from(label.getElementsByTagName("tspan")).some((e) => e.getAttribute("font-style") === "italic")).toBe(true);
  });
  it.each(["<br/>", "\\n"])("preserves explicit %s line breaks in nodes and edge labels", async (separator) => {
    const { svg } = await renderAdaptiveSvg(`flowchart TD\nA["first${separator}second"] -->|line1${separator}line2| B[End]`, "codex", "elk");
    const group = node(svg, "A");
    expect(Array.from(group.getElementsByTagName("tspan")).map((e) => e.textContent)).toEqual(["first", "second"]);
    const label = Array.from(parse(svg).getElementsByTagName("g")).find((e) => e.getAttribute("class") === "edge-label")!;
    expect(Array.from(label.getElementsByTagName("tspan")).map((e) => e.textContent)).toEqual(["line1", "line2"]);
  });
  it("measures narrow and wide letters with the actual monospace advance", async () => {
    const { svg } = await renderAdaptiveSvg("flowchart TD\nA[MMMM]-->B[iiii]", "codex", "elk");
    for (const id of ["A", "B"]) {
      const text = node(svg, id).getElementsByTagName("text")[0]!;
      expect(Number(text.getAttribute("textLength"))).toBeCloseTo(30.24, 2);
      expect(box(node(svg, id)).height).toBeGreaterThanOrEqual(60);
    }
  });

  it("wraps labels at 200 pixels and sizes the actual node to the wrapped text", async () => {
    const { svg } = await renderAdaptiveSvg("flowchart TD\nA[Review ingestion pipeline inputs]", "codex", "elk");
    const group = node(svg, "A");
    const lines = Array.from(group.getElementsByTagName("tspan"));
    expect(lines.map((e) => e.textContent)).toEqual(["Review ingestion pipeline", "inputs"]);
    expect(box(group).width).toBeCloseTo(261, 1);
    expect(box(group).height).toBeCloseTo(62.4, 1);
  });

  it("uses the reference's eight-pixel canvas margin without cropping nodes", async () => {
    const result = await renderAdaptiveSvg("flowchart TD\nA[Review]", "codex", "elk");
    const a = box(node(result.svg, "A"));
    expect(a.x).toBeCloseTo(8);
    expect(a.y).toBeCloseTo(8);
    expect(result.width).toBeCloseTo(a.width + 16);
    expect(result.height).toBeCloseTo(a.height + 16);
  });

  it("applies the requested 40-pixel base spacing", async () => {
    const { svg } = await renderAdaptiveSvg("flowchart TD\nA[One]-->B[Two]", "github", "elk");
    const a = box(node(svg, "A")), b = box(node(svg, "B"));
    expect(b.y - a.y - a.height).toBeGreaterThanOrEqual(40);
  });

  it("preserves model order for equivalent branches", async () => {
    const source = `flowchart TD
A[Stage A]-->B[Stage B]
B-->C[Stage C]
C-->D[Stage D]
D-->E[Stage E]
B-->F[Stage F]
D-->F
E-->G[Stage G]
G-->H[Stage H]
G-->I[Stage I]
D-->J[Stage J]
J-->K[Stage K]
K-->I
I-->L[Stage L]
H-->M[Stage M]`;
    const { svg } = await renderAdaptiveSvg(source, "codex", "elk");
    const order = ["E", "J", "F"].sort((a, b) => box(node(svg, a)).x - box(node(svg, b)).x);
    expect(order).toEqual(["E", "J", "F"]);
  });
});
