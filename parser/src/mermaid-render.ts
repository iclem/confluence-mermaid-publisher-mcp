import "./canvas-guard.js";

import { JSDOM } from "jsdom";

import { mermaid } from "./mermaid-env.js";

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
  proto.getBBox = function (this: Element) {
    const size = parseFloat(fontFor(this)) || 16;
    return { x: 0, y: 0, width: textWidth(this), height: size * 1.2 };
  };
  proto.getComputedTextLength = function (this: Element) {
    return textWidth(this);
  };
}

let renderCounter = 0;

/**
 * Renders mermaid text to SVG in a headless DOM. Returns undefined when canvas
 * text measurement is unavailable on this platform.
 */
export async function renderMermaidSvg(mermaidText: string): Promise<string | undefined> {
  const { createCanvas } = await import("canvas");

  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  installTextMeasurement(dom, createCanvas(1, 1).getContext("2d") as unknown as MeasureContext);

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    DOMParser: globalThis.DOMParser,
    CSSStyleSheet: globalThis.CSSStyleSheet,
  };
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser as unknown as typeof globalThis.DOMParser;
  globalThis.CSSStyleSheet = dom.window.CSSStyleSheet as unknown as typeof CSSStyleSheet;
  try {
    const { svg } = await mermaid.render(`mmd-render-${renderCounter++}`, mermaidText);
    return svg;
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.DOMParser = previous.DOMParser;
    globalThis.CSSStyleSheet = previous.CSSStyleSheet;
  }
}
