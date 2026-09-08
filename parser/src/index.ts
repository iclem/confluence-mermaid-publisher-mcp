import dagre from "@dagrejs/dagre";

export interface MermaidParseRequest {
  mermaid: string;
  sourceName?: string;
}

export type DiagramType = "flowchart" | "sequence" | "state" | "gantt" | "xychart";
export type LayoutDirection = "TD" | "TB" | "LR" | "RL";

export type NodeShape =
  | "text"
  | "rectangle"
  | "rounded-rectangle"
  | "rhombus"
  | "ellipse"
  | "stadium"
  | "cylinder"
  | "hexagon"
  | "parallelogram"
  | "parallelogram-alt"
  | "trapezoid"
  | "trapezoid-alt"
  | "subroutine"
  | "double-circle"
  | "odd";

export type EdgeKind =
  | "directed"
  | "dashed-directed"
  | "plain"
  | "dashed-plain"
  | "thick-directed"
  | "thick-plain"
  | "invisible"
  | "bidirectional-directed"
  | "bidirectional-dashed-directed";
export type SequenceMessageKind =
  | "solid"
  | "dotted"
  | "solid-open"
  | "dotted-open"
  | "solid-cross"
  | "dotted-cross"
  | "solid-point"
  | "dotted-point"
  | "bidirectional-solid"
  | "bidirectional-dotted"
  // Legacy alias kept for backwards compatibility with previously generated payloads
  | "dashed";

