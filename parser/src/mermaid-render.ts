import "./canvas-guard.js";

import { JSDOM } from "jsdom";

import { mermaid } from "./mermaid-env.js";
import { elementBBox, type SvgBBox } from "./svg-bbox.js";

// Shared headless mermaid rendering: jsdom + canvas-backed text measurement.
// mermaid.render needs DOM APIs jsdom lacks; only the measurement shims below
// are required for the diagram types we support.

interface MeasureContext {
  font: string;
  measureText(text: string): { width: number };
}

function installTextMeasurement(dom: JSDOM, measureCtx: MeasureContext): void {
  const proto = dom.window.SVGElement.prototype as unknown as Record<string, unknown>;
  const fontFor = (el: Element): string => {
    const style = (el as HTMLElement).style;
    const size = el.getAttribute("font-size") || style?.fontSize || "16px";
    const family = el.getAttribute("font-family") || style?.fontFamily ||
      '"trebuchet ms", verdana, arial, sans-serif';
    return `${size} ${family}`;
  };
  const textWidth = (el: Element): number => {
    measureCtx.font = fontFor(el);
    return measureCtx.measureText(el.textContent ?? "").width;
  };
  const textBBox = (el: Element): SvgBBox => {
    const size = parseFloat(fontFor(el)) || 16;
    // Multi-line labels are structured as tspan.row children; measuring the
    // whole text element would concatenate all rows into one bogus width.
    const rows = Array.from(el.children).filter(
      (child) => child.tagName.toLowerCase() === "tspan" && child.classList.contains("row"),
    );
    if (rows.length === 0) {
      return { x: 0, y: 0, width: textWidth(el), height: size * 1.2 };
    }
    return {
      x: 0,
      y: 0,
      width: Math.max(...rows.map((row) => textWidth(row))),
      height: size * 1.2 * rows.length,
    };
  };
  proto.getBBox = function (this: Element) {
    const tag = this.tagName.toLowerCase();
    if (tag === "text" || tag === "tspan") {
      return textBBox(this);
    }
    // Shapes and groups (including the diagram root, used for the viewBox)
    // get a geometry-derived box; text is measured with the canvas backend.
    return elementBBox(this, textBBox) ?? textBBox(this);
  };
  proto.getComputedTextLength = function (this: Element) {
    const rows = Array.from(this.children).filter(
      (child) => child.tagName.toLowerCase() === "tspan" && child.classList.contains("row"),
    );
    if (rows.length === 0) {
      return textWidth(this);
    }
    return Math.max(...rows.map((row) => textWidth(row)));
  };
}

let renderCounter = 0;

/**
 * Renders mermaid text to SVG in a headless DOM. Returns undefined when canvas
 * text measurement is unavailable on this platform. `configOverrides` are
 * injected as an `%%{init: ...}%%` directive (mermaid's render re-reads config
 * from directives, so setConfig cannot be used); a leading frontmatter block
 * is preserved first. User-supplied directives come later and win conflicts.
 */
export async function renderMermaidSvg(
  mermaidText: string,
  configOverrides?: Record<string, unknown>,
): Promise<string | undefined> {
  const { createCanvas } = await import("canvas");

  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  installTextMeasurement(dom, createCanvas(1, 1).getContext("2d") as unknown as MeasureContext);

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    DOMParser: globalThis.DOMParser,
    CSSStyleSheet: globalThis.CSSStyleSheet,
  };
  let textToRender = mermaidText;
  if (configOverrides) {
    const directive = `%%{init: ${JSON.stringify(configOverrides)}}%%\n`;
    const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(mermaidText);
    textToRender = frontmatter
      ? mermaidText.slice(0, frontmatter[0].length) + directive + mermaidText.slice(frontmatter[0].length)
      : directive + mermaidText;
  }
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser as unknown as typeof globalThis.DOMParser;
  globalThis.CSSStyleSheet = dom.window.CSSStyleSheet as unknown as typeof CSSStyleSheet;
  try {
    const { svg } = await mermaid.render(`mmd-render-${renderCounter++}`, textToRender);
    return svg;
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.DOMParser = previous.DOMParser;
    globalThis.CSSStyleSheet = previous.CSSStyleSheet;
  }
}
