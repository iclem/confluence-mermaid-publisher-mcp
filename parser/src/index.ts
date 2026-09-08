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
  | "ellipse";

export type EdgeKind = "directed" | "dashed-directed" | "plain";
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
  warnings: string[];
}

const SUPPORTED_DIRECTIONS = new Set<LayoutDirection>(["TD", "TB", "LR", "RL"]);
const IGNORED_FLOWCHART_PREFIXES = ["style ", "linkStyle", "click ", "%%{"];
const EDGE_SEGMENT_PATTERN =
  /(-\.->|-->|---)(?:\|([\s\S]*?)\|)?|--\s*"([\s\S]*?)"\s*-->/g;
const NODE_PATTERN =
  /^(?<id>[A-Za-z_][A-Za-z0-9_-]*)(?:(?<terminal>\(\((?<terminalLabel>[\s\S]+)\)\))|(?<rounded>\((?<roundedLabel>[\s\S]+)\))|(?<decision>\{(?<decisionLabel>[\s\S]+)\})|(?<process>\[(?<processLabel>[\s\S]+)\]))?$/;
const STATE_TRANSITION_PATTERN =
  /^(?<source>\[\*\]|[A-Za-z_][A-Za-z0-9_-]*)\s*-->\s*(?<target>\[\*\]|[A-Za-z_][A-Za-z0-9_-]*)(?:\s*:\s*(?<label>[\s\S]+))?$/;
const STATE_NOTE_START_PATTERN = /^note\s+(?:left|right)\s+of\s+(?<target>\[\*\]|[A-Za-z_][A-Za-z0-9_-]*)$/i;
const GANTT_TITLE_PATTERN = /^title\s+(?<title>[\s\S]+)$/i;
const GANTT_DATE_FORMAT_PATTERN = /^dateFormat\s+(?<format>[\s\S]+)$/i;
const GANTT_AXIS_FORMAT_PATTERN = /^axisFormat\s+(?<format>[\s\S]+)$/i;
const GANTT_SECTION_PATTERN = /^section\s+(?<label>[\s\S]+)$/i;
const GANTT_PERIOD_PATTERN = /^(?<year>\d{4})-(?<prefix>[A-Za-z]+)(?<slot>\d+)$/;
const GANTT_MONTH_PATTERN = /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])$/;
const GANTT_DAY_PATTERN = /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])$/;
const GANTT_DURATION_PATTERN = /^(?<value>\d+(?:\.\d+)?)(?<unit>q|M|d|w)$/i;
const GANTT_REFERENCE_PATTERN = /^after\s+(?<ids>[A-Za-z0-9_\-\s]+)$/i;
const GANTT_UNTIL_PATTERN = /^until\s+(?<id>[A-Za-z0-9_-]+)$/i;
const GANTT_TAGS = new Set(["active", "done", "crit", "milestone"]);
const GANTT_SUPPORTED_DATE_FORMATS = new Set(["YYYY-QQ", "YYYY-MM", "YYYY-MM-DD"]);

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

interface GanttTimelineConfig {
  dateFormat: string;
  parseStart(rawValue: string): number | undefined;
  parseEnd(rawValue: string): number | undefined;
  parseDuration(rawValue: string, startPosition: number): number | undefined;
  formatLabel(index: number): string;
}

interface ParsedEdgeSegment {
  source: ParsedNodeToken;
  target: ParsedNodeToken;
  label?: string;
  kind: EdgeKind;
}

interface SubgraphParseResult {
  id: string;
  label: string;
}

interface MermaidClassStyle {
  fillColor?: string;
  strokeColor?: string;
  fontColor?: string;
}