export interface IntermediateNode {
  id: string;
  label: string;
  shape: NodeShape;
  fillColor?: string;
  strokeColor?: string;
  fontColor?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface IntermediatePoint {
  x: number;
  y: number;
}

export interface IntermediateEdge {
  sourceId: string;
  targetId: string;
  label?: string;
  kind: EdgeKind;
  points?: IntermediatePoint[];
}

export interface IntermediateSubgraph {
  id: string;
  label: string;
  nodeIds: string[];
  parentId?: string;
}

export interface IntermediateSequenceParticipant {
  id: string;
  label: string;
  type?: "participant" | "actor";
}

export interface IntermediateSequenceMessage {
  order: number;
  sourceId: string;
  targetId: string;
  label: string;
  kind: SequenceMessageKind;
  number?: number;
}

export type SequenceNotePlacement = "over" | "leftOf" | "rightOf";

export interface IntermediateSequenceNote {
  order: number;
  participantIds: string[];
  label: string;
  placement: SequenceNotePlacement;
}

export interface IntermediateSequenceActivation {
  participantId: string;
  startOrder: number;
  endOrder: number;
  depth: number;
}

export type SequenceFrameKind = "opt" | "loop" | "alt" | "par" | "critical" | "break";

export interface IntermediateSequenceFrameSection {
  order: number;
  label: string;
}

export interface IntermediateSequenceFrame {
  kind: SequenceFrameKind;
  label: string;
  startOrder: number;
  endOrder: number;
  depth: number;
  participantIds?: string[];
  sections?: IntermediateSequenceFrameSection[];
}

export interface IntermediateSequenceBox {
  label: string;
  fillColor?: string;
  participantIds: string[];
}

export interface IntermediateDiagram {
  pageName: string;
  diagramType: DiagramType;
  direction?: LayoutDirection;
  nodes: IntermediateNode[];
  edges: IntermediateEdge[];
  subgraphs: IntermediateSubgraph[];
  sequenceParticipants: IntermediateSequenceParticipant[];
  sequenceMessages: IntermediateSequenceMessage[];
  sequenceNotes: IntermediateSequenceNote[];
  sequenceActivations: IntermediateSequenceActivation[];
  sequenceFrames: IntermediateSequenceFrame[];
  sequenceBoxes?: IntermediateSequenceBox[];
  sequenceGeometry?: import("./mermaid-geometry.js").SequenceGeometry;
  warnings: string[];
}

const SUPPORTED_DIRECTIONS = new Set<LayoutDirection>(["TD", "TB", "LR", "RL"]);
const STATE_NOTE_START_PATTERN = /^note\s+(?:left|right)\s+of\s+(?<target>\[\*\]|[A-Za-z_][A-Za-z0-9_-]*)$/i;

const GANTT_LABEL_COLUMN_WIDTH = 280;
const GANTT_TIMELINE_COLUMN_WIDTH = 120;
const GANTT_TITLE_HEIGHT = 36;
const GANTT_HEADER_HEIGHT = 32;
const GANTT_SECTION_HEIGHT = 30;
const GANTT_TASK_ROW_HEIGHT = 30;
const GANTT_ROW_GAP = 8;
const GANTT_SECTION_GAP = 16;
const GANTT_BAR_VERTICAL_PADDING = 4;
const GANTT_BAR_HORIZONTAL_PADDING = 8;
const GANTT_DAY_MS = 24 * 60 * 60 * 1000;
const XYCHART_MARGIN_TOP = 24;
const XYCHART_MARGIN_RIGHT = 24;
const XYCHART_MARGIN_BOTTOM = 24;
const XYCHART_TITLE_HEIGHT = 36;
const XYCHART_AXIS_LABEL_HEIGHT = 24;
const XYCHART_CATEGORY_LABEL_HEIGHT = 24;
const XYCHART_PLOT_HEIGHT = 360;
const XYCHART_CATEGORY_BAND_WIDTH = 120;
const XYCHART_BAR_GROUP_WIDTH_RATIO = 0.72;
const XYCHART_BAR_GAP = 8;
const XYCHART_BAR_MAX_WIDTH = 56;
const XYCHART_LINE_MARKER_SIZE = 12;
const XYCHART_SERIES_COLORS = [
  {
    fillColor: "#dae8fc",
    strokeColor: "#6c8ebf",
    fontColor: "#1f1f1f",
  },
  {
    fillColor: "#d5e8d4",
    strokeColor: "#82b366",
    fontColor: "#1f1f1f",
  },
  {
    fillColor: "#fff2cc",
    strokeColor: "#d6b656",
    fontColor: "#1f1f1f",
  },
  {
    fillColor: "#f8cecc",
    strokeColor: "#b85450",
    fontColor: "#1f1f1f",
  },
  {
    fillColor: "#e1d5e7",
    strokeColor: "#9673a6",
    fontColor: "#1f1f1f",
  },
  {
    fillColor: "#f5f5f5",
    strokeColor: "#666666",
    fontColor: "#1f1f1f",
  },
] satisfies Array<Pick<IntermediateNode, "fillColor" | "strokeColor" | "fontColor">>;

interface ScanState {
  bracketDepth: number;
  braceDepth: number;
  parenDepth: number;
  inQuote: boolean;
  inPipeLabel: boolean;
  escaped: boolean;
}

interface ParsedHeader {
  diagramType: DiagramType;
  direction?: LayoutDirection;
}

interface ParsedGanttTask {
  id: string;
  section: string;
  title: string;
  startPosition: number;
  endPosition: number;
  tags: string[];
}

interface ParsedXychart {
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  categories: string[];
  yMin: number;
  yMax: number;
  barSeries: number[][];
  lineSeries: number[][];
}



interface MermaidClassStyle {
  fillColor?: string;
  strokeColor?: string;
  fontColor?: string;
}


interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlowchartLayout {
  nodeLayouts: Map<string, NodeLayout>;
  edgeLayouts: Map<number, IntermediatePoint[]>;
}

function createScanState(): ScanState {
  return {
    bracketDepth: 0,
    braceDepth: 0,
    parenDepth: 0,
    inQuote: false,
    inPipeLabel: false,
    escaped: false,
  };
}

function isTopLevel(state: ScanState): boolean {
  return (
    !state.inQuote &&
    !state.inPipeLabel &&
    state.bracketDepth === 0 &&
    state.braceDepth === 0 &&
    state.parenDepth === 0
  );
}

function advanceScanState(state: ScanState, char: string): ScanState {
  const nextState = { ...state };

  if (char === '"' && !state.escaped) {
    nextState.inQuote = !state.inQuote;
  } else if (!state.inQuote) {
    if (char === "|") {
      if (state.inPipeLabel) {
        nextState.inPipeLabel = false;
      } else if (isTopLevel(state)) {
        nextState.inPipeLabel = true;
      }
    } else if (!state.inPipeLabel) {
      if (char === "[") {
        nextState.bracketDepth += 1;
      } else if (char === "]") {
        nextState.bracketDepth = Math.max(0, nextState.bracketDepth - 1);
      } else if (char === "{") {
        nextState.braceDepth += 1;
      } else if (char === "}") {
        nextState.braceDepth = Math.max(0, nextState.braceDepth - 1);
      } else if (char === "(") {
        nextState.parenDepth += 1;
      } else if (char === ")") {
        nextState.parenDepth = Math.max(0, nextState.parenDepth - 1);
      }
    }
  }

  nextState.escaped = char === "\\" && !state.escaped;
  return nextState;
}


function normalizeLines(mermaid: string, splitSemicolons = false): string[] {
  const statements: string[] = [];
  let current = "";
  let state = createScanState();

  for (const char of mermaid.replace(/\r/g, "")) {
    if ((char === "\n" || (splitSemicolons && char === ";")) && isTopLevel(state)) {
      const statement = current.trim();
      if (statement.length > 0 && !statement.startsWith("%%")) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += char;
    state = advanceScanState(state, char);
  }

  const statement = current.trim();
  if (statement.length > 0 && !statement.startsWith("%%")) {
    statements.push(statement);
  }

  return statements;
}

function derivePageName(sourceName?: string): string {
  if (!sourceName) {
    return "Mermaid Diagram";
  }

  const normalized = sourceName.replace(/\.[^.]+$/, "").trim();
  return normalized.length > 0 ? normalized : "Mermaid Diagram";
}

function parseHeader(line: string): ParsedHeader {
  const tokens = line.split(/\s+/);
  if (tokens[0] === "flowchart" || tokens[0] === "graph") {
    const direction = (tokens[1] ?? "TD").toUpperCase() as LayoutDirection;
    if (!SUPPORTED_DIRECTIONS.has(direction)) {
      throw new Error(`unsupported_dialect: unsupported direction "${direction}"`);
    }

    return { diagramType: "flowchart", direction };
  }

  if (line === "sequenceDiagram") {
    return { diagramType: "sequence" };
  }

  if (line === "stateDiagram-v2" || line === "stateDiagram") {
    return { diagramType: "state" };
  }

  if (line === "gantt") {
    return { diagramType: "gantt" };
  }

  if (tokens[0] === "xychart-beta") {
    if (tokens.length > 1) {
      throw new Error(`unsupported_construct: "${line}"`);
    }
    return { diagramType: "xychart" };
  }

  throw new Error(`unsupported_dialect: unsupported header "${line}"`);
}


function normalizeLabel(rawLabel: string): string {
  const trimmed = rawLabel.trim();
  const unescaped = trimmed
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
  if (
    (unescaped.startsWith('"') && unescaped.endsWith('"')) ||
    (unescaped.startsWith("'") && unescaped.endsWith("'"))
  ) {
    return unescaped.slice(1, -1);
  }

  return unescaped;
}


function applyClassStyles(node: IntermediateNode, classNames: string[], classStyles: Map<string, MermaidClassStyle>): IntermediateNode {
  if (classNames.length === 0) {
    return node;
  }

  const nextNode: IntermediateNode = { ...node };
  for (const className of classNames) {
    const style = classStyles.get(className);
    if (!style) {
      continue;
    }
    nextNode.fillColor ??= style.fillColor;
    nextNode.strokeColor ??= style.strokeColor;
    nextNode.fontColor ??= style.fontColor;
  }
  return nextNode;
}

function estimateNodeDimensions(node: IntermediateNode): { width: number; height: number } {
  const lines = (node.label || "").split(/\r\n|\r|\n/, -1);
  const lineCount = Math.max(1, lines.length);
  const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);

  let width = Math.max(140, longestLineLength * 7 + 36);
  let height = Math.max(60, lineCount * 18 + 28);
  if (node.shape === "rhombus") {
    width += 32;
    height += 20;
  } else if (node.shape === "ellipse") {
    width += 20;
    height += 10;
  }

  return { width, height };
}

export function computeFlowchartLayout(
  nodes: IntermediateNode[],
  edges: IntermediateEdge[],
  subgraphs: IntermediateSubgraph[],
  direction: LayoutDirection,
): FlowchartLayout {
  const graph = new dagre.graphlib.Graph({
    compound: subgraphs.length > 0,
    multigraph: true,
  });
  graph.setGraph({
    rankdir: direction === "TD" ? "TB" : direction,
    nodesep: 60,
    ranksep: 80,
    edgesep: 30,
    ranker: "network-simplex",
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const subgraph of subgraphs) {
    graph.setNode(subgraph.id, { width: 10, height: 10 });
  }

  const dimensionsById = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const dimensions = estimateNodeDimensions(node);
    dimensionsById.set(node.id, dimensions);
    graph.setNode(node.id, {
      width: dimensions.width,
      height: dimensions.height,
    });
  }

  for (const subgraph of subgraphs) {
    if (subgraph.parentId) {
      graph.setParent(subgraph.id, subgraph.parentId);
    }
    for (const nodeId of subgraph.nodeIds) {
      if (graph.hasNode(nodeId)) {
        graph.setParent(nodeId, subgraph.id);
      }
    }
  }

  const clusterIds = new Set(subgraphs.map((subgraph) => subgraph.id));
  for (const [index, edge] of edges.entries()) {
    // dagre cannot rank edges incident to cluster (compound) nodes — they are
    // left without waypoints and the generator orthogonal-routes them
    if (clusterIds.has(edge.sourceId) || clusterIds.has(edge.targetId)) {
      continue;
    }
    if (graph.hasNode(edge.sourceId) && graph.hasNode(edge.targetId)) {
      graph.setEdge(
        edge.sourceId,
        edge.targetId,
        {
          minlen: edge.kind === "plain" ? 1 : 2,
          weight: 1,
        },
        String(index),
      );
    }
  }

  dagre.layout(graph);

  const nodeLayouts = new Map<string, NodeLayout>();
  for (const node of nodes) {
    const layoutNode = graph.node(node.id) as { x: number; y: number; width: number; height: number } | undefined;
    const dimensions = dimensionsById.get(node.id);
    if (!layoutNode) {
      continue;
    }
    nodeLayouts.set(node.id, {
      x: Math.round(layoutNode.x - (dimensions?.width ?? layoutNode.width) / 2),
      y: Math.round(layoutNode.y - (dimensions?.height ?? layoutNode.height) / 2),
      width: Math.round(dimensions?.width ?? layoutNode.width),
      height: Math.round(dimensions?.height ?? layoutNode.height),
    });
  }

  const edgeLayouts = new Map<number, IntermediatePoint[]>();
  for (const [index, edge] of edges.entries()) {
    const layoutEdge = graph.edge({
      v: edge.sourceId,
      w: edge.targetId,
      name: String(index),
    }) as { points?: Array<{ x: number; y: number }> } | undefined;
    if (!layoutEdge?.points?.length) {
      continue;
    }
    edgeLayouts.set(
      index,
      layoutEdge.points.map((point) => ({
        x: Math.round(point.x),
        y: Math.round(point.y),
      })),
    );
  }

  return { nodeLayouts, edgeLayouts };
}

interface FlowchartVertexData {
  id: string;
  domId?: string;
  text?: string;
  type?: string;
  classes?: string[];
  styles?: string[];
  link?: string;
}

interface FlowchartEdgeData {
  id: string;
  start: string;
  end: string;
  type: string;
  stroke: string;
  text?: string;
}

interface FlowchartSubgraphData {
  id: string;
  title?: string;
  nodes: string[];
}

interface FlowchartClassData {
  styles?: string[];
  textStyles?: string[];
}

interface FlowchartDb {
  getVertices(): Map<string, FlowchartVertexData>;
  getEdges(): FlowchartEdgeData[];
  getSubGraphs(): FlowchartSubgraphData[];
  getClasses(): Map<string, FlowchartClassData>;
  getDirection(): string | undefined;
}

const FLOWCHART_SHAPE_MAP: Record<string, NodeShape> = {
  square: "rectangle",
  rect: "rectangle",
  process: "rectangle",
  proc: "rectangle",
  "fr-rect": "rectangle",
  "sq": "rectangle",
  round: "rounded-rectangle",
  rounded: "rounded-rectangle",
  stadium: "stadium",
  pill: "stadium",
  term: "stadium",
  terminator: "stadium",
  subroutine: "subroutine",
  subproc: "subroutine",
  "fr-cyl": "cylinder",
  cylinder: "cylinder",
  cyl: "cylinder",
  db: "cylinder",
  circle: "ellipse",
  circ: "ellipse",
  doublecircle: "double-circle",
  "dbl-circ": "double-circle",
  diamond: "rhombus",
  diam: "rhombus",
  decision: "rhombus",
  hexagon: "hexagon",
  hex: "hexagon",
  odd: "odd",
  lean_right: "parallelogram",
  "lean-r": "parallelogram",
  parallelogram: "parallelogram",
  para: "parallelogram",
  lean_left: "parallelogram-alt",
  "lean-l": "parallelogram-alt",
  trapezoid: "trapezoid",
  "trap-b": "trapezoid",
  inv_trapezoid: "trapezoid-alt",
  "trap-t": "trapezoid-alt",
};

function mapFlowchartShape(type: string | undefined, nodeId: string, warnings: string[]): NodeShape {
  if (!type) {
    return "rectangle";
  }
  const shape = FLOWCHART_SHAPE_MAP[type];
  if (shape) {
    return shape;
  }
  warnings.push(`unsupported_shape: node "${nodeId}" uses shape "${type}" rendered as rectangle`);
  return "rectangle";
}

function parseFlowchartStyles(declarations: string[]): MermaidClassStyle {
  const style: MermaidClassStyle = {};
  for (const declaration of declarations) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (key === "fill") {
      style.fillColor = value;
    } else if (key === "stroke") {
      style.strokeColor = value;
    } else if (key === "color") {
      style.fontColor = value;
    }
  }
  return style;
}

