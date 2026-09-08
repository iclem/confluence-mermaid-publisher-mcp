import { readFileSync, writeFileSync } from "node:fs";

import { Resvg } from "@resvg/resvg-js";

import { renderMermaidSvg } from "./mermaid-render.js";

async function main(): Promise<void> {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    throw new Error("Usage: preview-cli.js <input.mermaid> <output.png>");
  }

  const svg = await renderMermaidSvg(readFileSync(inputPath, "utf8"));
  if (!svg) {
    throw new Error("render_unavailable: mermaid SVG rendering is unavailable on this platform");
  }

  const png = new Resvg(svg, {
    fitTo: { mode: "zoom", value: 2 },
    background: "white",
  }).render().asPng();
  writeFileSync(outputPath, png);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
