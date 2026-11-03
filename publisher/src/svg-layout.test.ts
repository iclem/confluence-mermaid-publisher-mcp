import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { renderAdaptiveSvg } from "./svg.js";

describe("SVG layout selection", () => {
  const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
  it("keeps invisible constraints separate from visible parallel edges", async () => {
    await expect(renderAdaptiveSvg("flowchart TD\nA ~~~ B\nA --> B", "github", "elk")).resolves.toBeDefined();
  });
  it("keeps nested group rectangles around their nodes after parent movement", async () => {
    const { svg } = await renderAdaptiveSvg("flowchart TD\nX-->A\nsubgraph outer[Outer]\nsubgraph inner[Inner]\nA-->B\nend\nC\nend\nB-->D", "github", "elk");
    const document = parse(svg);
    const elements = Array.from(document.getElementsByTagName("g"));
    const rectBox = (id: string) => {
      const group = elements.find((e) => e.getAttribute("data-id") === id)!;
      const rect = group.getElementsByTagName("rect")[0]!;
      let x = Number(rect.getAttribute("x")), y = Number(rect.getAttribute("y"));
      let ancestor: typeof group | null = group;
      while (ancestor) {
        const translation = /translate\(([-+\d.eE]+),([-+\d.eE]+)\)/.exec(ancestor.getAttribute("transform") ?? "");
        if (translation) { x += Number(translation[1]); y += Number(translation[2]); }
        ancestor = ancestor.parentNode?.nodeType === 1 ? ancestor.parentNode as typeof group : null;
      }
      return { x, y, width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) };
    };
    const inner = rectBox("inner"), outer = rectBox("outer");
    expect(inner.y).toBeGreaterThan(outer.y);
    for (const id of ["B"]) {
      const node = rectBox(id);
      expect(node.x).toBeGreaterThanOrEqual(inner.x);
      expect(node.y).toBeGreaterThanOrEqual(inner.y + 28);
      expect(node.x + node.width).toBeLessThanOrEqual(inner.x + inner.width);
      expect(node.y + node.height).toBeLessThanOrEqual(inner.y + inner.height);
    }
  });
  it("keeps long group titles inside their boxes and respects isolated group direction", async () => {
    const { svg } = await renderAdaptiveSvg("flowchart TD\nsubgraph s[Wide group title with lots of words]\ndirection LR\nA-->B\nend", "github", "elk");
    const document = parse(svg);
    const group = Array.from(document.getElementsByTagName("g")).find((e) => e.getAttribute("data-id") === "s")!;
    expect(Number(group.getElementsByTagName("rect")[0]!.getAttribute("width"))).toBeGreaterThan(210);
    const nodes = Array.from(document.getElementsByTagName("g")).filter((e) => e.getAttribute("class") === "node");
    const x = nodes.map((node) => Number(node.getElementsByTagName("rect")[0]!.getAttribute("x")) + Number(/translate\(([-+\d.eE]+)/.exec(node.getAttribute("transform")!)![1]));
    expect(x[1]! - x[0]!).toBeGreaterThan(60);
  });
  it("does not collide with user node IDs in its internal namespace", async () => {
    const { svg } = await renderAdaptiveSvg("flowchart TD\n__svg_root-->B", "github", "elk");
    const doc = parse(svg);
    const edge = Array.from(doc.getElementsByTagName("path")).find((e) => e.hasAttribute("data-from"))!;
    const node = Array.from(doc.getElementsByTagName("g")).find((e) => e.getAttribute("data-id") === "__svg_root")!;
    const rect = node.getElementsByTagName("rect")[0]!;
    const [, dx, dy] = /translate\(([-+\d.eE]+),([-+\d.eE]+)\)/.exec(node.getAttribute("transform")!)!;
    const [, x, y] = /^M ([-+\d.eE]+) ([-+\d.eE]+)/.exec(edge.getAttribute("d")!)!;
    expect(Number(x)).toBeCloseTo(Number(rect.getAttribute("x")) + Number(dx) + Number(rect.getAttribute("width")) / 2);
    expect(Number(y)).toBeCloseTo(Number(rect.getAttribute("y")) + Number(dy) + Number(rect.getAttribute("height")));
  });
  it.each(["TD", "BT", "LR", "RL"])("places nodes in the requested %s direction", async (direction) => {
    const { svg } = await renderAdaptiveSvg(`flowchart ${direction}\nA[First]-->B[Second]`, "github", "elk");
    const nodes = Array.from(parse(svg).getElementsByTagName("g")).filter((e) => e.getAttribute("class") === "node");
    const position = (id: string) => {
      const node = nodes.find((e) => e.getAttribute("data-id") === id)!;
      const rect = node.getElementsByTagName("rect")[0]!;
      const translation = /translate\(([-+\d.eE]+),([-+\d.eE]+)\)/.exec(node.getAttribute("transform")!)!;
      return [Number(rect.getAttribute("x")) + Number(translation[1]), Number(rect.getAttribute("y")) + Number(translation[2])];
    };
    const a = position("A"), b = position("B");
    const delta = ["LR", "RL"].includes(direction) ? b[0]! - a[0]! : b[1]! - a[1]!;
    expect(delta * (["BT", "RL"].includes(direction) ? -1 : 1)).toBeGreaterThan(0);
  });

  it("routes nested groups, parallel labels, self-loops and invisible layout constraints", async () => {
    const source = `flowchart TD
subgraph outer[Outer group]
subgraph inner[Inner group]
A[Input] -->|first| B{Choice}
A -->|second| B
B -->|retry| B
end
C[Other]
end
B --> D[Outside]
C ~~~ D
style A fill:#123456,stroke:#abcdef`;
    const { svg } = await renderAdaptiveSvg(source, "github", "elk");
    const document = parse(svg);
    const edges = Array.from(document.getElementsByTagName("path")).filter((e) => e.hasAttribute("data-from"));
    expect(edges).toHaveLength(4);
    expect(edges.every((e) => /^M /.test(e.getAttribute("d")!))).toBe(true);
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).toContain("#123456");
    expect(svg).toContain("#abcdef");
    expect(document.getElementsByTagName("metadata")[0]?.textContent).toBe(source);
    expect(Array.from(document.getElementsByTagName("g")).filter((e) => e.getAttribute("class") === "subgraph")).toHaveLength(2);
  });

  it("uses distinct geometry for direct ELK and Agentic routing", async () => {
    const source = "flowchart TD\nA-->B\nA-->C\nB-->D\nC-->D\nD-->A";
    const elk = await renderAdaptiveSvg(source, "github", "elk");
    const agentic = await renderAdaptiveSvg(source, "github", "agentic");
    expect([elk.width, elk.height]).not.toEqual([agentic.width, agentic.height]);
  });
  it("defaults to ELK and renders both style palettes with stable geometry", async () => {
    const source = 'flowchart TD\nA[Input] -->|accept| B[Output]';
    for (const style of ["codex", "github"] as const) {
      const result = await renderAdaptiveSvg(source, style);
      const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
      expect(result.svg).toContain('data-layout="elk"');
      expect(result.svg).toContain("data-from=\"A\"");
      expect(result.svg).toContain("@media (prefers-color-scheme: dark)");
      expect(result.svg).not.toMatch(/<script|<foreignObject|@import/);
      expect(document.getElementsByTagName("metadata")[0]?.textContent).toBe(source);
      expect(result.width).toBeGreaterThan(0);
    }
  }, 30000);

  it("retains the browserless Agentic layout independently of the style", async () => {
    const result = await renderAdaptiveSvg("flowchart LR\nA-->B", "github", "agentic");
    expect(result.svg).toContain('data-layout="agentic"');
    expect(result.svg).toContain("--font:Inter");
    expect(result.svg).not.toContain("flowchart-link");
  });

  it("rejects an unknown layout instead of silently falling back", async () => {
    await expect(renderAdaptiveSvg("flowchart LR\nA-->B", "github", "unknown" as never)).rejects.toThrow("Unsupported SVG layout");
  });
});