function normalizeFlowchartLabel(text: string): string {
  // Mermaid's flowchart lexer stores entity codes in the same placeholder
  // encoding as the sequence lexer, so reuse that decoder before normalizing.
  return normalizeLabel(decodeSequenceEntities(text));
}

function mapFlowchartEdgeKind(edge: FlowchartEdgeData, warnings: string[]): EdgeKind {
  if (edge.stroke === "invisible") {
    return "invisible";
  }
  const bidirectional = edge.type.startsWith("double_arrow");
  const arrowType = bidirectional ? edge.type.slice("double_".length) : edge.type;
  if (arrowType === "arrow_circle" || arrowType === "arrow_cross") {
    warnings.push(
      `unsupported_arrow_variant: ${arrowType === "arrow_circle" ? "circle" : "cross"} arrowhead on edge "${edge.id}" rendered as a block arrow`,
    );
  }
  const dotted = edge.stroke === "dotted";
  const thick = edge.stroke === "thick";
  if (arrowType === "arrow_open") {
    return thick ? "thick-plain" : dotted ? "dashed-plain" : "plain";
  }
  const directed: EdgeKind = thick ? "thick-directed" : dotted ? "dashed-directed" : "directed";
  if (bidirectional && directed === "directed") {
    return "bidirectional-directed";
  }
  if (bidirectional && directed === "dashed-directed") {
    return "bidirectional-dashed-directed";
  }
  return directed;
}

