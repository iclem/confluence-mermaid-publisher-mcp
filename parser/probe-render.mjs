import { renderMermaidSvg } from './dist/mermaid-render.js';
const src = 'flowchart LR\n  subgraph sg1 [Group A]\n    A[Start] & B(Proc) --> C{Dec}\n  end\n  C -->|yes| D[(DB)]\n  C -.->|no| E>Flag]';
const svg = await renderMermaidSvg(src);
console.log(svg ? svg.slice(0, 200) : 'UNDEFINED');
import { writeFileSync } from 'node:fs';
if (svg) writeFileSync('/tmp/flow.svg', svg);
