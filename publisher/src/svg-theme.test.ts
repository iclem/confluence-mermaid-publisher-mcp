import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { renderMermaidSVG } from "agentic-mermaid/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAdaptiveSvg } from "./svg.js";
import { svgRenderOptions } from "./svg-style.js";

vi.mock("agentic-mermaid/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("agentic-mermaid/agent")>();
  return { ...actual, renderMermaidSVG: vi.fn(actual.renderMermaidSVG) };
});

const actual = await vi.importActual<typeof import("agentic-mermaid/agent")>("agentic-mermaid/agent");
const renderer = vi.mocked(renderMermaidSVG);
const parse = (svg: string) => new DOMParser().parseFromString(svg, "image/svg+xml");
const source = "flowchart TD\nA[First] -->|Next| B[Second]";

afterEach(() => renderer.mockReset().mockImplementation(actual.renderMermaidSVG));

describe("adaptive SVG theme compatibility", () => {
  it.each(["codex", "github"] as const)("keeps both renderer CSS scopes and dark paint (%s)", async (style) => {
    const originals = [false, true].map((dark) => parse(actual.renderMermaidSVG(source, svgRenderOptions(style, dark))));
    const scopes = originals.map((doc) => doc.documentElement!.getAttribute("class"));
    expect(scopes[0]).not.toBe(scopes[1]);
    const result = parse((await renderAdaptiveSvg(source, style)).svg);
    expect(result.documentElement!.getAttribute("class")?.split(/\s+/)).toEqual(expect.arrayContaining(scopes));
    const styles = Array.from(result.getElementsByTagName("style")).map((node) => node.textContent).join("\n");
    for (const original of originals) {
      for (const css of Array.from(original.getElementsByTagName("style"))) {
        expect(styles).toContain(css.textContent);
      }
    }
    expect(styles).toContain("@media (prefers-color-scheme: dark)");
    expect(styles).toContain("#0d1117");
    expect(result.getElementsByTagName("metadata")[0]?.textContent).toBe(source);
  });

  it.each(["class", "width"] as const)("still rejects unexpected root %s differences", async (attribute) => {
    renderer.mockImplementationOnce(actual.renderMermaidSVG).mockImplementationOnce((...args) => {
      const document = parse(actual.renderMermaidSVG(...args));
      const root = document.documentElement!;
      root.setAttribute(attribute, attribute === "class" ? `${root.getAttribute("class")} unexpected-theme-class` : "99999");
      return new XMLSerializer().serializeToString(document);
    });
    await expect(renderAdaptiveSvg(source, "github", "agentic")).rejects.toThrow("Adaptive SVG themes produced different geometry or content");
  });

  it("still rejects changed node content between palettes", async () => {
    renderer.mockImplementationOnce(actual.renderMermaidSVG).mockImplementationOnce((...args) => {
      const document = parse(actual.renderMermaidSVG(...args));
      document.getElementsByTagName("text")[0]!.textContent = "Unexpected label";
      return new XMLSerializer().serializeToString(document);
    });
    await expect(renderAdaptiveSvg(source, "github", "agentic")).rejects.toThrow("Adaptive SVG themes produced different geometry or content");
  });
});
