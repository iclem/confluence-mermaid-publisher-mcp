import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
for (const style of ['fill:rgb(230,240,255),stroke:rgba(25,113,194,0.8),color:rgb(10,20,30)', 'fill:#ffdddd,stroke:#ff0000,color:#330000']) {
  try {
    const src = `flowchart TD\n  classDef themed ${style}\n  A[Start]:::themed --> B[Finish]`;
    await mermaid.parse(src);
    const db = (await mermaid.mermaidAPI.getDiagramFromText(src)).db;
    console.log('OK', JSON.stringify([...db.getClasses().entries()]));
  } catch (e) { console.log('FAIL', String(e.message||e).split('\n')[1]); }
}
