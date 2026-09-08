import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const src = `flowchart TD
  subgraph outer [Outer]
    subgraph inner [Inner]
      A[X]
    end
    B[Y]
  end
  A --> B
  style A fill:#f9f,stroke:#333,color:#111
  click A "https://example.com"
  linkStyle 0 stroke:#ff0
  A@{ shape: circ }
`;
try {
  await mermaid.parse(src);
  const db = (await mermaid.mermaidAPI.getDiagramFromText(src)).db;
  console.log('subgraphs:', JSON.stringify(db.getSubGraphs(), null, 1));
  for (const [k,x] of db.getVertices()) console.log('V', k, x.type, JSON.stringify(x.text), 'styles:', JSON.stringify(x.styles), 'classes:', x.classes, 'link:', x.link);
} catch (e) { console.log('FAIL', String(e.message||e).split('\n')[0]); }
