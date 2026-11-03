import type { Document, Element } from "@xmldom/xmldom";
import { parseRegisteredMermaid } from "agentic-mermaid/agent";

const SVG_NS = "http://www.w3.org/2000/svg";
// ShareTechMono.ttf shipped by Agentic Mermaid: hmtx advance 540, head unitsPerEm 1000.
// Keep painted SVG advances identical even when a viewer uses the fallback font.
function textWidth(text: string, size: number): number {
  let cells = 0;
  for (const char of text) {
    if (/\p{Mark}|[\u200d\ufe0e\ufe0f]/u.test(char)) continue;
    cells += /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Extended_Pictographic}/u.test(char) ? 2 : 1;
  }
  return cells * size * 0.54;
}

function wrap(text: string, size: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/<br\s*\/?>/gi, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && textWidth(candidate, size) <= 200) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      // Long tokens have no word boundary; split by code point rather than UTF-16 unit.
      for (const char of word) {
        if (textWidth(line + char, size) > 200 && line) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.length ? lines : [""];
}

function replaceText(document: Document, group: Element, lines: string[], cx: number, cy: number, size: number): void {
  const originals = Array.from(group.getElementsByTagName("text"));
  if (!originals.length) return;
  const text = originals[0]!.cloneNode(false) as Element;
  for (const original of originals) original.parentNode!.removeChild(original);
  for (const attr of ["textLength", "dy", "dominant-baseline"]) text.removeAttribute(attr);
  text.setAttribute("font-size", String(size)); text.setAttribute("font-weight", "600");
  text.setAttribute("text-anchor", "middle"); text.setAttribute("x", String(cx));
  text.setAttribute("data-font-metrics", "share-tech-mono-540");
  const firstY = cy - (lines.length - 1) * size * 1.1 / 2 + size * 0.3215;
  text.setAttribute("y", String(firstY));
  if (lines.length === 1) {
    text.appendChild(document.createTextNode(lines[0]!));
    if (lines[0]) { text.setAttribute("textLength", String(textWidth(lines[0], size))); text.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
  } else {
    for (const [index, line] of lines.entries()) {
      const span = document.createElementNS(SVG_NS, "tspan");
      span.setAttribute("x", String(cx)); span.setAttribute("y", String(firstY + index * size * 1.1));
      if (line) { span.setAttribute("textLength", String(textWidth(line, size))); span.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
      span.appendChild(document.createTextNode(line)); text.appendChild(span);
    }
  }
  group.appendChild(text);
}

/** Normalize actual SVG geometry before merging adaptive paints and sending sizes to ELK. */
export function prepareCodexFlowchart(document: Document, source: string): void {
  const parsed = parseRegisteredMermaid(source);
  if (!parsed.ok || parsed.value.body.kind !== "flowchart") return;
  const graph = parsed.value.body.graph;
  const remainingEdges = graph.edges.filter((edge) => edge.style !== "invisible");
  const labelKey = (value: string) => value.replace(/\s+/g, " ").trim();
  const groups = Array.from(document.getElementsByTagName("g"));
  for (const group of groups) {
    const className = group.getAttribute("class");
    if (className !== "node" && className !== "edge-label") continue;
    const renderedLabel = group.getAttribute("data-label") ?? "";
    let label = graph.nodes.get(group.getAttribute("data-id") ?? "")?.label ?? renderedLabel;
    if (className === "edge-label") {
      const index = remainingEdges.findIndex((edge) => edge.source === group.getAttribute("data-from") && edge.target === group.getAttribute("data-to") && labelKey(edge.label ?? "") === labelKey(renderedLabel));
      label = index < 0 ? renderedLabel : remainingEdges.splice(index, 1)[0]!.label ?? renderedLabel;
    }
    // Rich labels already contain sanitized SVG spans. Keep that content and geometry;
    // re-creating them as plain text would expose markup and erase inline formatting.
    if (/<\/?[a-z][^>]*>/i.test(renderedLabel)) continue;
    const rects = Array.from(group.getElementsByTagName("rect"));
    const shape = rects.find((e) => e.getAttribute("data-id") === `node-shape:${group.getAttribute("data-id")}`);
    // Preserve compound/path-based shapes and their renderer-specific geometry.
    if (className === "node" && (!shape || !["rectangle", "rounded", "stadium"].includes(group.getAttribute("data-shape") ?? ""))) continue;
    const anchor = shape ?? rects[0];
    if (!anchor) continue;
    const cx = Number(anchor.getAttribute("x")) + Number(anchor.getAttribute("width")) / 2;
    const cy = Number(anchor.getAttribute("y")) + Number(anchor.getAttribute("height")) / 2;
    const isNode = className === "node", size = isNode ? 14 : 13;
    const lines = wrap(label, size);
    const textHeight = size + 1 + (lines.length - 1) * size * 1.1;
    const width = Math.max(...lines.map((line) => textWidth(line, size))) + (isNode ? 72 : 24);
    const height = Math.max(isNode ? 60 : 26, textHeight + (isNode ? 32 : 9));
    for (const rect of isNode ? [shape!] : rects) {
      rect.setAttribute("x", String(cx - width / 2)); rect.setAttribute("y", String(cy - height / 2));
      rect.setAttribute("width", String(width)); rect.setAttribute("height", String(height));
    }
    replaceText(document, group, lines, cx, cy, size);
  }
}
