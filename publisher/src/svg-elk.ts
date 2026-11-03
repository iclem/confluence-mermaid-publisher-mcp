import type { Document, Element } from "@xmldom/xmldom";
import { layoutMermaidWithReceipt, parseRegisteredMermaid } from "agentic-mermaid/agent";
import type { RenderOptions } from "agentic-mermaid";
import { createRequire } from "node:module";
import type { ELK, ElkNode, ElkExtendedEdge, ElkPoint } from "elkjs/lib/elk.bundled.js";

const Elk = createRequire(import.meta.url)("elkjs/lib/elk.bundled.js") as { new(): ELK };

const SVG_NS = "http://www.w3.org/2000/svg";
interface Box { x: number; y: number; width: number; height: number }
interface SvgNode extends Box { element: Element; shape: string }

const number = (element: Element, name: string) => Number(element.getAttribute(name));
const classes = (element: Element) => (element.getAttribute("class") ?? "").split(/\s+/);
const all = (document: Document) => Array.from(document.getElementsByTagName("*"));

function bounds(element: Element): Box | undefined {
  if (element.tagName === "rect") return { x: number(element, "x"), y: number(element, "y"), width: number(element, "width"), height: number(element, "height") };
  if (element.tagName === "circle" || element.tagName === "ellipse") {
    const rx = number(element, element.tagName === "circle" ? "r" : "rx");
    const ry = number(element, element.tagName === "circle" ? "r" : "ry");
    return { x: number(element, "cx") - rx, y: number(element, "cy") - ry, width: rx * 2, height: ry * 2 };
  }
  if (element.tagName === "polygon") {
    const coords = (element.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
    const xs = coords.filter((_, i) => i % 2 === 0), ys = coords.filter((_, i) => i % 2 !== 0);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return undefined;
}

function move(element: Element, dx: number, dy: number): void {
  element.setAttribute("transform", `translate(${dx},${dy}) ${element.getAttribute("transform") ?? ""}`.trim());
}

function route(points: ElkPoint[], radius: number): string {
  let result = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!, before = points[i - 1]!, after = points[i + 1];
    if (!after || radius === 0) { result += ` L ${p.x} ${p.y}`; continue; }
    const a = Math.hypot(before.x - p.x, before.y - p.y), b = Math.hypot(after.x - p.x, after.y - p.y);
    if (!a || !b) continue;
    const r = Math.min(radius, a / 2, b / 2);
    result += ` L ${p.x + (before.x - p.x) * r / a} ${p.y + (before.y - p.y) * r / a} Q ${p.x} ${p.y} ${p.x + (after.x - p.x) * r / b} ${p.y + (after.y - p.y) * r / b}`;
  }
  return result;
}

/** Clip ELK's rectangular ports to the node's actual outline. */
function clip(point: ElkPoint, node: SvgNode, placed: Box): ElkPoint {
  const cx = placed.x + placed.width / 2, cy = placed.y + placed.height / 2;
  const dx = point.x - cx, dy = point.y - cy;
  if (!dx && !dy) return point;
  let scale = 1;
  if (["diamond", "state-choice"].includes(node.shape)) {
    scale = 1 / (Math.abs(dx) / (placed.width / 2) + Math.abs(dy) / (placed.height / 2));
  } else if (["circle", "doublecircle"].includes(node.shape)) {
    scale = 1 / Math.hypot(dx / (placed.width / 2), dy / (placed.height / 2));
  }
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Reuse Agentic Mermaid's measured SVG shapes/labels and run plain ELK over them.
 * No browser, source rewriting, global renderer registration, or dependency patching.
 */
export async function applyElkLayout(document: Document, source: string, options: RenderOptions, bendRadius: number, canvasPadding = options.padding ?? 40): Promise<void> {
  const parsed = parseRegisteredMermaid(source);
  if (!parsed.ok) throw new Error(parsed.error.map((e) => e.message).join("; "));
  if (parsed.value.body.kind !== "flowchart") return;
  const graph = parsed.value.body.graph;
  const elements = all(document);
  // The public projection provides a fallback for compound/path-based shapes.
  const measured = layoutMermaidWithReceipt(source, options).layout;
  const nodes = new Map<string, SvgNode>();
  for (const node of measured.nodes) {
    const element = elements.find((e) => classes(e).includes("node") && e.getAttribute("data-id") === node.id);
    if (!element) throw new Error(`Missing SVG node ${node.id}`);
    const shape = elements.find((e) => e.getAttribute("data-id") === `node-shape:${node.id}`);
    const box = shape && bounds(shape);
    nodes.set(node.id, { ...(box ?? { x: node.x, y: node.y, width: node.w, height: node.h }), element, shape: node.shape });
  }
  const groups = new Map<string, { element: Element; rect: Element; box: Box }>();
  for (const group of measured.groups) {
    const element = elements.find((e) => classes(e).includes("subgraph") && e.getAttribute("data-id") === group.id);
    const rect = element && Array.from(element.getElementsByTagName("rect")).find((e) => e.getAttribute("data-id") === `group-rect:${group.id}`);
    if (!element || !rect) throw new Error(`Missing SVG group ${group.id}`);
    groups.set(group.id, { element, rect, box: bounds(rect)! });
  }
  const directions: Record<string, string> = { TD: "DOWN", TB: "DOWN", BT: "UP", LR: "RIGHT", RL: "LEFT" };
  let prefix = "__svg_";
  while ([...nodes.keys(), ...groups.keys()].some((id) => id.startsWith(prefix))) prefix += "_";
  const root: ElkNode = {
    id: `${prefix}root`,
    children: [], edges: [],
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": directions[graph.direction]!,
      "elk.edgeRouting": "ORTHOGONAL", "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.baseValue": "40",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.padding": `[top=${canvasPadding},left=${canvasPadding},bottom=${canvasPadding},right=${canvasPadding}]`,
    },
  };
  const groupNodes = new Map<string, ElkNode>();
  for (const group of measured.groups) {
    const text = groups.get(group.id)!.element.getElementsByTagName("text")[0];
    const titleWidth = text ? number(text, "textLength") || (text.textContent ?? "").length * number(text, "font-size") * 0.65 : 0;
    groupNodes.set(group.id, { id: group.id, children: [], edges: [],
      labels: [{ text: text?.textContent ?? "", width: titleWidth, height: 16, layoutOptions: { "elk.nodeLabels.placement": "[H_LEFT, V_TOP, INSIDE]" } }],
      layoutOptions: {
      "elk.padding": "[top=44,left=20,bottom=20,right=20]",
      "elk.nodeSize.constraints": "[MINIMUM_SIZE, NODE_LABELS]",
      "elk.nodeSize.minimum": `(${titleWidth + 32},60)`,
    } });
  }
  const assignDirections = (subgraphs: typeof graph.subgraphs) => {
    for (const group of subgraphs) {
      if (group.direction) {
        const node = groupNodes.get(group.id)!;
        node.layoutOptions!["elk.direction"] = directions[group.direction]!;
        const members = new Set(measured.groups.find((g) => g.id === group.id)!.members);
        // As in Mermaid, external links make a subgraph inherit its parent's direction.
        const external = graph.edges.some((edge) => members.has(edge.source) !== members.has(edge.target));
        if (!external) node.layoutOptions!["elk.hierarchyHandling"] = "SEPARATE_CHILDREN";
      }
      assignDirections(group.children);
    }
  };
  assignDirections(graph.subgraphs);
  for (const group of measured.groups) {
    const parent = group.parentId ? groupNodes.get(group.parentId)! : root;
    parent.children!.push(groupNodes.get(group.id)!);
  }
  for (const [id, box] of nodes) {
    const membership = measured.groups.filter((g) => g.members.includes(id));
    const parent = membership.find((g) => !membership.some((child) => child.parentId === g.id));
    (parent ? groupNodes.get(parent.id)! : root).children!.push({ id, width: box.width, height: box.height });
  }
  const edgeElements = elements.filter((e) => classes(e).includes("edge") && e.hasAttribute("data-from"));
  const labelElements = elements.filter((e) => classes(e).includes("edge-label"));
  const usedEdges = new Set<Element>(), usedLabels = new Set<Element>();
  // XML attribute parsing folds source newlines into spaces in data-label.
  const labelKey = (value: string) => value.replace(/\s+/g, " ").trim();
  const edges = graph.edges.map((edge, i) => {
    const matches = (e: Element) => e.getAttribute("data-from") === edge.source && e.getAttribute("data-to") === edge.target && labelKey(e.getAttribute("data-label") ?? "") === labelKey(edge.label ?? "");
    const element = edge.style === "invisible" ? undefined : edgeElements.find((e) => !usedEdges.has(e) && matches(e));
    if (!element && edge.style !== "invisible") throw new Error(`Missing SVG edge ${edge.source} -> ${edge.target}`);
    if (element) usedEdges.add(element);
    const label = edge.label ? labelElements.find((e) => !usedLabels.has(e) && matches(e)) : undefined;
    if (label) usedLabels.add(label);
    const box = label?.getElementsByTagName("rect")[0];
    const labelBox = box && bounds(box);
    const elk: ElkExtendedEdge = { id: `${prefix}edge_${i}`, sources: [edge.source], targets: [edge.target] };
    if (labelBox) elk.labels = [{ text: edge.label, width: labelBox.width, height: labelBox.height, layoutOptions: { "elk.edgeLabels.placement": "CENTER", "elk.edgeLabels.inline": "true" } }];
    root.edges!.push(elk);
    return { edge, element, label, labelBox, elk };
  });
  const engine = new Elk();
  // The bundled Node implementation uses an in-process worker; no worker thread is started.
  const result = await engine.layout(root);
  const placed = new Map<string, Box>(), laidEdges = new Map<string, { edge: ElkExtendedEdge; offset: ElkPoint }>();
  const visit = (node: ElkNode, x = 0, y = 0) => {
    const nx = x + (node.x ?? 0), ny = y + (node.y ?? 0);
    placed.set(node.id, { x: nx, y: ny, width: node.width ?? 0, height: node.height ?? 0 });
    for (const edge of node.edges ?? []) laidEdges.set(edge.id, { edge, offset: { x: nx, y: ny } });
    for (const child of node.children ?? []) visit(child, nx, ny);
  };
  visit(result);
  for (const [id, old] of nodes) {
    const box = placed.get(id)!;
    move(old.element, box.x - old.x, box.y - old.y);
  }
  for (const [id, old] of groups) {
    const box = placed.get(id)!;
    let ancestor = old.element.parentNode;
    while (ancestor && !(ancestor.nodeType === 1 && groups.has((ancestor as Element).getAttribute("data-id") ?? ""))) ancestor = ancestor.parentNode;
    const parentId = ancestor && (ancestor as Element).getAttribute("data-id");
    const parent = parentId ? groups.get(parentId) : undefined;
    const parentBox = parentId ? placed.get(parentId) : undefined;
    move(old.element, box.x - old.box.x - (parent && parentBox ? parentBox.x - parent.box.x : 0), box.y - old.box.y - (parent && parentBox ? parentBox.y - parent.box.y : 0));
    old.rect.setAttribute("width", String(box.width)); old.rect.setAttribute("height", String(box.height));
    const header = old.element.getElementsByTagName("path")[0];
    if (header) header.setAttribute("d", `M ${old.box.x} ${old.box.y} H ${old.box.x + box.width} V ${old.box.y + 28} H ${old.box.x} Z`);
  }
  for (const item of edges) {
    if (!item.element) continue;
    const laid = laidEdges.get(item.elk.id);
    if (!laid || laid.edge.sections?.length !== 1) throw new Error(`ELK did not produce a single route for ${item.edge.source} -> ${item.edge.target}`);
    const section = laid.edge.sections[0]!;
    // ELK specifies an edge's coordinate system through its container.
    const offset = laid.edge.container ? placed.get(laid.edge.container) ?? laid.offset : laid.offset;
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
    const start = nodes.get(item.edge.source), end = nodes.get(item.edge.target);
    if (start) points[0] = clip(points[0]!, start, placed.get(item.edge.source)!);
    if (end) points[points.length - 1] = clip(points[points.length - 1]!, end, placed.get(item.edge.target)!);
    const replacement = document.createElementNS(SVG_NS, "path");
    for (const attribute of Array.from(item.element.attributes)) if (!["points", "d"].includes(attribute.name)) replacement.setAttribute(attribute.name, attribute.value);
    replacement.setAttribute("d", route(points, bendRadius));
    item.element.parentNode!.replaceChild(replacement, item.element);
    const label = laid.edge.labels?.[0];
    if (item.label && item.labelBox && label) move(item.label, (label.x ?? 0) + offset.x - item.labelBox.x, (label.y ?? 0) + offset.y - item.labelBox.y);
  }
  const width = result.width!, height = result.height!;
  if (![width, height].every((v) => Number.isFinite(v) && v > 0)) throw new Error("ELK returned invalid SVG dimensions");
  const svg = document.documentElement!;
  svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (const element of elements.filter((e) => e.getAttribute("data-backdrop") === "page")) {
    element.setAttribute("width", String(width)); element.setAttribute("height", String(height));
  }
}