async function parseFlowchart(
  request: MermaidParseRequest,
  direction: LayoutDirection,
): Promise<IntermediateDiagram> {
  const { mermaid } = await import("./mermaid-env.js");
  const warnings: string[] = [];

  let db: FlowchartDb;
  try {
    await mermaid.parse(request.mermaid);
    db = (await mermaid.mermaidAPI.getDiagramFromText(request.mermaid)).db as FlowchartDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse_error: ${message.split("\n")[0]}`);
  }

  const classStyles = new Map<string, MermaidClassStyle>();
  for (const [className, classDef] of db.getClasses()) {
    if (className === "default") {
      continue;
    }
    classStyles.set(
      className,
      parseFlowchartStyles([...(classDef.styles ?? []), ...(classDef.textStyles ?? [])]),
    );
  }

  const vertices = Array.from(db.getVertices().values());
  const vertexIds = new Set(vertices.map((vertex) => vertex.id));

  const nodes: IntermediateNode[] = vertices.map((vertex) => {
    let node: IntermediateNode = {
      id: vertex.id,
      label: normalizeFlowchartLabel(vertex.text ?? vertex.id),
      shape: mapFlowchartShape(vertex.type, vertex.id, warnings),
    };
    node = applyClassStyles(
      node,
      (vertex.classes ?? []).filter((className) => className !== "clickable"),
      classStyles,
    );
    const inlineStyle = parseFlowchartStyles(vertex.styles ?? []);
    if (inlineStyle.fillColor !== undefined) {
      node = { ...node, fillColor: inlineStyle.fillColor };
    }
    if (inlineStyle.strokeColor !== undefined) {
      node = { ...node, strokeColor: inlineStyle.strokeColor };
    }
    if (inlineStyle.fontColor !== undefined) {
      node = { ...node, fontColor: inlineStyle.fontColor };
    }
    if (vertex.link) {
      warnings.push(`ignored_flowchart_directive: "click ${vertex.id}" link is not rendered`);
    }
    return node;
  });

  const edges: IntermediateEdge[] = [];
  const edgeGeometryKeys: string[] = [];
  for (const dbEdge of db.getEdges()) {
    if (!vertexIds.has(dbEdge.start) || !vertexIds.has(dbEdge.end)) {
      warnings.push(
        `unsupported_subgraph_edge: edge "${dbEdge.id}" attached to a subgraph endpoint is not rendered`,
      );
      continue;
    }
    edges.push({
      sourceId: dbEdge.start,
      targetId: dbEdge.end,
      label: normalizeFlowchartLabel(dbEdge.text ?? "").trim() || undefined,
      kind: mapFlowchartEdgeKind(dbEdge, warnings),
    });
    edgeGeometryKeys.push(dbEdge.id);
  }

  const dbSubgraphs = db.getSubGraphs();
  const subgraphIdByDbId = new Map<string, string>();
  dbSubgraphs.forEach((subgraph, index) => {
    subgraphIdByDbId.set(
      subgraph.id,
      /^subGraph\d+$/.test(subgraph.id) ? `subgraph-${index + 1}` : subgraph.id,
    );
  });
  const subgraphs: IntermediateSubgraph[] = dbSubgraphs.map((subgraph) => {
    const id = subgraphIdByDbId.get(subgraph.id)!;
    const parent = dbSubgraphs.find(
      (candidate) => candidate.id !== subgraph.id && candidate.nodes.includes(subgraph.id),
    );
    return {
      id,
      label: subgraph.title?.trim() || id,
      nodeIds: subgraph.nodes.filter((nodeId) => vertexIds.has(nodeId)),
      parentId: parent ? subgraphIdByDbId.get(parent.id) : undefined,
    };
  });

  for (const line of normalizeLines(request.mermaid, true).slice(1)) {
    if (line.startsWith("linkStyle")) {
      warnings.push(`ignored_flowchart_directive: "${line}"`);
    }
  }

  let nodeLayouts: Map<string, NodeLayout>;
  const edgeLayouts = new Map<number, IntermediatePoint[]>();
  let geometry: import("./mermaid-geometry.js").FlowchartGeometry | undefined;
  try {
    const { renderFlowchartGeometry } = await import("./mermaid-geometry.js");
    geometry = await renderFlowchartGeometry(request.mermaid, {
      vertices: vertices.map((vertex) => ({ id: vertex.id, domId: vertex.domId })),
      edgeIds: edgeGeometryKeys,
    });
    if (geometry === undefined) {
      warnings.push("flowchart_geometry_unavailable: canvas text measurement is unavailable on this platform");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`flowchart_geometry_unavailable: ${message.split("\n")[0]}`);
  }

  if (geometry) {
    nodeLayouts = new Map(
      geometry.nodes.map((node) => [node.id, { x: node.x, y: node.y, width: node.width, height: node.height }]),
    );
    const pointsByEdgeId = new Map(geometry.edges.map((edge) => [edge.id, edge.points]));
    edgeGeometryKeys.forEach((key, index) => {
      const points = pointsByEdgeId.get(key);
      if (points) {
        edgeLayouts.set(index, points);
      }
    });
  } else {
    const layouts = computeFlowchartLayout(nodes, edges, subgraphs, direction);
    nodeLayouts = layouts.nodeLayouts;
    for (const [index, points] of layouts.edgeLayouts) {
      edgeLayouts.set(index, points);
    }
  }

  return {
    pageName: derivePageName(request.sourceName),
    diagramType: "flowchart",
    direction,
    nodes: nodes.map((node) => ({ ...node, ...nodeLayouts.get(node.id) })),
    edges: edges.map((edge, index) => ({
      ...edge,
      points: edgeLayouts.get(index),
    })),
    subgraphs,
    sequenceParticipants: [],
    sequenceMessages: [],
    sequenceNotes: [],
    sequenceActivations: [],
    sequenceFrames: [],
    warnings,
  };
}


interface GanttTaskData {
  id: string;
  task: string;
  section?: string;
  startTime: Date;
  endTime: Date;
  done?: boolean;
  crit?: boolean;
  active?: boolean;
  milestone?: boolean;
}

interface GanttDb {
  getTasks(): GanttTaskData[];
  getDiagramTitle(): string;
  getDateFormat(): string;
  getAxisFormat(): string;
}

interface XychartAxisData {
  type: "band" | "linear";
  title?: string;
  categories?: Array<string | number>;
  min?: number;
  max?: number;
}

interface XychartPlotData {
  type: string;
  data: Array<[string | number, number]>;
}

interface XychartDb {
  getDiagramTitle(): string;
  getXYChartData(): {
    xAxis?: XychartAxisData;
    yAxis?: XychartAxisData;
    plots?: XychartPlotData[];
  };
}

interface GanttScale {
  position(date: Date): number;
  formatLabel(index: number): string;
}

function formatTwoDigits(value: number): string {
  return `${value}`.padStart(2, "0");
}

function ganttTimeFraction(date: Date): number {
  const seconds =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
  return seconds / 86400;
}

function ganttLocalEpochDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / GANTT_DAY_MS);
}

function createGanttScale(dateFormat: string): GanttScale {
  // Month columns when the declared format references months but carries no
  // day or time tokens (e.g. "YYYY-MM"); everything else gets day columns.
  const monthScale = /M/.test(dateFormat) && !/[DdHhsSmxX]/.test(dateFormat.replace(/MM/g, ""));
  if (monthScale) {
    return {
      position(date: Date): number {
        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        return year * 12 + monthIndex + (date.getDate() - 1 + ganttTimeFraction(date)) / daysInMonth;
      },
      formatLabel(index: number): string {
        const year = Math.floor(index / 12);
        return `${year}-${formatTwoDigits((index % 12) + 1)}`;
      },
    };
  }

  return {
    position(date: Date): number {
      return ganttLocalEpochDay(date) + ganttTimeFraction(date);
    },
    formatLabel(index: number): string {
      const date = new Date(index * GANTT_DAY_MS);
      return `${date.getUTCFullYear()}-${formatTwoDigits(date.getUTCMonth() + 1)}-${formatTwoDigits(date.getUTCDate())}`;
    },
  };
}

function getGanttBarColors(tags: string[]): Pick<IntermediateNode, "fillColor" | "strokeColor" | "fontColor"> {
  if (tags.includes("crit")) {
    return {
      fillColor: "#f8cecc",
      strokeColor: "#b85450",
      fontColor: "#1f1f1f",
    };
  }

  if (tags.includes("done")) {
    return {
      fillColor: "#e0e0e0",
      strokeColor: "#9e9e9e",
      fontColor: "#1f1f1f",
    };
  }

  if (tags.includes("active")) {
    return {
      fillColor: "#d5e8d4",
      strokeColor: "#82b366",
      fontColor: "#1f1f1f",
    };
  }

  return {
    fillColor: "#dae8fc",
    strokeColor: "#6c8ebf",
    fontColor: "#1f1f1f",
  };
}

async function parseGanttDiagram(request: MermaidParseRequest): Promise<IntermediateDiagram> {
  const { mermaid } = await import("./mermaid-env.js");
  const warnings: string[] = [];

  let db: GanttDb;
  try {
    await mermaid.parse(request.mermaid);
    db = (await mermaid.mermaidAPI.getDiagramFromText(request.mermaid)).db as GanttDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse_error: ${message.split("\n")[0]}`);
  }

  const chartTitle = db.getDiagramTitle()?.trim() || undefined;
  const axisFormat = db.getAxisFormat()?.trim();
  if (axisFormat) {
    warnings.push(`ignored_gantt_directive: "axisFormat ${axisFormat}"`);
  }

  const dbTasks = db.getTasks();
  if (dbTasks.length === 0) {
    throw new Error("parse_error: gantt input contains no tasks");
  }

  const scale = createGanttScale(db.getDateFormat() ?? "");
  const sections: Array<{ label: string; tasks: ParsedGanttTask[] }> = [];
  for (const dbTask of dbTasks) {
    const sectionLabel = dbTask.section?.trim() || "Tasks";
    let section = sections.find((entry) => entry.label === sectionLabel);
    if (!section) {
      section = { label: sectionLabel, tasks: [] };
      sections.push(section);
    }

    const tags: string[] = [];
    if (dbTask.done) {
      tags.push("done");
    }
    if (dbTask.crit) {
      tags.push("crit");
    }
    if (dbTask.active) {
      tags.push("active");
    }
    if (dbTask.milestone) {
      tags.push("milestone");
    }

    const startPosition = scale.position(dbTask.startTime);
    const endPosition = scale.position(dbTask.endTime);
    if (endPosition < startPosition || (endPosition === startPosition && !dbTask.milestone)) {
      throw new Error(`parse_error: gantt task "${dbTask.task.trim()}" has a non-positive duration`);
    }

    section.tasks.push({
      id: dbTask.id,
      section: sectionLabel,
      title: dbTask.task.trim(),
      startPosition,
      endPosition,
      tags,
    });
  }

  const tasks = sections.flatMap((section) => section.tasks);

  const minPosition = Math.floor(Math.min(...tasks.map((task) => task.startPosition)));
  const maxPosition = Math.ceil(Math.max(...tasks.map((task) => task.endPosition)));
  const periodCount = Math.max(1, maxPosition - minPosition);
  const chartWidth = GANTT_LABEL_COLUMN_WIDTH + periodCount * GANTT_TIMELINE_COLUMN_WIDTH;

  const nodes: IntermediateNode[] = [];
  let currentY = 0;

  if (chartTitle) {
    nodes.push({
      id: "gantt-title",
      label: chartTitle,
      shape: "text",
      fontColor: "#1f1f1f",
      x: 0,
      y: currentY,
      width: chartWidth,
      height: GANTT_TITLE_HEIGHT,
    });
    currentY += GANTT_TITLE_HEIGHT + GANTT_ROW_GAP;
  }

  for (let offset = 0; offset < periodCount; offset += 1) {
    nodes.push({
      id: `gantt-period-${offset}`,
      label: scale.formatLabel(minPosition + offset),
      shape: "rectangle",
      fillColor: "#f5f5f5",
      strokeColor: "#d0d0d0",
      fontColor: "#333333",
      x: GANTT_LABEL_COLUMN_WIDTH + offset * GANTT_TIMELINE_COLUMN_WIDTH,
      y: currentY,
      width: GANTT_TIMELINE_COLUMN_WIDTH,
      height: GANTT_HEADER_HEIGHT,
    });
  }
  currentY += GANTT_HEADER_HEIGHT + GANTT_SECTION_GAP;

  let sectionSequence = 0;
  for (const section of sections) {
    sectionSequence += 1;
    nodes.push({
      id: `gantt-section-${sectionSequence}`,
      label: section.label,
      shape: "rectangle",
      fillColor: "#f7f7f7",
      strokeColor: "#c7c7c7",
      fontColor: "#333333",
      x: 0,
      y: currentY,
      width: chartWidth,
      height: GANTT_SECTION_HEIGHT,
    });
    currentY += GANTT_SECTION_HEIGHT + GANTT_ROW_GAP;

    for (const task of section.tasks) {
      const rowY = currentY;
      nodes.push({
        id: `gantt-task-label-${task.id}`,
        label: task.title,
        shape: "text",
        fontColor: "#333333",
        x: 0,
        y: rowY,
        width: GANTT_LABEL_COLUMN_WIDTH - 12,
        height: GANTT_TASK_ROW_HEIGHT,
      });

      const barX =
        GANTT_LABEL_COLUMN_WIDTH +
        Math.round((task.startPosition - minPosition) * GANTT_TIMELINE_COLUMN_WIDTH) +
        GANTT_BAR_HORIZONTAL_PADDING;
      const barWidth = Math.max(
        24,
        Math.round((task.endPosition - task.startPosition) * GANTT_TIMELINE_COLUMN_WIDTH) - 2 * GANTT_BAR_HORIZONTAL_PADDING,
      );

      nodes.push({
        id: `gantt-task-bar-${task.id}`,
        label: "",
        shape: task.tags.includes("milestone") ? "ellipse" : "rounded-rectangle",
        ...getGanttBarColors(task.tags),
        x: barX,
        y: rowY + GANTT_BAR_VERTICAL_PADDING,
        width: task.tags.includes("milestone") ? 24 : barWidth,
        height: task.tags.includes("milestone") ? 24 : GANTT_TASK_ROW_HEIGHT - 2 * GANTT_BAR_VERTICAL_PADDING,
      });

      currentY += GANTT_TASK_ROW_HEIGHT + GANTT_ROW_GAP;
    }

    currentY += GANTT_SECTION_GAP;
  }

  return {
    pageName: chartTitle ?? derivePageName(request.sourceName),
    diagramType: "gantt",
    nodes,
    edges: [],
    subgraphs: [],
    sequenceParticipants: [],
    sequenceMessages: [],
    sequenceNotes: [],
    sequenceActivations: [],
    sequenceFrames: [],
    warnings,
  };
}