interface ParsedNodeToken {
  node: IntermediateNode;
  classNames: string[];
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

function splitTopLevel(input: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let state = createScanState();

  for (const char of input) {
    if (char === separator && isTopLevel(state)) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
    state = advanceScanState(state, char);
  }

  result.push(current.trim());
  return result;
}

function containsTopLevelToken(input: string, token: string): boolean {
  let state = createScanState();

  for (let index = 0; index < input.length; index += 1) {
    if (isTopLevel(state) && input.startsWith(token, index)) {
      return true;
    }
    state = advanceScanState(state, input[index]);
  }

  return false;
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

function maybeIgnoreFlowchartLine(line: string, warnings: string[]): boolean {
  for (const prefix of IGNORED_FLOWCHART_PREFIXES) {
    if (line.startsWith(prefix)) {
      warnings.push(`ignored_flowchart_directive: "${line}"`);
      return true;
    }
  }
  return false;
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

function stripNodeClassSuffixes(value: string): string {
  return value.replace(/:::[A-Za-z_][A-Za-z0-9_-]*/g, "");
}

function extractNodeClassNames(value: string): string[] {
  return Array.from(value.matchAll(/:::([A-Za-z_][A-Za-z0-9_-]*)/g), (match) => match[1]);
}

function parseClassStyle(line: string): { className: string; style: MermaidClassStyle } | undefined {
  const match = /^classDef\s+([A-Za-z_][A-Za-z0-9_-]*)\s+(.+)$/.exec(line);
  if (!match) {
    return undefined;
  }

  const style: MermaidClassStyle = {};
  for (const declaration of splitStyleDeclarations(match[2])) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const rawKey = declaration.slice(0, separatorIndex);
    const rawValue = declaration.slice(separatorIndex + 1);
    if (!rawKey || !rawValue) {
      continue;
    }
    const key = rawKey.trim();
    const value = rawValue.trim();
    if (key === "fill") {
      style.fillColor = value;
    } else if (key === "stroke") {
      style.strokeColor = value;
    } else if (key === "color") {
      style.fontColor = value;
    }
  }

  return { className: match[1], style };
}

function splitStyleDeclarations(rawStyle: string): string[] {
  const declarations: string[] = [];
  let current = "";
  let parenthesesDepth = 0;

  for (const character of rawStyle) {
    if (character === "(") {
      parenthesesDepth += 1;
      current += character;
      continue;
    }

    if (character === ")") {
      parenthesesDepth = Math.max(0, parenthesesDepth - 1);
      current += character;
      continue;
    }

    if (character === "," && parenthesesDepth === 0) {
      if (current.trim()) {
        declarations.push(current.trim());
      }
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    declarations.push(current.trim());
  }

  return declarations;
}

function parseClassAssignment(line: string): { nodeIds: string[]; classNames: string[] } | undefined {
  const match = /^class\s+([A-Za-z0-9_,-\s]+)\s+([A-Za-z0-9_:\-\s]+)$/.exec(line);
  if (!match) {
    return undefined;
  }

  return {
    nodeIds: match[1].split(",").map((entry) => entry.trim()).filter(Boolean),
    classNames: match[2].split(/[,\s]+/).map((entry) => entry.trim()).filter(Boolean),
  };
}

function mergeClassNames(target: Map<string, string[]>, nodeId: string, classNames: string[]): void {
  if (classNames.length === 0) {
    return;
  }
  const existing = target.get(nodeId) ?? [];
  for (const className of classNames) {
    if (!existing.includes(className)) {
      existing.push(className);
    }
  }
  target.set(nodeId, existing);
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

function parseNodeToken(token: string): ParsedNodeToken {
  const classNames = extractNodeClassNames(token);
  const bareToken = stripNodeClassSuffixes(token).trim();
  const match = bareToken.match(NODE_PATTERN);
  if (!match?.groups) {
    throw new Error(`parse_error: cannot parse node token "${token}"`);
  }

  const id = match.groups.id;
  if (match.groups.terminal) {
    return {
      node: {
        id,
        label: normalizeLabel(match.groups.terminalLabel),
        shape: "ellipse",
      },
      classNames,
    };
  }
  if (match.groups.rounded) {
    return {
      node: {
        id,
        label: normalizeLabel(match.groups.roundedLabel),
        shape: "rounded-rectangle",
      },
      classNames,
    };
  }
  if (match.groups.decision) {
    return {
      node: {
        id,
        label: normalizeLabel(match.groups.decisionLabel),
        shape: "rhombus",
      },
      classNames,
    };
  }
  if (match.groups.process) {
    return {
      node: {
        id,
        label: normalizeLabel(match.groups.processLabel),
        shape: "rectangle",
      },
      classNames,
    };
  }

  return {
    node: { id, label: id, shape: "rectangle" },
    classNames,
  };
}

function parseNodeGroup(token: string): ParsedNodeToken[] {
  const groupTokens = splitTopLevel(token, "&").map((nodeToken) => nodeToken.trim());
  if (groupTokens.some((nodeToken) => nodeToken.length === 0)) {
    throw new Error(`parse_error: malformed node group "${token}"`);
  }

  return groupTokens.map(parseNodeToken);
}

function mergeNode(existing: IntermediateNode | undefined, incoming: IntermediateNode): IntermediateNode {
  if (!existing) {
    return incoming;
  }

  const existingSpecificity =
    (existing.label !== existing.id ? 1 : 0) +
    (existing.shape !== "rectangle" ? 1 : 0) +
    (existing.fillColor ? 1 : 0) +
    (existing.strokeColor ? 1 : 0) +
    (existing.fontColor ? 1 : 0) +
    (existing.x !== undefined ? 1 : 0);
  const incomingSpecificity =
    (incoming.label !== incoming.id ? 1 : 0) +
    (incoming.shape !== "rectangle" ? 1 : 0) +
    (incoming.fillColor ? 1 : 0) +
    (incoming.strokeColor ? 1 : 0) +
    (incoming.fontColor ? 1 : 0) +
    (incoming.x !== undefined ? 1 : 0);

  return incomingSpecificity >= existingSpecificity ? incoming : existing;
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

function computeFlowchartLayout(
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

  for (const [index, edge] of edges.entries()) {
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

function parseEdgeSegments(line: string): ParsedEdgeSegment[] {
  const matches = Array.from(line.matchAll(EDGE_SEGMENT_PATTERN));
  if (matches.length === 0) {
    return [];
  }

  const nodes: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? -1;
    if (index < cursor) {
      throw new Error(`parse_error: malformed edge expression "${line}"`);
    }
    nodes.push(line.slice(cursor, index).trim());
    cursor = index + match[0].length;
  }
  nodes.push(line.slice(cursor).trim());

  if (nodes.some((token) => token.length === 0)) {
    throw new Error(`parse_error: malformed edge expression "${line}"`);
  }

  const nodeGroups = nodes.map(parseNodeGroup);

  return matches.flatMap((match, index) => {
    const sources = nodeGroups[index];
    const targets = nodeGroups[index + 1];
    const label = normalizeLabel(match[2] ?? match[3] ?? "").trim() || undefined;
    const kind = match[1] === "---" ? "plain" : match[1] === "-.->" ? "dashed-directed" : "directed";

    return sources.flatMap((source) =>
      targets.map((target) => ({
        source,
        target,
        label,
        kind,
      })),
    );
  });
}

function parseSubgraphStart(line: string, sequence: number): SubgraphParseResult {
  const body = line.slice("subgraph".length).trim();
  if (body.length === 0) {
    throw new Error(`parse_error: malformed subgraph declaration "${line}"`);
  }

  return {
    id: `subgraph-${sequence}`,
    label: normalizeLabel(body),
  };
}

function parseFlowchart(
  request: MermaidParseRequest,
  lines: string[],
  direction: LayoutDirection,
): IntermediateDiagram {
  const nodeMap = new Map<string, IntermediateNode>();
  const classStyles = new Map<string, MermaidClassStyle>();
  const nodeClassNames = new Map<string, string[]>();
  const edges: IntermediateEdge[] = [];
  const subgraphs = new Map<
    string,
    { id: string; label: string; nodeIds: Set<string>; parentId?: string }
  >();
  const subgraphStack: string[] = [];
  const warnings: string[] = [];
  let subgraphSequence = 0;

  function attachNodeToCurrentSubgraph(nodeId: string): void {
    const currentSubgraphId = subgraphStack[subgraphStack.length - 1];
    if (!currentSubgraphId) {
      return;
    }
    subgraphs.get(currentSubgraphId)?.nodeIds.add(nodeId);
  }

  for (const line of lines.slice(1)) {
    const parsedClassStyle = parseClassStyle(line);
    if (parsedClassStyle) {
      classStyles.set(parsedClassStyle.className, parsedClassStyle.style);
      continue;
    }

    const parsedClassAssignment = parseClassAssignment(line);
    if (parsedClassAssignment) {
      for (const nodeId of parsedClassAssignment.nodeIds) {
        mergeClassNames(nodeClassNames, nodeId, parsedClassAssignment.classNames);
      }
      continue;
    }

    if (maybeIgnoreFlowchartLine(line, warnings)) {
      continue;
    }

    const normalizedLine = line;

    if (normalizedLine === "end") {
      if (subgraphStack.length === 0) {
        throw new Error('parse_error: unexpected "end" without matching subgraph');
      }
      subgraphStack.pop();
      continue;
    }

    if (normalizedLine.startsWith("subgraph ")) {
      subgraphSequence += 1;
      const subgraph = parseSubgraphStart(normalizedLine, subgraphSequence);
      subgraphs.set(subgraph.id, {
        id: subgraph.id,
        label: subgraph.label,
        nodeIds: new Set<string>(),
        parentId: subgraphStack[subgraphStack.length - 1],
      });
      subgraphStack.push(subgraph.id);
      continue;
    }

    const edgeSegments = parseEdgeSegments(normalizedLine);
    if (edgeSegments.length > 0) {
      for (const edgeSegment of edgeSegments) {
        nodeMap.set(
          edgeSegment.source.node.id,
          mergeNode(nodeMap.get(edgeSegment.source.node.id), edgeSegment.source.node),
        );
        nodeMap.set(
          edgeSegment.target.node.id,
          mergeNode(nodeMap.get(edgeSegment.target.node.id), edgeSegment.target.node),
        );
        mergeClassNames(nodeClassNames, edgeSegment.source.node.id, edgeSegment.source.classNames);
        mergeClassNames(nodeClassNames, edgeSegment.target.node.id, edgeSegment.target.classNames);
        attachNodeToCurrentSubgraph(edgeSegment.source.node.id);
        attachNodeToCurrentSubgraph(edgeSegment.target.node.id);
        edges.push({
          sourceId: edgeSegment.source.node.id,
          targetId: edgeSegment.target.node.id,
          label: edgeSegment.label,
          kind: edgeSegment.kind,
        });
      }
      continue;
    }

    const parsedNode = parseNodeToken(normalizedLine);
    nodeMap.set(parsedNode.node.id, mergeNode(nodeMap.get(parsedNode.node.id), parsedNode.node));
    mergeClassNames(nodeClassNames, parsedNode.node.id, parsedNode.classNames);
    attachNodeToCurrentSubgraph(parsedNode.node.id);
  }

  if (subgraphStack.length > 0) {
    throw new Error("parse_error: unclosed subgraph block");
  }

  const styledNodes = Array.from(nodeMap.values()).map((node) =>
    applyClassStyles(node, nodeClassNames.get(node.id) ?? [], classStyles),
  );
  const subgraphList = Array.from(subgraphs.values()).map((subgraph) => ({
    id: subgraph.id,
    label: subgraph.label,
    nodeIds: Array.from(subgraph.nodeIds),
    parentId: subgraph.parentId,
  }));
  const layouts = computeFlowchartLayout(styledNodes, edges, subgraphList, direction);

  return {
    pageName: derivePageName(request.sourceName),
    diagramType: "flowchart",
    direction,
    nodes: styledNodes.map((node) => ({ ...node, ...layouts.nodeLayouts.get(node.id) })),
    edges: edges.map((edge, index) => ({
      ...edge,
      points: layouts.edgeLayouts.get(index),
    })),
    subgraphs: subgraphList,
    sequenceParticipants: [],
    sequenceMessages: [],
    sequenceNotes: [],
    sequenceActivations: [],
    sequenceFrames: [],
    warnings,
  };
}

function createStateNode(token: string, role: "source" | "target"): IntermediateNode {
  if (token === "[*]") {
    return {
      id: role === "source" ? "__state_start__" : "__state_end__",
      label: role === "source" ? "Start" : "End",
      shape: "ellipse",
    };
  }

  return {
    id: token,
    label: token,
    shape: "rounded-rectangle",
  };
}

function parseGanttDuration(rawValue: string): { value: number; unit: string } | undefined {
  const match = rawValue.match(GANTT_DURATION_PATTERN);
  if (!match?.groups) {
    return undefined;
  }

  return {
    value: Number.parseFloat(match.groups.value),
    unit: match.groups.unit,
  };
}

function parseGanttPeriod(rawValue: string): { year: number; prefix: string; slot: number } | undefined {
  const match = rawValue.match(GANTT_PERIOD_PATTERN);
  if (!match?.groups) {
    return undefined;
  }

  return {
    year: Number.parseInt(match.groups.year, 10),
    prefix: match.groups.prefix,
    slot: Number.parseInt(match.groups.slot, 10),
  };
}

function parseGanttMonth(rawValue: string): { year: number; month: number } | undefined {
  const match = rawValue.match(GANTT_MONTH_PATTERN);
  if (!match?.groups) {
    return undefined;
  }

  return {
    year: Number.parseInt(match.groups.year, 10),
    month: Number.parseInt(match.groups.month, 10),
  };
}

function parseGanttDay(rawValue: string): { year: number; month: number; day: number } | undefined {
  const match = rawValue.match(GANTT_DAY_PATTERN);
  if (!match?.groups) {
    return undefined;
  }

  return {
    year: Number.parseInt(match.groups.year, 10),
    month: Number.parseInt(match.groups.month, 10),
    day: Number.parseInt(match.groups.day, 10),
  };
}

function formatTwoDigits(value: number): string {
  return `${value}`.padStart(2, "0");
}

function getUtcDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addUtcDays(parts: { year: number; month: number; day: number }, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addUtcMonths(parts: { year: number; month: number; day: number }, months: number): { year: number; month: number; day: number } {
  const zeroBasedMonth = parts.month - 1 + months;
  const year = parts.year + Math.floor(zeroBasedMonth / 12);
  const monthIndex = ((zeroBasedMonth % 12) + 12) % 12;
  const month = monthIndex + 1;

  return {
    year,
    month,
    day: Math.min(parts.day, getUtcDaysInMonth(year, month)),
  };
}

function fromEpochDay(epochDay: number): { year: number; month: number; day: number } {
  const date = new Date(epochDay * GANTT_DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function toEpochDay(parts: { year: number; month: number; day: number }): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / GANTT_DAY_MS);
}

function createGanttPeriodTimeline(taskLines: string[]): GanttTimelineConfig {
  const explicitPeriods = taskLines
    .flatMap((line) => line.split(","))
    .map((token) => token.trim())
    .map(parseGanttPeriod)
    .filter((period): period is { year: number; prefix: string; slot: number } => Boolean(period));
  const prefixes = new Set(explicitPeriods.map((period) => period.prefix.toUpperCase()));
  if (prefixes.size > 1) {
    throw new Error("unsupported_dialect: mixed named gantt periods are not supported in one chart");
  }

  const prefix = explicitPeriods[0]?.prefix ?? "Q";
  const periodsPerYear = explicitPeriods.length > 0 ? Math.max(...explicitPeriods.map((period) => period.slot)) : 4;

  const monthToQuarterPosition = (rawValue: string): number | undefined => {
    if (periodsPerYear !== 4) {
      return undefined;
    }
    const month = parseGanttMonth(rawValue);
    if (!month) {
      return undefined;
    }
    const zeroBasedMonth = month.month - 1;
    return month.year * 4 + Math.floor(zeroBasedMonth / 3) + (zeroBasedMonth % 3) / 3;
  };

  const dayToQuarterPosition = (rawValue: string): number | undefined => {
    if (periodsPerYear !== 4) {
      return undefined;
    }
    const day = parseGanttDay(rawValue);
    if (!day) {
      return undefined;
    }
    const zeroBasedMonth = day.month - 1;
    const daysInMonth = getUtcDaysInMonth(day.year, day.month);
    return day.year * 4 + Math.floor(zeroBasedMonth / 3) + ((zeroBasedMonth % 3) + (day.day - 1) / daysInMonth) / 3;
  };

  return {
    dateFormat: "YYYY-QQ",
    parseStart(rawValue: string): number | undefined {
      const period = parseGanttPeriod(rawValue);
      if (period) {
        if (period.prefix.toUpperCase() !== prefix.toUpperCase()) {
          return undefined;
        }
        return period.year * periodsPerYear + (period.slot - 1);
      }
      return monthToQuarterPosition(rawValue) ?? dayToQuarterPosition(rawValue);
    },
    parseEnd(rawValue: string): number | undefined {
      const period = parseGanttPeriod(rawValue);
      if (period) {
        if (period.prefix.toUpperCase() !== prefix.toUpperCase()) {
          return undefined;
        }
        return period.year * periodsPerYear + period.slot;
      }
      const monthStart = monthToQuarterPosition(rawValue);
      if (monthStart !== undefined) {
        const month = parseGanttMonth(rawValue)!;
        const nextMonth = month.month === 12
          ? { year: month.year + 1, month: 1 }
          : { year: month.year, month: month.month + 1 };
        return monthToQuarterPosition(`${nextMonth.year}-${formatTwoDigits(nextMonth.month)}`);
      }
      const day = parseGanttDay(rawValue);
      if (day) {
        const nextDay = addUtcDays(day, 1);
        return dayToQuarterPosition(`${nextDay.year}-${formatTwoDigits(nextDay.month)}-${formatTwoDigits(nextDay.day)}`);
      }
      return undefined;
    },
    parseDuration(rawValue: string): number | undefined {
      const duration = parseGanttDuration(rawValue);
      if (!duration || duration.unit.toLowerCase() !== "q") {
        return undefined;
      }
      return duration.value;
    },
    formatLabel(index: number): string {
      const year = Math.floor(index / periodsPerYear);
      const slot = (index % periodsPerYear) + 1;
      return `${year} ${prefix}${slot}`;
    },
  };
}

function createGanttMonthTimeline(): GanttTimelineConfig {
  return {
    dateFormat: "YYYY-MM",
    parseStart(rawValue: string): number | undefined {
      const month = parseGanttMonth(rawValue);
      if (month) {
        return month.year * 12 + (month.month - 1);
      }
      const day = parseGanttDay(rawValue);
      if (!day) {
        return undefined;
      }
      return day.year * 12 + (day.month - 1) + (day.day - 1) / getUtcDaysInMonth(day.year, day.month);
    },
    parseEnd(rawValue: string): number | undefined {
      const month = parseGanttMonth(rawValue);
      if (month) {
        return month.year * 12 + month.month;
      }
      const day = parseGanttDay(rawValue);
      if (!day) {
        return undefined;
      }
      const nextDay = addUtcDays(day, 1);
      return nextDay.year * 12 + (nextDay.month - 1) + (nextDay.day - 1) / getUtcDaysInMonth(nextDay.year, nextDay.month);
    },
    parseDuration(rawValue: string): number | undefined {
      const duration = parseGanttDuration(rawValue);
      if (!duration) {
        return undefined;
      }
      if (duration.unit === "M") {
        return duration.value;
      }
      if (duration.unit.toLowerCase() === "q") {
        return duration.value * 3;
      }
      return undefined;
    },
    formatLabel(index: number): string {
      const year = Math.floor(index / 12);
      const month = (index % 12) + 1;
      return `${year}-${formatTwoDigits(month)}`;
    },
  };
}

function createGanttDayTimeline(): GanttTimelineConfig {
  return {
    dateFormat: "YYYY-MM-DD",
    parseStart(rawValue: string): number | undefined {
      const day = parseGanttDay(rawValue);
      return day ? toEpochDay(day) : undefined;
    },
    parseEnd(rawValue: string): number | undefined {
      const day = parseGanttDay(rawValue);
      return day ? toEpochDay(day) + 1 : undefined;
    },
    parseDuration(rawValue: string, startPosition: number): number | undefined {
      const duration = parseGanttDuration(rawValue);
      if (!duration) {
        return undefined;
      }
      if (duration.unit.toLowerCase() === "d") {
        return duration.value;
      }
      if (duration.unit.toLowerCase() === "w") {
        return duration.value * 7;
      }
      if (duration.unit === "M") {
        const startDay = fromEpochDay(startPosition);
        return toEpochDay(addUtcMonths(startDay, duration.value)) - startPosition;
      }
      return undefined;
    },
    formatLabel(index: number): string {
      const date = new Date(index * GANTT_DAY_MS);
      return `${date.getUTCFullYear()}-${formatTwoDigits(date.getUTCMonth() + 1)}-${formatTwoDigits(date.getUTCDate())}`;
    },
  };
}

function createGanttTimelineConfig(dateFormat: string, taskLines: string[]): GanttTimelineConfig {
  if (!GANTT_SUPPORTED_DATE_FORMATS.has(dateFormat)) {
    throw new Error(`unsupported_dialect: unsupported gantt dateFormat "${dateFormat}"`);
  }
  if (dateFormat === "YYYY-QQ") {
    return createGanttPeriodTimeline(taskLines);
  }
  if (dateFormat === "YYYY-MM") {
    return createGanttMonthTimeline();
  }
  return createGanttDayTimeline();
}

function resolveGanttTaskStart(
  rawValue: string | undefined,
  previousEndQuarter: number | undefined,
  tasksById: Map<string, ParsedGanttTask>,
  timeline: GanttTimelineConfig,
): number {
  if (!rawValue) {
    if (previousEndQuarter === undefined) {
      throw new Error("parse_error: gantt task is missing a start date");
    }
    return previousEndQuarter;
  }

  const directQuarter = timeline.parseStart(rawValue);
  if (directQuarter !== undefined) {
    return directQuarter;
  }

  const referenceMatch = rawValue.match(GANTT_REFERENCE_PATTERN);
  if (referenceMatch?.groups?.ids) {
    const references = referenceMatch.groups.ids.split(/\s+/).map((entry) => entry.trim()).filter(Boolean);
    if (references.length === 0) {
      throw new Error(`parse_error: malformed gantt reference "${rawValue}"`);
    }
    const referencedTasks = references.map((reference) => tasksById.get(reference));
    if (referencedTasks.some((task) => !task)) {
      throw new Error(`parse_error: unknown gantt reference "${rawValue}"`);
    }
    return Math.max(...referencedTasks.map((task) => task!.endPosition));
  }

  throw new Error(`unsupported_construct: "${rawValue}"`);
}

function resolveGanttTaskEnd(
  startQuarter: number,
  rawValue: string | undefined,
  tasksById: Map<string, ParsedGanttTask>,
  previousEndQuarter: number | undefined,
  timeline: GanttTimelineConfig,
): number {
  if (!rawValue) {
    if (previousEndQuarter === undefined) {
      throw new Error("parse_error: gantt task is missing an end or duration");
    }
    return previousEndQuarter;
  }

  const duration = timeline.parseDuration(rawValue, startQuarter);
  if (duration !== undefined) {
    return startQuarter + duration;
  }

  const directQuarter = timeline.parseEnd(rawValue);
  if (directQuarter !== undefined) {
    return directQuarter;
  }

  const untilMatch = rawValue.match(GANTT_UNTIL_PATTERN);
  if (untilMatch?.groups?.id) {
    const targetTask = tasksById.get(untilMatch.groups.id);
    if (!targetTask) {
      throw new Error(`parse_error: unknown gantt reference "${rawValue}"`);
    }
    return targetTask.startPosition;
  }

  throw new Error(`unsupported_construct: "${rawValue}"`);
}

function parseGanttTask(
  line: string,
  currentSection: string,
  taskSequence: number,
  previousEndQuarter: number | undefined,
  tasksById: Map<string, ParsedGanttTask>,
  timeline: GanttTimelineConfig,
): ParsedGanttTask {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    throw new Error(`unsupported_construct: "${line}"`);
  }

  const title = normalizeLabel(line.slice(0, separatorIndex));
  const metadata = line
    .slice(separatorIndex + 1)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const tags: string[] = [];
  while (metadata.length > 0 && GANTT_TAGS.has(metadata[0])) {
    tags.push(metadata.shift()!);
  }

  let id = `gantt-task-${taskSequence}`;
  if (metadata.length >= 3) {
    id = metadata.shift()!;
  }

  if (metadata.length < 2) {
    throw new Error(`unsupported_construct: "${line}"`);
  }

  const startQuarter = resolveGanttTaskStart(metadata[0], previousEndQuarter, tasksById, timeline);
  const endQuarter = resolveGanttTaskEnd(startQuarter, metadata[1], tasksById, previousEndQuarter, timeline);
  const isMilestone = tags.includes("milestone");
  if (endQuarter < startQuarter || (endQuarter === startQuarter && !isMilestone)) {
    throw new Error(`parse_error: gantt task "${title}" has a non-positive duration`);
  }

  return {
    id,
    section: currentSection,
    title,
    startPosition: startQuarter,
    endPosition: endQuarter,
    tags,
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

function parseGanttDiagram(request: MermaidParseRequest, lines: string[]): IntermediateDiagram {
  const warnings: string[] = [];
  const sections: Array<{ label: string; tasks: ParsedGanttTask[] }> = [];
  const rawTasks: Array<{ line: string; section: string }> = [];
  const tasksById = new Map<string, ParsedGanttTask>();
  let chartTitle: string | undefined;
  let currentSection = "Tasks";
  let taskSequence = 0;
  let previousEndQuarter: number | undefined;
  let dateFormat = "YYYY-QQ";

  for (const line of lines.slice(1)) {
    const titleMatch = line.match(GANTT_TITLE_PATTERN);
    if (titleMatch?.groups?.title) {
      chartTitle = normalizeLabel(titleMatch.groups.title);
      continue;
    }

    const dateFormatMatch = line.match(GANTT_DATE_FORMAT_PATTERN);
    if (dateFormatMatch?.groups?.format) {
      dateFormat = dateFormatMatch.groups.format.trim();
      continue;
    }

    const axisFormatMatch = line.match(GANTT_AXIS_FORMAT_PATTERN);
    if (axisFormatMatch?.groups?.format) {
      warnings.push(`ignored_gantt_directive: "${line}"`);
      continue;
    }

    const sectionMatch = line.match(GANTT_SECTION_PATTERN);
    if (sectionMatch?.groups?.label) {
      currentSection = normalizeLabel(sectionMatch.groups.label);
      sections.push({ label: currentSection, tasks: [] });
      continue;
    }

    rawTasks.push({ line, section: currentSection });
  }

  const timeline = createGanttTimelineConfig(dateFormat, rawTasks.map((task) => task.line));
  for (const rawTask of rawTasks) {
    taskSequence += 1;
    if (!sections.some((section) => section.label === rawTask.section)) {
      sections.push({ label: rawTask.section, tasks: [] });
    }
    const task = parseGanttTask(rawTask.line, rawTask.section, taskSequence, previousEndQuarter, tasksById, timeline);
    tasksById.set(task.id, task);
    sections.find((section) => section.label === rawTask.section)!.tasks.push(task);
    previousEndQuarter = task.endPosition;
  }

  const tasks = sections.flatMap((section) => section.tasks);
  if (tasks.length === 0) {
    throw new Error("parse_error: gantt input contains no tasks");
  }

  const minQuarter = Math.floor(Math.min(...tasks.map((task) => task.startPosition)));
  const maxQuarter = Math.ceil(Math.max(...tasks.map((task) => task.endPosition)));
  const quarterCount = Math.max(1, maxQuarter - minQuarter);
  const chartWidth = GANTT_LABEL_COLUMN_WIDTH + quarterCount * GANTT_TIMELINE_COLUMN_WIDTH;

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

  for (let offset = 0; offset < quarterCount; offset += 1) {
    nodes.push({
      id: `gantt-quarter-${offset}`,
      label: timeline.formatLabel(minQuarter + offset),
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
        Math.round((task.startPosition - minQuarter) * GANTT_TIMELINE_COLUMN_WIDTH) +
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

function parseXychartStringArray(rawValue: string, line: string): string[] {
  const values = splitTopLevel(rawValue, ",").map((entry) => normalizeLabel(entry).trim());
  if (values.length === 0 || values.some((value) => value.length === 0)) {
    throw new Error(`parse_error: malformed x-axis "${line}"`);
  }
  return values;
}

function parseXychartNumberArray(rawValue: string, line: string): number[] {
  const values = splitTopLevel(rawValue, ",").map((entry) => entry.trim());
  if (values.length === 0 || values.some((value) => value.length === 0)) {
    throw new Error(`parse_error: malformed series "${line}"`);
  }

  return values.map((value) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`parse_error: malformed series "${line}"`);
    }
    return parsed;
  });
}

function parseXychartXAxis(line: string): { label?: string; categories: string[] } {
  const body = line.slice("x-axis".length).trim();
  if (containsTopLevelToken(body, "-->")) {
    throw new Error(`unsupported_construct: "${line}"`);
  }

  const bracketStart = body.indexOf("[");
  const bracketEnd = body.lastIndexOf("]");
  if (bracketStart === -1 || bracketEnd !== body.length - 1 || bracketEnd <= bracketStart) {
    throw new Error(`parse_error: malformed x-axis "${line}"`);
  }

  const rawLabel = body.slice(0, bracketStart).trim();
  return {
    label: rawLabel ? normalizeLabel(rawLabel) : undefined,
    categories: parseXychartStringArray(body.slice(bracketStart + 1, bracketEnd), line),
  };
}

function parseXychartYAxis(line: string): { label?: string; min: number; max: number } {
  const body = line.slice("y-axis".length).trim();
  const match = /^(?:(?<label>.+?)\s+)?(?<min>-?\d+(?:\.\d+)?)\s*-->\s*(?<max>-?\d+(?:\.\d+)?)$/.exec(body);
  if (!match?.groups) {
    throw new Error(`parse_error: malformed y-axis "${line}"`);
  }

  const min = Number.parseFloat(match.groups.min);
  const max = Number.parseFloat(match.groups.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new Error(`parse_error: malformed y-axis "${line}"`);
  }

  return {
    label: match.groups.label ? normalizeLabel(match.groups.label) : undefined,
    min,
    max,
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

function parseXychartDiagram(request: MermaidParseRequest, lines: string[]): IntermediateDiagram {
  let title: string | undefined;
  let xAxisLabel: string | undefined;
  let categories: string[] | undefined;
  let yAxisLabel: string | undefined;
  let yMin: number | undefined;
  let yMax: number | undefined;
  const barSeries: number[][] = [];
  const lineSeries: number[][] = [];

  for (const line of lines.slice(1)) {
    if (line.startsWith("title ")) {
      if (title !== undefined) {
        throw new Error(`parse_error: duplicate directive "${line}"`);
      }
      title = normalizeLabel(line.slice("title".length).trim());
      continue;
    }

    if (line.startsWith("x-axis ")) {
      if (categories !== undefined) {
        throw new Error(`parse_error: duplicate directive "${line}"`);
      }
      const xAxis = parseXychartXAxis(line);
      xAxisLabel = xAxis.label;
      categories = xAxis.categories;
      continue;
    }

    if (line.startsWith("y-axis ")) {
      if (yMin !== undefined || yMax !== undefined) {
        throw new Error(`parse_error: duplicate directive "${line}"`);
      }
      const yAxis = parseXychartYAxis(line);
      yAxisLabel = yAxis.label;
      yMin = yAxis.min;
      yMax = yAxis.max;
      continue;
    }

    const barMatch = /^bar\s+\[(?<values>[\s\S]+)\]$/i.exec(line);
    if (barMatch?.groups?.values) {
      barSeries.push(parseXychartNumberArray(barMatch.groups.values, line));
      continue;
    }

    const lineMatch = /^line\s+\[(?<values>[\s\S]+)\]$/i.exec(line);
    if (lineMatch?.groups?.values) {
      lineSeries.push(parseXychartNumberArray(lineMatch.groups.values, line));
      continue;
    }

    throw new Error(`unsupported_construct: "${line}"`);
  }

  if (!categories) {
    throw new Error('parse_error: xychart is missing categorical x-axis labels');
  }
  if (yMin === undefined || yMax === undefined) {
    throw new Error("parse_error: xychart is missing a ranged y-axis");
  }
  if (barSeries.length === 0 && lineSeries.length === 0) {
    throw new Error("parse_error: xychart requires at least one bar or line series");
  }
  if (barSeries.some((series) => series.length !== categories.length)) {
    throw new Error("parse_error: bar series length must match x-axis category count");
  }
  if (lineSeries.some((series) => series.length !== categories.length)) {
    throw new Error("parse_error: line series length must match x-axis category count");
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

function parseStateDirection(line: string): LayoutDirection | undefined {
  const match = /^direction\s+(TD|TB|LR|RL)$/i.exec(line);
  if (!match) {
    return undefined;
  }

  return match[1].toUpperCase() as LayoutDirection;
}

function parseStateDiagram(request: MermaidParseRequest, lines: string[]): IntermediateDiagram {
  const nodeMap = new Map<string, IntermediateNode>();
  const edges: IntermediateEdge[] = [];
  const warnings: string[] = [];
  let direction: LayoutDirection = "TD";
  let pendingNoteTarget: string | undefined;
  let pendingNoteLines: string[] = [];
  let noteSequence = 0;

  const upsertNode = (node: IntermediateNode): void => {
    nodeMap.set(node.id, mergeNode(nodeMap.get(node.id), node));
  };

  const flushNote = (): void => {
    if (!pendingNoteTarget) {
      return;
    }
    noteSequence += 1;
    const noteId = `state-note-${noteSequence}`;
    upsertNode({
      id: noteId,
      label: pendingNoteLines.join("\n").trim(),
      shape: "rectangle",
      fillColor: "#fff3bf",
      strokeColor: "#f08c00",
      fontColor: "#333333",
    });
    edges.push({
      sourceId: pendingNoteTarget,
      targetId: noteId,
      kind: "plain",
    });
    pendingNoteTarget = undefined;
    pendingNoteLines = [];
  };

  for (const line of lines.slice(1)) {
    if (pendingNoteTarget) {
      if (line.toLowerCase() === "end note") {
        flushNote();
      } else {
        pendingNoteLines.push(line.trim());
      }
      continue;
    }

    const parsedDirection = parseStateDirection(line);
    if (parsedDirection) {
      direction = parsedDirection;
      continue;
    }

    const noteMatch = line.match(STATE_NOTE_START_PATTERN);
    if (noteMatch?.groups?.target) {
      const targetNode = createStateNode(noteMatch.groups.target, "source");
      upsertNode(targetNode);
      pendingNoteTarget = targetNode.id;
      pendingNoteLines = [];
      continue;
    }

    const transitionMatch = line.match(STATE_TRANSITION_PATTERN);
    if (transitionMatch?.groups) {
      const sourceNode = createStateNode(transitionMatch.groups.source, "source");
      const targetNode = createStateNode(transitionMatch.groups.target, "target");
      upsertNode(sourceNode);
      upsertNode(targetNode);
      edges.push({
        sourceId: sourceNode.id,
        targetId: targetNode.id,
        label: transitionMatch.groups.label ? normalizeLabel(transitionMatch.groups.label) : undefined,
        kind: "directed",
      });
      continue;
    }

    throw new Error(`unsupported_construct: "${line}"`);
  }

  if (pendingNoteTarget) {
    throw new Error("parse_error: unclosed state note");
  }

  const nodes = Array.from(nodeMap.values());
  const layouts = computeFlowchartLayout(nodes, edges, [], direction);

  return {
    pageName: derivePageName(request.sourceName),
    diagramType: "state",
    direction,
    nodes: nodes.map((node) => ({ ...node, ...layouts.nodeLayouts.get(node.id) })),
    edges: edges.map((edge, index) => ({
      ...edge,
      points: layouts.edgeLayouts.get(index),
    })),
    subgraphs: [],
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
  return typeof message === "string" ? message : "";
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
      label: actor.description || id,
    };
    if (actor.type === "actor") {
      participant.type = "actor";
    }
    participants.push(participant);
  }

  const boxes: IntermediateSequenceBox[] = db.getBoxes().map((box) => ({
    label: box.name ?? "",
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
    return parseStateDiagram(request, lines);
  }
  if (header.diagramType === "gantt") {
    return parseGanttDiagram(request, lines);
  }
  if (header.diagramType === "xychart") {
    return parseXychartDiagram(request, lines);
  }

  return parseFlowchart(request, lines, header.direction!);
}

export function serializeIntermediateDiagram(diagram: IntermediateDiagram): string {
  return JSON.stringify(diagram, null, 2);
}
