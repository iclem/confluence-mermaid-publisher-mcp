import { readFileSync } from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { buildSvgMedia, findSvgDiagrams, renderAdaptiveSvg, selectSvgDiagram, svgFileName } from "./svg.js";

const gallery = JSON.parse(readFileSync(new URL("./fixtures/svg-gallery.json", import.meta.url), "utf8")) as Array<{ title: string; source: string }>;

describe("adaptive SVG rendering", () => {
  it.each(gallery)("renders $title with both palettes and unchanged source", ({ source }) => {
    const result = renderAdaptiveSvg(source);
    const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(document.getElementsByTagName("metadata")[0]?.textContent).toBe(source);
    expect(result.svg).toContain("@media (prefers-color-scheme: dark)");
    expect(result.svg).toContain("#ffffff");
    expect(result.svg).toContain("#0d1117");
    expect(document.getElementsByTagName("script").length).toBe(0);
  });

  it("preserves explicit node colors and escapes source metadata", () => {
    const source = 'flowchart LR\nA["a & b"]:::ok\nclassDef ok fill:#d5e8d4,color:#1a4314';
    const result = renderAdaptiveSvg(source);
    const document = new DOMParser().parseFromString(result.svg, "image/svg+xml");
    expect(document.getElementsByTagName("metadata")[0]?.textContent).toBe(source);
    expect(result.svg).toContain("#d5e8d4");
    expect(result.svg).toContain("#1a4314");
  });

  it("rejects invalid Mermaid instead of producing an empty image", () => {
    expect(() => renderAdaptiveSvg("this is not a diagram")).toThrow();
  });

  it.each(["../bad", "a/b.svg", "a\\b.svg", "\u0000bad", "..", " "])("rejects unsafe filename %s", (name) => {
    expect(() => svgFileName(name)).toThrow();
  });

  it("round trips native media without treating other images as diagrams", () => {
    const attachment = { id: "att1", title: "flow.svg", fileId: "file-v2", comment: "Adaptive Mermaid SVG" };
    const node = buildSvgMedia("page1", attachment, { width: 1000, height: 400 });
    // Confluence's ADF round trip strips media alt text.
    delete ((node.content as Array<{ attrs: Record<string, unknown> }>)[0]!.attrs).alt;
    const other = { type: "mediaSingle", content: [{ type: "media", attrs: { id: "other-file", alt: "Logo" } }] };
    const diagrams = findSvgDiagrams({ type: "doc", content: [node, other] }, [attachment, { id: "other", title: "logo.svg", fileId: "other-file" }]);
    expect(diagrams).toHaveLength(1);
    expect(selectSvgDiagram(diagrams, { localId: "att1" }).diagramName).toBe("flow.svg");
    expect(node.attrs).toMatchObject({ width: 760, widthType: "pixel" });
    expect(() => buildSvgMedia("page1", { id: "att1", title: "flow.svg" }, { width: 1, height: 1 })).toThrow("fileId");
  });
});
