import "./canvas-guard.js";
import { JSDOM } from "jsdom";

// Mermaid's sequence parser uses DOMPurify (labels) and window.CSS (box colors),
// so a minimal DOM must exist before the mermaid module is evaluated.
if (typeof globalThis.window === "undefined") {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const jsdomWindow = dom.window as unknown as Window & typeof globalThis;
  globalThis.window = jsdomWindow;
  globalThis.document = jsdomWindow.document;
}

const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

export { mermaid };
