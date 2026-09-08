import { readFileSync } from "node:fs";
import { stdin as input } from "node:process";

import { parseMermaid, serializeIntermediateDiagram } from "./index.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const sourceName = process.argv[2];
  const mermaid = process.argv[3]
    ? readFileSync(process.argv[3], "utf8")
    : await readStdin();

  const diagram = await parseMermaid({ mermaid, sourceName });
  process.stdout.write(`${serializeIntermediateDiagram(diagram)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

