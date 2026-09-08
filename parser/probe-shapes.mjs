import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
const mermaid = (await import('mermaid')).default;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
const shapes = [
  ['a','A[x]'], ['b','B(x)'], ['c','C([x])'], ['d','D[[x]]'], ['e','E[(x)]'],
  ['f','F((x))'], ['g','G(((x)))'], ['h','H{x}'], ['i','I{{x}}'], ['j','J>x]'],
  ['k','K[/x/]'], ['l','L[\\x\\]'], ['m','M[/x\\]'], ['n','N[\\x/]'],
  ['o','O@{ shape: circ }'], ['p','P@{ shape: rect }'], ['q','Q@{ shape: lean-r }'],
  ['r','R@{ shape: diam }'], ['s','S@{ shape: bowl }'], ['t','T@{ shape: fr-rect }'],
];
for (const [id, decl] of shapes) {
  try {
    const src = `flowchart TD\n  ${decl}`;
    await mermaid.parse(src);
    const db = (await mermaid.mermaidAPI.getDiagramFromText(src)).db;
    const v = db.getVertices().values().next().value;
    console.log(decl.padEnd(22), '->', v?.type, '| text:', JSON.stringify(v?.text));
  } catch (e) { console.log(decl.padEnd(22), '-> FAIL', String(e.message||e).split('\n')[0].slice(0,60)); }
}
