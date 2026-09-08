import "./canvas-guard.js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { JSDOM } from "jsdom";

import type {
  IntermediateDiagram,
  IntermediatePoint,
  IntermediateSequenceActivation,
  IntermediateSequenceBox,
  IntermediateSequenceFrame,
  IntermediateSequenceMessage,
  IntermediateSequenceNote,
  IntermediateSequenceParticipant,
} from "./index.js";
import { ancestorOffset, elementBBox, samplePath, unionBBoxes, type SvgBBox } from "./svg-bbox.js";

// Geometry extracted from a headless mermaid render, keyed so the generator can
// look elements up without relying on ordering assumptions.
export interface SequenceParticipantGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lifelineX: number;
  lifelineBottom: number;
}

export interface SequenceFrameGeometry {
  startOrder: number;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dividerYs: number[];
}

export interface SequenceNoteGeometry {
  order: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SequenceActivationGeometry {
  participantId: string;
  startOrder: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SequenceSelfMessageGeometry {
  order: number;
  points: Array<{ x: number; y: number }>;
}

export interface SequenceGeometry {
  participants: SequenceParticipantGeometry[];
  eventYs: Record<string, number>;
  frames: SequenceFrameGeometry[];
  notes: SequenceNoteGeometry[];
  activations: SequenceActivationGeometry[];
  selfMessages: SequenceSelfMessageGeometry[];
}

export interface SequenceGeometryContext {
  participants: IntermediateSequenceParticipant[];
  messages: IntermediateSequenceMessage[];
  notes: IntermediateSequenceNote[];
  frames: IntermediateSequenceFrame[];
  activations: IntermediateSequenceActivation[];
  boxes: IntermediateSequenceBox[];
}

const ACTOR_MAN_WIDTH = 35;
const DEFAULT_HEADER_HEIGHT = 65;

let renderCounter = 0;
let canvasAvailability: boolean | undefined;

// canvas carries a native binding that hard-kills the process (SIGKILL) when
// loaded on the wrong platform — e.g. node_modules populated by a container on
// a mounted volume. Probe it in a child process before importing in-process.
function isCanvasAvailable(): boolean {
  if (canvasAvailability === undefined) {
    try {
      const canvasPath = createRequire(import.meta.url).resolve("canvas");
      execFileSync(process.execPath, ["-e", `require(${JSON.stringify(canvasPath)})`], {
        stdio: "ignore",
      });
      canvasAvailability = true;
    } catch {
      canvasAvailability = false;
    }
  }
  return canvasAvailability;
}

function attr(el: Element, name: string): number {
  return Number(el.getAttribute(name) ?? 0);
}

function markerCenterX(el: Element): number {
  if (el.tagName === "rect") {
    return attr(el, "x") + attr(el, "width") / 2;
  }
  return attr(el, "x");
}

function nearIndex(values: Array<{ y: number }>, y: number): number {
  let best = -1;
  let bestDistance = Infinity;
  values.forEach((value, index) => {
    const distance = Math.abs(value.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/**
 * Renders the sequence diagram with mermaid in a headless DOM (canvas-backed
 * text measurement) and extracts absolute geometry matching stock draw.io's
 * mermaid import. Returns undefined when rendering is unavailable.
 */
export async function renderSequenceGeometry(
  mermaidText: string,
  context: SequenceGeometryContext,
): Promise<SequenceGeometry | undefined> {
  if (!isCanvasAvailable()) {
    return undefined;
  }
  const { renderMermaidSvg } = await import("./mermaid-render.js");
  const svg = await renderMermaidSvg(mermaidText);
  if (!svg) {
    return undefined;
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  return extractGeometry(dom, svg, context);
}

function extractGeometry(
  dom: JSDOM,
  svg: string,
  context: SequenceGeometryContext,
): SequenceGeometry | undefined {
  const doc = new dom.window.DOMParser().parseFromString(svg, "image/svg+xml");

  // Lifelines and header markers appear right-to-left in the SVG document;
  // sort by x so they align with the participant declaration order.
  const lifelines = [...doc.querySelectorAll('[class~="actor-line"]')]
    .sort((a, b) => attr(a, "x1") - attr(b, "x1"));
  if (lifelines.length !== context.participants.length || lifelines.length === 0) {
    return undefined;
  }

  // Participant headers: rect.actor-top for participants; for stick-figure
  // actors the label text inside g.actor-man.actor-top marks the header.
  const headerMarkers = [
    ...doc.querySelectorAll(
      'rect[class~="actor-top"], g[class~="actor-man"][class~="actor-top"] > text',
    ),
  ].sort((a, b) => markerCenterX(a) - markerCenterX(b));
  const participants: SequenceParticipantGeometry[] = context.participants.map((participant, i) => {
    const lifeline = lifelines[i];
    const lifelineX = attr(lifeline, "x1");
    const lifelineTop = attr(lifeline, "y1");
    const lifelineBottom = attr(lifeline, "y2");
    const marker = headerMarkers[i];
    if (marker && marker.tagName === "rect") {
      return {
        id: participant.id,
        x: attr(marker, "x"),
        y: attr(marker, "y"),
        width: attr(marker, "width"),
        height: attr(marker, "height"),
        lifelineX,
        lifelineBottom,
      };
    }
    // Stick-figure actor: no header rect; center a narrow header on the lifeline
    return {
      id: participant.id,
      x: lifelineX - ACTOR_MAN_WIDTH / 2,
      y: lifelineTop - DEFAULT_HEADER_HEIGHT,
      width: ACTOR_MAN_WIDTH,
      height: DEFAULT_HEADER_HEIGHT,
      lifelineX,
      lifelineBottom,
    };
  });

  // Notes are drawn in a separate pass before messages, so zip each family
  // with its own list instead of relying on global document order.
  const eventYs: Record<string, number> = {};
  const notes: SequenceNoteGeometry[] = [];
  const selfMessages: SequenceSelfMessageGeometry[] = [];

  const noteRects = [...doc.querySelectorAll('rect[class~="note"]')];
  const orderedNotes = [...context.notes].sort((a, b) => a.order - b.order);
  noteRects.forEach((rect, index) => {
    const note = orderedNotes[index];
    if (!note) {
      return;
    }
    const x = attr(rect, "x");
    const y = attr(rect, "y");
    const width = attr(rect, "width");
    const height = attr(rect, "height");
    notes.push({ order: note.order, x, y, width, height });
    eventYs[note.order] = y + height / 2;
  });

  const messageLines = [
    ...doc.querySelectorAll('[class~="messageLine0"], [class~="messageLine1"]'),
  ];
  const orderedMessages = [...context.messages].sort((a, b) => a.order - b.order);
  messageLines.forEach((el, index) => {
    const message = orderedMessages[index];
    if (!message) {
      return;
    }
    if (el.tagName === "path") {
      // Self-message loop: "M sx,sy C c1x,c1y c2x,c2y ex,ey"
      const numbers = (el.getAttribute("d") ?? "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      if (numbers.length >= 8) {
        const [, sy, c1x, , c2x, , , ey] = numbers;
        eventYs[message.order] = sy;
        selfMessages.push({
          order: message.order,
          points: [
            { x: Math.max(c1x, c2x), y: sy },
            { x: Math.max(c1x, c2x), y: ey },
          ],
        });
      }
      return;
    }
    eventYs[message.order] = attr(el, "y1");
  });

  // Frames: 4 border loopLines followed by same-extent horizontal dividers
  const loopLines = [...doc.querySelectorAll('[class~="loopLine"]')].map((line) => ({
    x1: attr(line, "x1"),
    y1: attr(line, "y1"),
    x2: attr(line, "x2"),
    y2: attr(line, "y2"),
  }));
  const rawFrames: Array<{ x: number; y: number; width: number; height: number; dividerYs: number[] }> = [];
  let i = 0;
  while (i + 3 < loopLines.length) {
    const [top, right, bottom, left] = loopLines.slice(i, i + 4);
    const isBorder =
      top.y1 === top.y2 && bottom.y1 === bottom.y2 &&
      right.x1 === right.x2 && left.x1 === left.x2;
    if (!isBorder) {
      i += 1;
      continue;
    }
    const x = Math.min(top.x1, top.x2);
    const y = Math.min(top.y1, bottom.y1);
    const width = Math.abs(top.x2 - top.x1);
    const height = Math.abs(bottom.y1 - top.y1);
    const dividerYs: number[] = [];
    let j = i + 4;
    while (j < loopLines.length) {
      const candidate = loopLines[j];
      const sameExtent = candidate.y1 === candidate.y2 &&
        candidate.x1 === top.x1 && candidate.x2 === top.x2 &&
        candidate.y1 > y && candidate.y1 < y + height;
      if (!sameExtent) {
        break;
      }
      dividerYs.push(candidate.y1);
      j += 1;
    }
    rawFrames.push({ x, y, width, height, dividerYs });
    i = j;
  }

  // Match raw frames (document order, parents first) to parsed frames by start position
  const parsedFrames = [...context.frames].sort((a, b) => a.startOrder - b.startOrder || a.depth - b.depth);
  const frames: SequenceFrameGeometry[] = rawFrames.map((raw, index) => {
    const parsed = parsedFrames[index];
    return {
      startOrder: parsed?.startOrder ?? index,
      depth: parsed?.depth ?? 0,
      ...raw,
    };
  });

  // Activations: match each rect to the nearest lifeline and message row
  const eventYList = Object.entries(eventYs).map(([order, y]) => ({ order: Number(order), y }));
  const activations: SequenceActivationGeometry[] = [...doc.querySelectorAll('[class^="activation"], [class*=" activation"]')]
    .filter((el) => el.tagName === "rect")
    .map((rect) => {
      const x = attr(rect, "x");
      const y = attr(rect, "y");
      const width = attr(rect, "width");
      const height = attr(rect, "height");
      const centerX = x + width / 2;
      let participant = participants[0];
      let best = Infinity;
      for (const candidate of participants) {
        const distance = Math.abs(candidate.lifelineX - centerX);
        if (distance < best) {
          best = distance;
          participant = candidate;
        }
      }
      const startIndex = nearIndex(eventYList, y);
      return {
        participantId: participant?.id ?? "",
        startOrder: eventYList[startIndex]?.order ?? 0,
        x,
        y,
        width,
        height,
      };
    })
    .filter((activation) => activation.participantId !== "");

  // Boxes are not taken from the SVG: mermaid renders them full-height, while
  // stock draw.io wraps only the participant headers — the generator computes
  // the header-area box from participant geometry instead.
  return { participants, eventYs, frames, notes, activations, selfMessages };
}

// ---------------------------------------------------------------------------
// Flowchart geometry (node rects + edge polylines from mermaid's dagre render)
// ---------------------------------------------------------------------------

export interface FlowchartNodeGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowchartEdgeGeometry {
  id: string;
  points: IntermediatePoint[];
}

export interface FlowchartGeometry {
  nodes: FlowchartNodeGeometry[];
  edges: FlowchartEdgeGeometry[];
}

export interface FlowchartGeometryContext {
  /** Vertex ids paired with the domId mermaid assigns them in the SVG. */
  vertices: Array<{ id: string; domId?: string }>;
  /** DB edge ids (e.g. "L_A_C_0") in declaration order. */
  edgeIds: string[];
}

const FLOWCHART_RENDER_MARGIN = 8;

/**
 * Renders a flowchart with mermaid in a headless DOM and extracts absolute
 * node rectangles and edge polylines. Returns undefined when rendering is
 * unavailable on this platform.
 */
export async function renderFlowchartGeometry(
  mermaidText: string,
  context: FlowchartGeometryContext,
): Promise<FlowchartGeometry | undefined> {
  // htmlLabels render through foreignObject, which jsdom cannot measure;
  // mermaid reads the top-level htmlLabels flag.
  return renderGraphGeometry(mermaidText, context, { htmlLabels: false });
}

/**
 * Same extraction for state diagrams (stateDiagram-v2 renders with the same
 * node/edge id conventions). htmlLabels are forced off: state labels are
 * markdown-typed, which otherwise renders as unmeasurable foreignObjects.
 */
export async function renderStateGeometry(
  mermaidText: string,
  context: FlowchartGeometryContext,
): Promise<FlowchartGeometry | undefined> {
  return renderGraphGeometry(mermaidText, context, { htmlLabels: false });
}

async function renderGraphGeometry(
  mermaidText: string,
  context: FlowchartGeometryContext,
  configOverrides?: Record<string, unknown>,
): Promise<FlowchartGeometry | undefined> {
  if (!isCanvasAvailable()) {
    return undefined;
  }
  const { renderMermaidSvg } = await import("./mermaid-render.js");
  const svg = await renderMermaidSvg(mermaidText, configOverrides);
  if (!svg) {
    return undefined;
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = new dom.window.DOMParser().parseFromString(svg, "image/svg+xml");

  const rawNodes: FlowchartNodeGeometry[] = [];
  for (const vertex of context.vertices) {
    if (!vertex.domId) {
      throw new Error(`render_mismatch: node "${vertex.id}" has no domId in the diagram DB`);
    }
    const group = doc.querySelector(`g.node[id$="-${vertex.domId}"]`);
    const box = group ? elementBBox(group) : undefined;
    if (!group || !box) {
      throw new Error(`render_mismatch: node "${vertex.id}" was not found in the rendered SVG`);
    }
    // Cluster contents are nested under translated ancestor groups
    const offset = ancestorOffset(group);
    rawNodes.push({
      id: vertex.id,
      ...roundBBox({ ...box, x: box.x + offset.x, y: box.y + offset.y }),
    });
  }
  if (rawNodes.length === 0 && context.vertices.length > 0) {
    throw new Error("render_mismatch: no rendered nodes matched the diagram DB");
  }

  const rawEdges: FlowchartEdgeGeometry[] = [];
  for (const edgeId of context.edgeIds) {
    const path = doc.querySelector(`path[id$="-${edgeId}"]`);
    if (!path) {
      continue;
    }
    const offset = ancestorOffset(path);
    const points = samplePath(path.getAttribute("d") ?? "").map((point) => ({
      x: point.x + offset.x,
      y: point.y + offset.y,
    }));
    if (points.length >= 2) {
      rawEdges.push({ id: edgeId, points });
    }
  }

  // Normalize so no coordinate is smaller than the margin
  const allBoxes: SvgBBox[] = rawNodes.map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height }));
  for (const edge of rawEdges) {
    for (const point of edge.points) {
      allBoxes.push({ x: point.x, y: point.y, width: 0, height: 0 });
    }
  }
  const bounds = unionBBoxes(allBoxes);
  const offsetX = bounds ? Math.min(0, bounds.x - FLOWCHART_RENDER_MARGIN) : 0;
  const offsetY = bounds ? Math.min(0, bounds.y - FLOWCHART_RENDER_MARGIN) : 0;

  return {
    nodes: rawNodes.map((node) => ({ ...node, x: node.x - offsetX, y: node.y - offsetY })),
    edges: rawEdges.map((edge) => ({
      id: edge.id,
      points: edge.points.map((point) => ({ x: point.x - offsetX, y: point.y - offsetY })),
    })),
  };
}

function roundBBox(box: SvgBBox): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  };
}