function estimateTextWidth(text: string, minimum = 24): number {
  const lines = text.split(/\r\n|\r|\n/, -1);
  const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return Math.max(minimum, longestLineLength * 8 + 12);
}

function roundXychartValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function getXychartNiceInterval(min: number, max: number): number {
  const rawInterval = (max - min) / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const residual = rawInterval / magnitude;
  if (residual <= 1.5) {
    return magnitude;
  }
  if (residual <= 3) {
    return 2 * magnitude;
  }
  if (residual <= 7) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function formatXychartTick(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function buildXychartTicks(min: number, max: number): number[] {
  if (max <= min) {
    return [min];
  }

  const interval = getXychartNiceInterval(min, max);
  const ticks = [roundXychartValue(min)];
  let value = Math.ceil(min / interval) * interval;
  while (value < max) {
    const rounded = roundXychartValue(value);
    if (rounded > min && rounded < max) {
      ticks.push(rounded);
    }
    value += interval;
  }
  ticks.push(roundXychartValue(max));
  return Array.from(new Set(ticks)).sort((left, right) => left - right);
}

function getXychartSeriesColors(seriesIndex: number): Pick<IntermediateNode, "fillColor" | "strokeColor" | "fontColor"> {
  return XYCHART_SERIES_COLORS[seriesIndex % XYCHART_SERIES_COLORS.length];
}

function createXychartAnchorNode(id: string, x: number, y: number): IntermediateNode {
  return {
    id,
    label: "",
    shape: "text",
    x,
    y,
    width: 1,
    height: 1,
  };
}

async function parseXychartDiagram(request: MermaidParseRequest): Promise<IntermediateDiagram> {
  const { mermaid } = await import("./mermaid-env.js");

  let db: XychartDb;
  try {
    await mermaid.parse(request.mermaid);
    db = (await mermaid.mermaidAPI.getDiagramFromText(request.mermaid)).db as XychartDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse_error: ${message.split("\n")[0]}`);
  }

  const data = db.getXYChartData();
  const xAxis = data.xAxis;
  if (!xAxis || xAxis.type !== "band" || !xAxis.categories || xAxis.categories.length === 0) {
    throw new Error("unsupported_construct: xychart requires a categorical x-axis (numeric x-axis ranges are not supported)");
  }

  const title = db.getDiagramTitle()?.trim() || undefined;
  const xAxisLabel = xAxis.title?.trim() || undefined;
  const categories = xAxis.categories.map((category) => `${category}`.trim());

  const barSeries: number[][] = [];
  const lineSeries: number[][] = [];
  for (const plot of data.plots ?? []) {
    if (plot.type !== "bar" && plot.type !== "line") {
      continue;
    }
    const valuesByCategory = new Map(
      plot.data.map(([category, value]) => [`${category}`.trim(), Number(value)]),
    );
    const series = categories.map((category) => {
      const value = valuesByCategory.get(category);
      if (value === undefined || !Number.isFinite(value)) {
        throw new Error(`parse_error: ${plot.type} series is missing a value for category "${category}"`);
      }
      return value;
    });
    if (plot.type === "bar") {
      barSeries.push(series);
    } else {
      lineSeries.push(series);
    }
  }

  if (barSeries.length === 0 && lineSeries.length === 0) {
    throw new Error("parse_error: xychart requires at least one bar or line series");
  }

  const yAxisLabel = data.yAxis?.title?.trim() || undefined;
  let yMin = data.yAxis?.min;
  let yMax = data.yAxis?.max;
  if (yMin === undefined || yMax === undefined || !(yMax > yMin)) {
    const values = [...barSeries.flat(), ...lineSeries.flat()];
    yMin = Math.min(0, ...values);
    yMax = Math.max(...values);
    if (!(yMax > yMin)) {
      yMax = yMin + 1;
    }
  }

  for (const value of [...barSeries.flat(), ...lineSeries.flat()]) {
    if (value < yMin || value > yMax) {
      throw new Error(`parse_error: xychart value ${value} is outside the y-axis range`);
    }
  }

  const parsed: ParsedXychart = {
    title,
    xAxisLabel,
    yAxisLabel,
    categories,
    yMin,
    yMax,
    barSeries,
    lineSeries,
  };

  const yTicks = buildXychartTicks(parsed.yMin, parsed.yMax);
  const maxTickLabelWidth = Math.max(...yTicks.map((tick) => estimateTextWidth(formatXychartTick(tick), 32)));
  const plotX = maxTickLabelWidth + 16;
  const plotY =
    XYCHART_MARGIN_TOP +
    (parsed.title ? XYCHART_TITLE_HEIGHT : 0) +
    (parsed.yAxisLabel ? XYCHART_AXIS_LABEL_HEIGHT : 0);
  const bandWidth = XYCHART_CATEGORY_BAND_WIDTH;
  const plotWidth = bandWidth * parsed.categories.length;
  const plotHeight = XYCHART_PLOT_HEIGHT;
  const plotBottom = plotY + plotHeight;
  const totalWidth = plotX + plotWidth + XYCHART_MARGIN_RIGHT;
  const totalHeight =
    plotBottom +
    XYCHART_CATEGORY_LABEL_HEIGHT +
    (parsed.xAxisLabel ? XYCHART_AXIS_LABEL_HEIGHT : 0) +
    XYCHART_MARGIN_BOTTOM;
  const baselineValue = parsed.yMin <= 0 && parsed.yMax >= 0 ? 0 : parsed.yMin;
  const scaleY = (value: number): number =>
    plotBottom - ((value - parsed.yMin) / (parsed.yMax - parsed.yMin || 1)) * plotHeight;
  const baselineY = Math.round(scaleY(baselineValue));

  const nodes: IntermediateNode[] = [
    createXychartAnchorNode("xychart-axis-x-start", plotX, baselineY),
    createXychartAnchorNode("xychart-axis-x-end", plotX + plotWidth, baselineY),
    createXychartAnchorNode("xychart-axis-y-start", plotX, plotY),
    createXychartAnchorNode("xychart-axis-y-end", plotX, plotBottom),
  ];

  if (parsed.title) {
    nodes.push({
      id: "xychart-title",
      label: parsed.title,
      shape: "text",
      fontColor: "#1f1f1f",
      x: 0,
      y: 0,
      width: totalWidth,
      height: XYCHART_TITLE_HEIGHT,
    });
  }

  if (parsed.yAxisLabel) {
    nodes.push({
      id: "xychart-y-axis-label",
      label: parsed.yAxisLabel,
      shape: "text",
      fontColor: "#333333",
      x: 0,
      y: plotY - XYCHART_AXIS_LABEL_HEIGHT,
      width: plotX + 8,
      height: XYCHART_AXIS_LABEL_HEIGHT,
    });
  }

  yTicks.forEach((tick, index) => {
    nodes.push({
      id: `xychart-y-tick-${index}`,
      label: formatXychartTick(tick),
      shape: "text",
      fontColor: "#333333",
      x: 0,
      y: Math.round(scaleY(tick) - 10),
      width: maxTickLabelWidth,
      height: 20,
    });
  });

  parsed.categories.forEach((category, index) => {
    const bandLeft = plotX + index * bandWidth;
    nodes.push({
      id: `xychart-x-label-${index}`,
      label: category,
      shape: "text",
      fontColor: "#333333",
      x: bandLeft,
      y: plotBottom + 4,
      width: bandWidth,
      height: XYCHART_CATEGORY_LABEL_HEIGHT,
    });
  });

  if (parsed.xAxisLabel) {
    nodes.push({
      id: "xychart-x-axis-label",
      label: parsed.xAxisLabel,
      shape: "text",
      fontColor: "#333333",
      x: plotX,
      y: plotBottom + XYCHART_CATEGORY_LABEL_HEIGHT,
      width: plotWidth,
      height: XYCHART_AXIS_LABEL_HEIGHT,
    });
  }

  if (parsed.barSeries.length > 0) {
    const maxBarGroupWidth = Math.floor(bandWidth * XYCHART_BAR_GROUP_WIDTH_RATIO);
    const barWidth = Math.max(
      12,
      Math.min(
        XYCHART_BAR_MAX_WIDTH,
        Math.floor((maxBarGroupWidth - XYCHART_BAR_GAP * (parsed.barSeries.length - 1)) / parsed.barSeries.length),
      ),
    );
    const barGroupWidth = barWidth * parsed.barSeries.length + XYCHART_BAR_GAP * (parsed.barSeries.length - 1);

    parsed.barSeries.forEach((series, seriesIndex) => {
      const seriesColors = getXychartSeriesColors(seriesIndex);
      series.forEach((value, index) => {
        const bandLeft = plotX + index * bandWidth;
        const centerX = bandLeft + bandWidth / 2;
        const barLeft =
          centerX - barGroupWidth / 2 + seriesIndex * (barWidth + XYCHART_BAR_GAP);
        const valueY = Math.round(scaleY(value));
        nodes.push({
          id: `xychart-bar-${seriesIndex}-${index}`,
          label: "",
          shape: "rounded-rectangle",
          ...seriesColors,
          x: Math.round(barLeft),
          y: Math.min(valueY, baselineY),
          width: barWidth,
          height: Math.max(1, Math.abs(baselineY - valueY)),
        });
      });
    });
  }

  parsed.lineSeries.forEach((series, seriesIndex) => {
    const seriesColors = getXychartSeriesColors(seriesIndex);
    series.forEach((value, index) => {
      const bandLeft = plotX + index * bandWidth;
      const centerX = Math.round(bandLeft + bandWidth / 2);
      const centerY = Math.round(scaleY(value));
      nodes.push({
        id: `xychart-line-point-${seriesIndex}-${index}`,
        label: "",
        shape: "ellipse",
        fillColor: "#ffffff",
        strokeColor: seriesColors.strokeColor,
        fontColor: seriesColors.fontColor,
        x: centerX - Math.floor(XYCHART_LINE_MARKER_SIZE / 2),
        y: centerY - Math.floor(XYCHART_LINE_MARKER_SIZE / 2),
        width: XYCHART_LINE_MARKER_SIZE,
        height: XYCHART_LINE_MARKER_SIZE,
      });
    });
  });

  const edges: IntermediateEdge[] = [
    {
      sourceId: "xychart-axis-x-start",
      targetId: "xychart-axis-x-end",
      kind: "plain",
      points: [
        { x: plotX, y: baselineY },
        { x: plotX + plotWidth, y: baselineY },
      ],
    },
    {
      sourceId: "xychart-axis-y-start",
      targetId: "xychart-axis-y-end",
      kind: "plain",
      points: [
        { x: plotX, y: plotY },
        { x: plotX, y: plotBottom },
      ],
    },
  ];

  parsed.lineSeries.forEach((series, seriesIndex) => {
    for (let index = 0; index < series.length - 1; index += 1) {
      const sourceX = Math.round(plotX + index * bandWidth + bandWidth / 2);
      const sourceY = Math.round(scaleY(series[index]));
      const targetX = Math.round(plotX + (index + 1) * bandWidth + bandWidth / 2);
      const targetY = Math.round(scaleY(series[index + 1]));
      edges.push({
        sourceId: `xychart-line-point-${seriesIndex}-${index}`,
        targetId: `xychart-line-point-${seriesIndex}-${index + 1}`,
        kind: "plain",
        points: [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ],
      });
    }
  });

  return {
    pageName: parsed.title ?? derivePageName(request.sourceName),
    diagramType: "xychart",
    nodes,
    edges,
    subgraphs: [],
    sequenceParticipants: [],
    sequenceMessages: [],
    sequenceNotes: [],
    sequenceActivations: [],
    sequenceFrames: [],
    warnings: [],
  };
}

interface StateDbNode {
  id: string;
  label?: string;
  shape?: string;
  domId?: string;
  parentId?: string;
  isGroup?: boolean;
  cssClasses?: string;
  cssStyles?: string[];
}

interface StateDbEdge {
  id: string;
  start: string;
  end: string;
  label?: string;
}

interface StateDb {
  nodes?: StateDbNode[];
  edges?: StateDbEdge[];
  classes?: Map<string, FlowchartClassData>;
  getDirection(): string | undefined;
}

const STATE_BUILT_IN_CLASSES = new Set(["statediagram-state", "statediagram-cluster"]);
const STATE_NOTE_COLORS = {
  fillColor: "#fff3bf",
  strokeColor: "#f08c00",
  fontColor: "#333333",
} as const;
const STATE_PSEUDOSTATE_COLORS = {
  fillColor: "#333333",
  strokeColor: "#333333",
  fontColor: "#ffffff",
} as const;

function mapStateNodeId(id: string): string {
  if (id === "root_start") {
    return "__state_start__";
  }
  if (id === "root_end") {
    return "__state_end__";
  }
  return id;
}

function mapStateNode(dbNode: StateDbNode): IntermediateNode {
  const base: IntermediateNode = {
    id: mapStateNodeId(dbNode.id),
    label: "",
    shape: "rounded-rectangle",
  };
  if (dbNode.shape === "stateStart") {
    return { ...base, shape: "ellipse", label: dbNode.id === "root_start" ? "Start" : "" };
  }
  if (dbNode.shape === "stateEnd") {
    return { ...base, shape: "ellipse", label: dbNode.id === "root_end" ? "End" : "" };
  }
  if (dbNode.shape === "fork" || dbNode.shape === "join") {
    return { ...base, shape: "rectangle", ...STATE_PSEUDOSTATE_COLORS };
  }
  if (dbNode.shape === "choice") {
    return { ...base, shape: "rhombus", ...STATE_PSEUDOSTATE_COLORS };
  }
  return {
    ...base,
    label: normalizeFlowchartLabel(dbNode.label ?? dbNode.id),
  };
}

async function parseStateDiagram(request: MermaidParseRequest): Promise<IntermediateDiagram> {
  const { mermaid } = await import("./mermaid-env.js");
  const warnings: string[] = [];

  let db: StateDb;
  try {
    await mermaid.parse(request.mermaid);
    db = (await mermaid.mermaidAPI.getDiagramFromText(request.mermaid)).db as unknown as StateDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse_error: ${message.split("\n")[0]}`);
  }

  const rawDirection = db.getDirection();
  const direction: LayoutDirection =
    rawDirection === "LR" || rawDirection === "RL" ? rawDirection : "TD";

  const classStyles = new Map<string, MermaidClassStyle>();
  if (db.classes instanceof Map) {
    for (const [className, classDef] of db.classes) {
      if (className === "default") {
        continue;
      }
      classStyles.set(
        className,
        parseFlowchartStyles([...(classDef.styles ?? []), ...(classDef.textStyles ?? [])]),
      );
    }
  }

  const dbNodes = db.nodes ?? [];
  const dbEdges = db.edges ?? [];
  const noteDbIds = new Set(dbNodes.filter((node) => node.shape === "note").map((node) => node.id));
  const groupIds = new Set(
    dbNodes.filter((node) => node.isGroup && node.shape !== "noteGroup" && node.shape !== "note").map((node) => node.id),
  );

  const nodes: IntermediateNode[] = [];
  const subgraphs: IntermediateSubgraph[] = [];
  const noteIdByDbId = new Map<string, string>();
  const domIdByNodeId = new Map<string, string>();
  const parentByNodeId = new Map<string, string>();
  let noteSequence = 0;

  for (const dbNode of dbNodes) {
    if (dbNode.shape === "noteGroup") {
      continue;
    }
    if (dbNode.shape === "note") {
      noteSequence += 1;
      const noteId = `state-note-${noteSequence}`;
      noteIdByDbId.set(dbNode.id, noteId);
      nodes.push({
        id: noteId,
        label: (dbNode.label ?? "")
          .split("\n")
          .map((line) => line.trim())
          .join("\n")
          .trim(),
        shape: "rectangle",
        ...STATE_NOTE_COLORS,
      });
      if (dbNode.domId) {
        domIdByNodeId.set(noteId, dbNode.domId);
      }
      continue;
    }
    if (dbNode.isGroup) {
      subgraphs.push({
        id: dbNode.id,
        label: dbNode.shape === "divider" ? "" : (dbNode.label ?? dbNode.id).trim(),
        nodeIds: [],
        parentId: dbNode.parentId && groupIds.has(dbNode.parentId) ? dbNode.parentId : undefined,
      });
      continue;
    }

    let node = mapStateNode(dbNode);
    const userClasses = (dbNode.cssClasses ?? "")
      .split(/\s+/)
      .filter((className) => className && !STATE_BUILT_IN_CLASSES.has(className));
    node = applyClassStyles(node, userClasses, classStyles);
    const inlineStyle = parseFlowchartStyles(dbNode.cssStyles ?? []);
    if (inlineStyle.fillColor !== undefined) {
      node = { ...node, fillColor: inlineStyle.fillColor };
    }
    if (inlineStyle.strokeColor !== undefined) {
      node = { ...node, strokeColor: inlineStyle.strokeColor };
    }
    if (inlineStyle.fontColor !== undefined) {
      node = { ...node, fontColor: inlineStyle.fontColor };
    }
    nodes.push(node);
    if (dbNode.domId) {
      domIdByNodeId.set(node.id, dbNode.domId);
    }
    if (dbNode.parentId && groupIds.has(dbNode.parentId)) {
      parentByNodeId.set(node.id, dbNode.parentId);
    }
  }

  for (const subgraph of subgraphs) {
    for (const dbNode of dbNodes) {
      if (dbNode.parentId === subgraph.id && !dbNode.isGroup && dbNode.shape !== "noteGroup") {
        const modelId = dbNode.shape === "note" ? noteIdByDbId.get(dbNode.id) : mapStateNodeId(dbNode.id);
        if (modelId) {
          subgraph.nodeIds.push(modelId);
        }
      }
    }
  }

  const edges: IntermediateEdge[] = [];
  const edgeGeometryKeys: string[] = [];
  for (const dbEdge of dbEdges) {
    // Note edges link a note node to its state in either direction depending
    // on the note placement; the model keeps state -> note.
    const noteId = noteIdByDbId.get(dbEdge.start) ?? noteIdByDbId.get(dbEdge.end);
    if (noteId) {
      const stateDbId = noteIdByDbId.has(dbEdge.start) ? dbEdge.end : dbEdge.start;
      edges.push({
        sourceId: mapStateNodeId(stateDbId),
        targetId: noteId,
        kind: "plain",
      });
      continue;
    }
    edges.push({
      sourceId: mapStateNodeId(dbEdge.start),
      targetId: mapStateNodeId(dbEdge.end),
      label: normalizeFlowchartLabel(dbEdge.label ?? "").trim() || undefined,
      kind: "directed",
    });
    edgeGeometryKeys.push(dbEdge.id);
  }

  let nodeLayouts: Map<string, NodeLayout>;
  const edgeLayouts = new Map<number, IntermediatePoint[]>();
  let geometry: import("./mermaid-geometry.js").FlowchartGeometry | undefined;
  try {
    const { renderStateGeometry } = await import("./mermaid-geometry.js");
    geometry = await renderStateGeometry(request.mermaid, {
      vertices: nodes.map((node) => ({ id: node.id, domId: domIdByNodeId.get(node.id) })),
      edgeIds: edgeGeometryKeys,
    });
    if (geometry === undefined) {
      warnings.push("state_geometry_unavailable: canvas text measurement is unavailable on this platform");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`state_geometry_unavailable: ${message.split("\n")[0]}`);
  }

  if (geometry) {
    nodeLayouts = new Map(
      geometry.nodes.map((node) => [node.id, { x: node.x, y: node.y, width: node.width, height: node.height }]),
    );
    const pointsByEdgeId = new Map(geometry.edges.map((edge) => [edge.id, edge.points]));
    edgeGeometryKeys.forEach((key, index) => {
      const points = pointsByEdgeId.get(key);
      if (points) {
        edgeLayouts.set(index, points);
      }
    });
  } else {
    const layouts = computeFlowchartLayout(nodes, edges, subgraphs, direction);
    nodeLayouts = layouts.nodeLayouts;
    for (const [index, points] of layouts.edgeLayouts) {
      edgeLayouts.set(index, points);
    }
  }

  return {
    pageName: derivePageName(request.sourceName),
    diagramType: "state",
    direction,
    nodes: nodes.map((node) => ({ ...node, ...nodeLayouts.get(node.id) })),
    edges: edges.map((edge, index) => ({
      ...edge,
      points: edgeLayouts.get(index),
    })),
    subgraphs,
    sequenceParticipants: [],
    sequenceMessages: [],
    sequenceNotes: [],
    sequenceActivations: [],
    sequenceFrames: [],
    warnings,
  };
}

// Numeric LINETYPE values from Mermaid's sequence db: signals expose only
// numeric types, so the mapping is duplicated here.
const SEQUENCE_LTYPE = {
  note: 2,
  loopStart: 10,
  loopEnd: 11,
  altStart: 12,
  altElse: 13,
  altEnd: 14,
  optStart: 15,
  optEnd: 16,
  activeStart: 17,
  activeEnd: 18,
  parStart: 19,
  parAnd: 20,
  parEnd: 21,
  rectStart: 22,
  rectEnd: 23,
  autonumber: 26,
  criticalStart: 27,
  criticalOption: 28,
  criticalEnd: 29,
  breakStart: 30,
  breakEnd: 31,
} as const;

const SEQUENCE_MESSAGE_KIND_BY_TYPE: Record<number, SequenceMessageKind> = {
  0: "solid",
  1: "dotted",
  3: "solid-cross",
  4: "dotted-cross",
  5: "solid-open",
  6: "dotted-open",
  24: "solid-point",
  25: "dotted-point",
  33: "bidirectional-solid",
  34: "bidirectional-dotted",
};

const SEQUENCE_FRAME_KIND_BY_START_TYPE: Record<number, SequenceFrameKind> = {
  [SEQUENCE_LTYPE.loopStart]: "loop",
  [SEQUENCE_LTYPE.altStart]: "alt",
  [SEQUENCE_LTYPE.optStart]: "opt",
  [SEQUENCE_LTYPE.parStart]: "par",
  [SEQUENCE_LTYPE.criticalStart]: "critical",
  [SEQUENCE_LTYPE.breakStart]: "break",
};

const SEQUENCE_FRAME_DIVIDER_TYPES = new Set<number>([
  SEQUENCE_LTYPE.altElse,
  SEQUENCE_LTYPE.parAnd,
  SEQUENCE_LTYPE.criticalOption,
]);

const SEQUENCE_FRAME_END_TYPES = new Set<number>([
  SEQUENCE_LTYPE.loopEnd,
  SEQUENCE_LTYPE.altEnd,
  SEQUENCE_LTYPE.optEnd,
  SEQUENCE_LTYPE.parEnd,
  SEQUENCE_LTYPE.criticalEnd,
  SEQUENCE_LTYPE.breakEnd,
]);

const SEQUENCE_FRAME_FALLBACK_LABELS: Record<SequenceFrameKind, string> = {
  opt: "optional",
  loop: "loop",
  alt: "",
  par: "parallel",
  critical: "critical",
  break: "break",
};

const SEQUENCE_NOTE_PLACEMENTS: SequenceNotePlacement[] = ["leftOf", "rightOf", "over"];

interface SequenceSignal {
  from?: string;
  to?: string;
  message?: unknown;
  type: number;
  placement?: number;
}

interface SequenceActor {
  description?: string;
  type?: string;
}

interface SequenceBoxData {
  name?: string;
  fill?: string;
  actorKeys?: string[];
}

interface SequenceDb {
  getActors(): Map<string, SequenceActor>;
  getBoxes(): SequenceBoxData[];
  getCreatedActors(): Map<string, number>;
  getDestroyedActors(): Map<string, number>;
  getMessages(): SequenceSignal[];
}

function sequenceSignalLabel(message: unknown): string {
  return typeof message === "string" ? decodeSequenceEntities(message) : "";
}

function decodeSequenceEntities(text: string): string {
  // Mermaid's jison lexer encodes entity codes (e.g. `#59;` for `;`) before
  // parsing; decode like mermaid does at render time, then resolve the numeric
  // entities so draw.io labels carry the real characters.
  return text
    .replace(/ﬂ°°/g, "&#")
    .replace(/ﬂ°/g, "&")
    .replace(/¶ß/g, ";")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function requireSignalParticipant(signal: SequenceSignal, key: "from" | "to"): string {
  const participantId = signal[key];
  if (!participantId) {
    throw new Error(`parse_error: sequence signal of type ${signal.type} is missing "${key}"`);
  }
  return participantId;
}

async function parseSequence(request: MermaidParseRequest): Promise<IntermediateDiagram> {
  const { mermaid } = await import("./mermaid-env.js");

  let db: SequenceDb;
  try {
    // parse() registers the lazily loaded sequence diagram and validates syntax
    await mermaid.parse(request.mermaid);
    db = (await mermaid.mermaidAPI.getDiagramFromText(request.mermaid)).db as SequenceDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse_error: ${message.split("\n")[0]}`);
  }

  const participants: IntermediateSequenceParticipant[] = [];
  for (const [id, actor] of db.getActors()) {
    const participant: IntermediateSequenceParticipant = {
      id,
      label: actor.description ? decodeSequenceEntities(actor.description) : id,
    };
    if (actor.type === "actor") {
      participant.type = "actor";
    }
    participants.push(participant);
  }

  const boxes: IntermediateSequenceBox[] = db.getBoxes().map((box) => ({
    label: box.name ? decodeSequenceEntities(box.name) : "",
    fillColor: box.fill,
    participantIds: box.actorKeys ?? [],
  }));

  const warnings: string[] = [];
  const createdActors = db.getCreatedActors();
  if (createdActors.size > 0) {
    warnings.push(
      `ignored_sequence_create: ${Array.from(createdActors.keys()).join(", ")} rendered as regular participants`,
    );
  }
  const destroyedActors = db.getDestroyedActors();
  if (destroyedActors.size > 0) {
    warnings.push(
      `ignored_sequence_destroy: ${Array.from(destroyedActors.keys()).join(", ")} end markers are not rendered`,
    );
  }

  const messages: IntermediateSequenceMessage[] = [];
  const notes: IntermediateSequenceNote[] = [];
  const activations: IntermediateSequenceActivation[] = [];
  const frames: IntermediateSequenceFrame[] = [];
  const activationStackByParticipant = new Map<string, Array<{ startOrder: number; depth: number }>>();
  const frameStack: Array<{
    kind: SequenceFrameKind;
    label: string;
    startOrder: number;
    depth: number;
    participantIds: Set<string>;
    sections: IntermediateSequenceFrameSection[];
  }> = [];
  let order = 0;
  let sequenceNumbering: { next: number; step: number } | undefined;

  function markFrameParticipants(participantIds: Array<string | undefined>): void {
    for (const frame of frameStack) {
      for (const participantId of participantIds) {
        if (participantId) {
          frame.participantIds.add(participantId);
        }
      }
    }
  }

  function startActivation(participantId: string, startOrder: number): void {
    const stack = activationStackByParticipant.get(participantId) ?? [];
    stack.push({ startOrder, depth: stack.length });
    activationStackByParticipant.set(participantId, stack);
  }

  function stopActivation(participantId: string, endOrder: number): void {
    const stack = activationStackByParticipant.get(participantId);
    const activeSpan = stack?.pop();
    if (!activeSpan) {
      throw new Error(`parse_error: deactivate without matching activate for "${participantId}"`);
    }
    activations.push({
      participantId,
      startOrder: activeSpan.startOrder,
      endOrder: Math.max(activeSpan.startOrder, endOrder),
      depth: activeSpan.depth,
    });
  }

  for (const signal of db.getMessages()) {
    const frameKind = SEQUENCE_FRAME_KIND_BY_START_TYPE[signal.type];
    if (frameKind) {
      frameStack.push({
        kind: frameKind,
        label: sequenceSignalLabel(signal.message) || SEQUENCE_FRAME_FALLBACK_LABELS[frameKind],
        startOrder: order,
        depth: frameStack.length,
        participantIds: new Set<string>(),
        sections: [],
      });
      continue;
    }

    if (SEQUENCE_FRAME_DIVIDER_TYPES.has(signal.type)) {
      const frame = frameStack[frameStack.length - 1];
      if (!frame) {
        throw new Error("parse_error: frame divider without matching sequence frame");
      }
      frame.sections.push({ order, label: sequenceSignalLabel(signal.message) });
      continue;
    }

    if (SEQUENCE_FRAME_END_TYPES.has(signal.type)) {
      const frame = frameStack.pop();
      if (!frame) {
        throw new Error("parse_error: unexpected frame end without matching sequence frame");
      }
      frames.push({
        kind: frame.kind,
        label: frame.label,
        startOrder: frame.startOrder,
        endOrder: Math.max(frame.startOrder, Math.max(0, order - 1)),
        depth: frame.depth,
        participantIds: Array.from(frame.participantIds),
        sections: frame.sections.length > 0 ? frame.sections : undefined,
      });
      continue;
    }

    if (signal.type === SEQUENCE_LTYPE.rectStart) {
      warnings.push(`ignored_sequence_wrapper: "rect ${sequenceSignalLabel(signal.message)}"`);
      continue;
    }
    if (signal.type === SEQUENCE_LTYPE.rectEnd) {
      continue;
    }

    if (signal.type === SEQUENCE_LTYPE.autonumber) {
      const config = signal.message as { start?: number; step?: number; visible?: boolean } | undefined;
      sequenceNumbering = config?.visible === false
        ? undefined
        : { next: config?.start ?? 1, step: config?.step ?? 1 };
      continue;
    }

    if (signal.type === SEQUENCE_LTYPE.activeStart) {
      const participantId = requireSignalParticipant(signal, "from");
      markFrameParticipants([participantId]);
      startActivation(participantId, Math.max(0, order - 1));
      continue;
    }
    if (signal.type === SEQUENCE_LTYPE.activeEnd) {
      const participantId = requireSignalParticipant(signal, "from");
      markFrameParticipants([participantId]);
      stopActivation(participantId, Math.max(0, order - 1));
      continue;
    }

    if (signal.type === SEQUENCE_LTYPE.note) {
      const participantIds = [...new Set([signal.from, signal.to].filter((id): id is string => Boolean(id)))];
      markFrameParticipants(participantIds);
      notes.push({
        order,
        participantIds,
        label: sequenceSignalLabel(signal.message),
        placement: SEQUENCE_NOTE_PLACEMENTS[signal.placement ?? 2] ?? "over",
      });
      order += 1;
      continue;
    }

    const kind = SEQUENCE_MESSAGE_KIND_BY_TYPE[signal.type];
    if (!kind) {
      warnings.push(
        `unsupported_arrow_variant: message type ${signal.type} rendered as a solid arrow`,
      );
    }
    const message: IntermediateSequenceMessage = {
      order,
      sourceId: requireSignalParticipant(signal, "from"),
      targetId: requireSignalParticipant(signal, "to"),
      label: sequenceSignalLabel(signal.message),
      kind: kind ?? "solid",
    };
    markFrameParticipants([message.sourceId, message.targetId]);
    if (sequenceNumbering) {
      message.number = sequenceNumbering.next;
      sequenceNumbering.next += sequenceNumbering.step;
    }
    messages.push(message);
    order += 1;
  }

  if (frameStack.length > 0) {
    throw new Error("parse_error: unclosed sequence frame");
  }
  for (const [participantId, stack] of activationStackByParticipant.entries()) {
    for (const activeSpan of stack) {
      activations.push({
        participantId,
        startOrder: activeSpan.startOrder,
        endOrder: Math.max(activeSpan.startOrder, Math.max(0, order - 1)),
        depth: activeSpan.depth,
      });
      warnings.push(`unclosed_activation: "${participantId}" auto-closed at the end of the diagram`);
    }
  }

  let sequenceGeometry: import("./mermaid-geometry.js").SequenceGeometry | undefined;
  try {
    const { renderSequenceGeometry } = await import("./mermaid-geometry.js");
    sequenceGeometry = await renderSequenceGeometry(request.mermaid, {
      participants,
      messages,
      notes,
      frames,
      activations,
      boxes,
    });
    if (sequenceGeometry === undefined) {
      warnings.push("sequence_geometry_unavailable: canvas text measurement is unavailable on this platform");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`sequence_geometry_unavailable: ${message.split("\n")[0]}`);
  }

  return {
    pageName: derivePageName(request.sourceName),
    diagramType: "sequence",
    nodes: [],
    edges: [],
    subgraphs: [],
    sequenceParticipants: participants,
    sequenceMessages: messages,
    sequenceNotes: notes,
    sequenceActivations: activations,
    sequenceFrames: frames,
    sequenceBoxes: boxes,
    sequenceGeometry,
    warnings,
  };
}

export async function parseMermaid(request: MermaidParseRequest): Promise<IntermediateDiagram> {
  const rawLines = normalizeLines(request.mermaid);
  if (rawLines.length === 0) {
    throw new Error("parse_error: Mermaid input is empty");
  }

  const header = parseHeader(rawLines[0]);
  const lines = header.diagramType === "flowchart"
    ? normalizeLines(request.mermaid, true)
    : rawLines;
  if (lines.length === 0) {
    throw new Error("parse_error: Mermaid input is empty");
  }

  if (header.diagramType === "sequence") {
    return parseSequence(request);
  }
  if (header.diagramType === "state") {
    return parseStateDiagram(request);
  }
  if (header.diagramType === "gantt") {
    return parseGanttDiagram(request);
  }
  if (header.diagramType === "xychart") {
    return parseXychartDiagram(request);
  }

  return parseFlowchart(request, header.direction!);
}

export function serializeIntermediateDiagram(diagram: IntermediateDiagram): string {
  return JSON.stringify(diagram, null, 2);
}
