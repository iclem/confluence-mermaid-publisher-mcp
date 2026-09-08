import { mermaid } from './dist/mermaid-env.js';
import { renderMermaidSvg } from './dist/mermaid-render.js';
const src = "%%{init: {'flowchart': {'htmlLabels': false}} }%%\nflowchart LR\n  subgraph sg1 [Group A]\n    A[Start] & B(Proc) --> C{Dec}\n  end\n  C -->|yes| D[(DB)]\n  C -.->|no| E>Flag]";
const svg = await renderMermaidSvg(src);
import { writeFileSync } from 'node:fs';
if (svg) writeFileSync('/tmp/flow2.svg', svg);
console.log(svg ? svg.slice(0, 220) : 'UNDEFINED');
