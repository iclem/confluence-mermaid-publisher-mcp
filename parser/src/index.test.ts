import { describe, expect, it } from "vitest";

import { computeFlowchartLayout, parseMermaid } from "./index.js";

function stripLayout<T extends { x?: number; y?: number; width?: number; height?: number }>(node: T) {
  const { x: _x, y: _y, width: _width, height: _height, ...rest } = node;
  return rest;
}

function stripEdgePoints<T extends { points?: unknown }>(edge: T) {
  const { points: _points, ...rest } = edge;
  return rest;
}

describe("parseMermaid", () => {
  it("parses supported flowchart syntax into the intermediate model", async () => {
    const diagram = await parseMermaid({
      sourceName: "sample.mermaid",
      mermaid: `
        flowchart LR
        A[Start] -->|yes| B{Decision}
        B --- C((Done))
      `,
    });

    expect(diagram.pageName).toBe("sample");
    expect(diagram.diagramType).toBe("flowchart");
    expect(diagram.direction).toBe("LR");
    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "A", label: "Start", shape: "rectangle" },
      { id: "B", label: "Decision", shape: "rhombus" },
      { id: "C", label: "Done", shape: "ellipse" },
    ]);
    for (const node of diagram.nodes) {
      expect(node.x).toBeTypeOf("number");
      expect(node.y).toBeTypeOf("number");
      expect(node.width).toBeTypeOf("number");
      expect(node.height).toBeTypeOf("number");
    }
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: "yes", kind: "directed" },
      { sourceId: "B", targetId: "C", label: undefined, kind: "plain" },
    ]);
    for (const edge of diagram.edges) {
      expect(edge.points?.length ?? 0).toBeGreaterThan(1);
    }
    expect(diagram.subgraphs).toEqual([]);
  });

  it("creates implicit rectangle nodes from bare identifiers", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        graph TD
        Alpha --> Beta
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "Alpha", label: "Alpha", shape: "rectangle" },
      { id: "Beta", label: "Beta", shape: "rectangle" },
    ]);
  });

  it("preserves class-based node colors from classDef directives and suffixes", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        classDef danger fill:#ffdddd,stroke:#ff0000,color:#330000
        A[Start]:::danger --> B{Decision}:::danger
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      {
        id: "A",
        label: "Start",
        shape: "rectangle",
        fillColor: "#ffdddd",
        strokeColor: "#ff0000",
        fontColor: "#330000",
      },
      {
        id: "B",
        label: "Decision",
        shape: "rhombus",
        fillColor: "#ffdddd",
        strokeColor: "#ff0000",
        fontColor: "#330000",
      },
    ]);
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: undefined, kind: "directed" },
    ]);
    expect(diagram.warnings).toEqual([]);
  });

  it("rejects classDef declarations that mermaid itself cannot parse (rgb functions)", async () => {
    // Mermaid's own parser (used by stock draw.io) rejects rgb()/rgba() values
    // in classDef declarations; we inherit that behavior for parity.
    await expect(
      parseMermaid({
        mermaid: `
          flowchart TD
          classDef themed fill:rgb(230, 240, 255),stroke:rgba(25, 113, 194, 0.8),color:rgb(10, 20, 30)
          A[Start]:::themed --> B[Finish]:::themed
        `,
      }),
    ).rejects.toThrow(/parse_error/);
  });

  it("supports the full flowchart node shape set", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        A[square] --> B(round) --> C([stadium]) --> D[[subroutine]] --> E[(cylinder)]
        E --> F((circle)) --> G(((double))) --> H{diamond} --> I{{hexagon}} --> J>odd]
        J --> K[/para/] --> L[\\para-alt\\] --> M[/trap\\] --> N[\\trap-alt/]
        N --> O@{ shape: circ }
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "A", label: "square", shape: "rectangle" },
      { id: "B", label: "round", shape: "rounded-rectangle" },
      { id: "C", label: "stadium", shape: "stadium" },
      { id: "D", label: "subroutine", shape: "subroutine" },
      { id: "E", label: "cylinder", shape: "cylinder" },
      { id: "F", label: "circle", shape: "ellipse" },
      { id: "G", label: "double", shape: "double-circle" },
      { id: "H", label: "diamond", shape: "rhombus" },
      { id: "I", label: "hexagon", shape: "hexagon" },
      { id: "J", label: "odd", shape: "odd" },
      { id: "K", label: "para", shape: "parallelogram" },
      { id: "L", label: "para-alt", shape: "parallelogram-alt" },
      { id: "M", label: "trap", shape: "trapezoid" },
      { id: "N", label: "trap-alt", shape: "trapezoid-alt" },
      { id: "O", label: "O", shape: "ellipse" },
    ]);
  });

  it("supports thick, open, invisible, and bidirectional flowchart edges", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        A ==> B
        B --- C
        C -.- D
        D ~~~ E
        E <--> F
        G --o H
      `,
    });

    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: undefined, kind: "thick-directed" },
      { sourceId: "B", targetId: "C", label: undefined, kind: "plain" },
      { sourceId: "C", targetId: "D", label: undefined, kind: "dashed-plain" },
      { sourceId: "D", targetId: "E", label: undefined, kind: "invisible" },
      { sourceId: "E", targetId: "F", label: undefined, kind: "bidirectional-directed" },
      { sourceId: "G", targetId: "H", label: undefined, kind: "directed" },
    ]);
    expect(diagram.warnings.some((warning) => warning.startsWith("unsupported_arrow_variant:"))).toBe(true);
  });

  it("supports nested subgraphs with explicit and generated ids", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        subgraph outer [Outer]
          subgraph inner [Inner]
            A[X]
          end
          B[Y]
        end
        A --> B
      `,
    });

    expect(diagram.subgraphs).toEqual([
      { id: "inner", label: "Inner", nodeIds: ["A"], parentId: "outer" },
      { id: "outer", label: "Outer", nodeIds: ["B"], parentId: undefined },
    ]);
  });

  it("extracts mermaid render geometry for flowchart diagrams", async (context) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(process.execPath, ["-e", 'require("canvas")'], { stdio: "ignore" });
    } catch {
      context.skip();
    }

    const diagram = await parseMermaid({
      mermaid: `
        flowchart LR
        A[Start] --> B{Decision}
        B -->|yes| C[Done]
        B -->|no| D[Retry]
      `,
    });

    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const a = byId.get("A")!;
    const b = byId.get("B")!;
    const c = byId.get("C")!;
    const d = byId.get("D")!;
    // LR layout: A left of B, B left of C/D; C and D stacked vertically
    expect(a.x! + a.width!).toBeLessThanOrEqual(b.x! + 1);
    expect(b.x! + b.width!).toBeLessThanOrEqual(c.x! + 1);
    expect(c.y).not.toBe(d.y);
    for (const node of diagram.nodes) {
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
    // Edge routes follow the rendered splines
    for (const edge of diagram.edges) {
      expect(edge.points?.length ?? 0).toBeGreaterThan(1);
    }
    const ab = diagram.edges[0];
    expect(ab.points![0].x).toBeLessThan(ab.points![ab.points!.length - 1].x);
  });

  it("applies class assignments declared separately from node definitions", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        A[Start] --> B[Finish]
        classDef success fill:#ddffdd,stroke:#00aa00,color:#003300
        class A,B success
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      {
        id: "A",
        label: "Start",
        shape: "rectangle",
        fillColor: "#ddffdd",
        strokeColor: "#00aa00",
        fontColor: "#003300",
      },
      {
        id: "B",
        label: "Finish",
        shape: "rectangle",
        fillColor: "#ddffdd",
        strokeColor: "#00aa00",
        fontColor: "#003300",
      },
    ]);
  });

  it("supports alt frames with else sections", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        A->>B: Try
        alt No cache
          A->>B: Render
        else Cached
          A->>B: Passthrough
        end
        B-->>A: Done
      `,
    });

    expect(diagram.sequenceMessages.map((message) => message.kind)).toEqual([
      "solid",
      "solid",
      "solid",
      "dotted",
    ]);
    expect(diagram.sequenceFrames).toEqual([
      {
        kind: "alt",
        label: "No cache",
        startOrder: 1,
        endOrder: 2,
        depth: 0,
        participantIds: ["A", "B"],
        sections: [{ order: 2, label: "Cached" }],
      },
    ]);
  });

  it("extracts mermaid render geometry for sequence diagrams", async (context) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(process.execPath, ["-e", 'require("canvas")'], { stdio: "ignore" });
    } catch {
      context.skip();
    }

    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        A->>B: one
        alt branch
          B->>A: two
        else other
          B-->>A: three
        end
      `,
    });

    const geometry = diagram.sequenceGeometry;
    expect(geometry).toBeDefined();
    expect(geometry!.participants.map((participant) => participant.id)).toEqual(["A", "B"]);
    expect(geometry!.participants[0].lifelineX).toBeLessThan(geometry!.participants[1].lifelineX);
    expect(Object.keys(geometry!.eventYs).sort()).toEqual(["0", "1", "2"]);
    expect(geometry!.eventYs["0"]).toBeLessThan(geometry!.eventYs["1"]);
    expect(geometry!.frames).toHaveLength(1);
    expect(geometry!.frames[0].startOrder).toBe(1);
    expect(geometry!.frames[0].dividerYs).toHaveLength(1);
  });

  it("rejects invalid sequence syntax explicitly", () => {
    return expect(
      parseMermaid({
        mermaid: `
          sequenceDiagram
          A->>B: fine
          this is not valid mermaid
        `,
      }),
    ).rejects.toThrow(/parse_error/);
  });

  it("supports the full sequence message arrow set", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        A->>B: filled
        A-->>B: dotted filled
        A->B: open
        A-->B: dotted open
        A-xB: cross
        A--xB: dotted cross
        A-)B: point
        A--)B: dotted point
        A<<->>B: both
        A<<-->>B: both dotted
      `,
    });

    expect(diagram.sequenceMessages.map((message) => message.kind)).toEqual([
      "solid",
      "dotted",
      "solid-open",
      "dotted-open",
      "solid-cross",
      "dotted-cross",
      "solid-point",
      "dotted-point",
      "bidirectional-solid",
      "bidirectional-dotted",
    ]);
  });

  it("supports par, critical, and break frames with actors", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        actor U as User
        par Task one
          U->>A: One
        and Task two
          U->>A: Two
        end
        critical Commit
          A->>B: Commit
        option Rollback
          A-xB: Reject
        end
        break Abort
          B-->U: Stopped
        end
      `,
    });

    expect(diagram.sequenceParticipants).toEqual([
      { id: "U", label: "User", type: "actor" },
      { id: "A", label: "A" },
      { id: "B", label: "B" },
    ]);
    expect(diagram.sequenceFrames.map((frame) => [frame.kind, frame.label])).toEqual([
      ["par", "Task one"],
      ["critical", "Commit"],
      ["break", "Abort"],
    ]);
    expect(diagram.sequenceFrames[0].sections).toEqual([{ order: 1, label: "Task two" }]);
    expect(diagram.sequenceFrames[1].sections).toEqual([{ order: 3, label: "Rollback" }]);
    expect(diagram.sequenceMessages.map((message) => message.kind)).toEqual([
      "solid",
      "solid",
      "solid",
      "solid-cross",
      "dotted-open",
    ]);
  });

  it("supports semicolon-separated statements and chained edges", async () => {
    const diagram = await parseMermaid({
      sourceName: "chain.mermaid",
      mermaid: `
        flowchart TD
        A[Start]; B{Check}; C((Done))
        A --> B -->|ok| C
      `,
    });

    expect(diagram.pageName).toBe("chain");
    expect(diagram.direction).toBe("TD");
    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "A", label: "Start", shape: "rectangle" },
      { id: "B", label: "Check", shape: "rhombus" },
      { id: "C", label: "Done", shape: "ellipse" },
    ]);
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: undefined, kind: "directed" },
      { sourceId: "B", targetId: "C", label: "ok", kind: "directed" },
    ]);
  });

  it("supports branch targets with ampersands across chained edges", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        A[Start] --> B{Check} & C(Retry) --> D((Done))
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "A", label: "Start", shape: "rectangle" },
      { id: "B", label: "Check", shape: "rhombus" },
      { id: "C", label: "Retry", shape: "rounded-rectangle" },
      { id: "D", label: "Done", shape: "ellipse" },
    ]);
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: undefined, kind: "directed" },
      { sourceId: "A", targetId: "C", label: undefined, kind: "directed" },
      { sourceId: "B", targetId: "D", label: undefined, kind: "directed" },
      { sourceId: "C", targetId: "D", label: undefined, kind: "directed" },
    ]);
  });

  it("supports subgraphs and quoted multiline labels", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        graph TB
          subgraph "Product Write Path"
            AC["api-catalogue
write use case"]
            OB["Outbox table
(PostgreSQL)"]
          end
          AC --> OB
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "AC", label: "api-catalogue\nwrite use case", shape: "rectangle" },
      { id: "OB", label: "Outbox table\n(PostgreSQL)", shape: "rectangle" },
    ]);
    expect(diagram.subgraphs).toEqual([
      {
        id: "subgraph-1",
        label: "Product Write Path",
        nodeIds: ["AC", "OB"],
        parentId: undefined,
      },
    ]);
  });

  it("supports alternate quoted edge-label syntax", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        graph TD
        A["Shadow mode live
(legacy sole applier)"]
        B["product_count update"]
        A -- "parity >= 99.99%" --> B
      `,
    });

    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      {
        sourceId: "A",
        targetId: "B",
        label: "parity >= 99.99%",
        kind: "directed",
      },
    ]);
  });

  it("supports dotted directed edges", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        graph TD
        A[Start] -.->|eventual| B[Later]
      `,
    });

    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      {
        sourceId: "A",
        targetId: "B",
        label: "eventual",
        kind: "dashed-directed",
      },
    ]);
  });

  it("converts literal escaped newline sequences into multiline labels", async () => {
    const diagram = await parseMermaid({
      mermaid: String.raw`
        graph TD
        A["Line 1\nLine 2"] --> B["Other\nNode"]
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "A", label: "Line 1\nLine 2", shape: "rectangle" },
      { id: "B", label: "Other\nNode", shape: "rectangle" },
    ]);
  });

  it("parses a narrow stateDiagram-v2 slice with notes", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        [*] --> LegacyOnly : start here
        LegacyOnly --> EventDriven : all capabilities cut over
        EventDriven --> [*]
        note right of LegacyOnly
          Legacy path: sole production writer
          New path: computes but does not apply
        end note
      `,
    });

    expect(diagram.diagramType).toBe("state");
    expect(diagram.direction).toBe("TD");
    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "__state_start__", label: "Start", shape: "ellipse" },
      { id: "LegacyOnly", label: "LegacyOnly", shape: "rounded-rectangle" },
      { id: "EventDriven", label: "EventDriven", shape: "rounded-rectangle" },
      { id: "__state_end__", label: "End", shape: "ellipse" },
      {
        id: "state-note-1",
        label: "Legacy path: sole production writer\nNew path: computes but does not apply",
        shape: "rectangle",
        fillColor: "#fff3bf",
        strokeColor: "#f08c00",
        fontColor: "#333333",
      },
    ]);
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "__state_start__", targetId: "LegacyOnly", label: "start here", kind: "directed" },
      { sourceId: "LegacyOnly", targetId: "EventDriven", label: "all capabilities cut over", kind: "directed" },
      { sourceId: "EventDriven", targetId: "__state_end__", label: undefined, kind: "directed" },
      { sourceId: "LegacyOnly", targetId: "state-note-1", label: undefined, kind: "plain" },
    ]);

    const noteNode = diagram.nodes.find((node) => node.id === "state-note-1");
    // Real text measurement sizes the two-line note; font metrics vary a bit
    // across platforms, so assert a plausible band instead of exact pixels.
    expect(noteNode?.width!).toBeGreaterThan(150);
    expect(noteNode?.width!).toBeLessThan(400);
    expect(noteNode?.height!).toBeGreaterThan(40);
    expect(noteNode?.height!).toBeLessThan(120);
  });

  it("honors explicit state diagram direction declarations", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        direction LR
        [*] --> A
        A --> [*]
      `,
    });

    expect(diagram.direction).toBe("LR");
  });

  it("parses composite states into subgraphs with nested transitions", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        [*] --> Running
        state Running {
          [*] --> Warm
          Warm --> Hot : heat
        }
        Running --> [*]
      `,
    });

    expect(diagram.subgraphs).toEqual([
      { id: "Running", label: "Running", nodeIds: ["Running_start", "Warm", "Hot"], parentId: undefined },
    ]);
    const nodeIds = diagram.nodes.map((node) => node.id);
    expect(nodeIds).toContain("Running_start");
    expect(nodeIds).toContain("Warm");
    expect(nodeIds).toContain("Hot");
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "__state_start__", targetId: "Running", label: undefined, kind: "directed" },
      { sourceId: "Running_start", targetId: "Warm", label: undefined, kind: "directed" },
      { sourceId: "Warm", targetId: "Hot", label: "heat", kind: "directed" },
      { sourceId: "Running", targetId: "__state_end__", label: undefined, kind: "directed" },
    ]);
    const nestedStart = diagram.nodes.find((node) => node.id === "Running_start");
    expect(nestedStart).toMatchObject({ shape: "ellipse", label: "" });
  });

  it("parses fork, join, and choice pseudostates", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        state f <<fork>>
        state j <<join>>
        state c <<choice>>
        [*] --> f
        f --> a
        f --> b
        a --> j
        b --> j
        j --> c
        c --> [*]
      `,
    });

    expect(diagram.nodes.find((node) => node.id === "f")).toMatchObject({ shape: "rectangle", fillColor: "#333333" });
    expect(diagram.nodes.find((node) => node.id === "j")).toMatchObject({ shape: "rectangle", fillColor: "#333333" });
    expect(diagram.nodes.find((node) => node.id === "c")).toMatchObject({ shape: "rhombus", fillColor: "#333333" });
    expect(diagram.edges).toHaveLength(7);
  });

  it("uses state descriptions as labels", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        Slow : A named state
        [*] --> Slow
      `,
    });

    expect(diagram.nodes.find((node) => node.id === "Slow")).toMatchObject({ label: "A named state" });
  });

  it("extracts mermaid render geometry for state diagrams", async (context) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(process.execPath, ["-e", 'require("canvas")'], { stdio: "ignore" });
    } catch {
      context.skip();
    }

    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        direction LR
        [*] --> Idle : boot
        Idle --> Running : start
        Running --> [*]
      `,
    });

    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const start = byId.get("__state_start__")!;
    const idle = byId.get("Idle")!;
    const running = byId.get("Running")!;
    // LR layout: start left of Idle, Idle left of Running
    expect(start.x! + start.width!).toBeLessThanOrEqual(idle.x! + 1);
    expect(idle.x! + idle.width!).toBeLessThanOrEqual(running.x! + 1);
    for (const edge of diagram.edges) {
      expect(edge.points?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it("parses composite states with internal start/end transitions and fork/join (gallery repro)", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        [*] --> Draft
        Draft --> Review: submit
        state Review {
            [*] --> Screening
            Screening --> Detailed: pass
            Screening --> [*]: reject
        }
        Review --> Approved: sign off
        state check <<choice>>
        Approved --> check
        check --> Live: metrics ok
        state Live {
            state forkState <<fork>>
            [*] --> forkState
            forkState --> Serving
            forkState --> Caching
            state joinState <<join>>
            Serving --> joinState
            Caching --> joinState
            joinState --> [*]
        }
        Live --> [*]: sunset
        note right of Review : SLA is 2 days
        classDef hot fill:#f8cecc,stroke:#b85450
        class Live hot
      `,
    });

    expect(diagram.diagramType).toBe("state");
    expect(diagram.subgraphs.map((subgraph) => subgraph.id).sort()).toEqual(["Live", "Review"]);
    const review = diagram.subgraphs.find((subgraph) => subgraph.id === "Review")!;
    expect(review.nodeIds.sort()).toEqual(["Detailed", "Review_end", "Review_start", "Screening"]);
    expect(diagram.nodes.find((node) => node.id === "check")).toMatchObject({ shape: "rhombus" });
    expect(diagram.nodes.find((node) => node.id === "forkState")).toMatchObject({ shape: "rectangle" });
    expect(diagram.nodes.find((node) => node.id === "joinState")).toMatchObject({ shape: "rectangle" });
    expect(diagram.nodes.find((node) => node.id === "state-note-1")).toMatchObject({ label: "SLA is 2 days" });
    // Every node is positioned (render geometry or dagre fallback)
    for (const node of diagram.nodes) {
      expect(node.x).toBeTypeOf("number");
      expect(node.y).toBeTypeOf("number");
    }
  });

  it("computes fallback layouts for graphs with edges incident to subgraph clusters", () => {
    // dagre cannot rank edges touching compound (cluster) nodes; the fallback
    // must skip them instead of crashing ("Cannot set properties of undefined")
    const layouts = computeFlowchartLayout(
      [
        { id: "A", label: "A", shape: "rounded-rectangle" },
        { id: "Inner", label: "Inner", shape: "rounded-rectangle" },
        { id: "B", label: "B", shape: "rounded-rectangle" },
      ],
      [
        { sourceId: "A", targetId: "Cluster", kind: "directed" },
        { sourceId: "Cluster", targetId: "B", kind: "directed" },
        { sourceId: "A", targetId: "Inner", kind: "directed" },
      ],
      [{ id: "Cluster", label: "Cluster", nodeIds: ["Inner"] }],
      "TD",
    );

    expect(layouts.nodeLayouts.get("Inner")).toBeDefined();
    expect(layouts.edgeLayouts.get(0)).toBeUndefined();
    expect(layouts.edgeLayouts.get(2)).toBeDefined();
  });

  it("keeps state edge geometry aligned when notes sit between transitions", async (context) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(process.execPath, ["-e", 'require("canvas")'], { stdio: "ignore" });
    } catch {
      context.skip();
    }

    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        [*] --> A
        note right of A : a note between transitions
        A --> B : first
        B --> C : second
      `,
    });

    // The note edge must not shift the polyline of the transitions after it:
    // every transition's route starts at its own source state's level.
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const transitions = diagram.edges.filter((edge) => edge.kind === "directed");
    expect(transitions.map((edge) => [edge.sourceId, edge.targetId])).toEqual([
      ["__state_start__", "A"],
      ["A", "B"],
      ["B", "C"],
    ]);
    for (const edge of transitions) {
      const source = byId.get(edge.sourceId)!;
      const target = byId.get(edge.targetId)!;
      const points = edge.points!;
      expect(points.length).toBeGreaterThan(1);
      expect(points[0].y).toBeGreaterThanOrEqual(source.y! + source.height! / 2 - 1);
      expect(points[0].y).toBeLessThanOrEqual(source.y! + source.height! + 1);
      const last = points[points.length - 1];
      expect(last.y).toBeGreaterThanOrEqual(target.y! - 1);
      expect(last.y).toBeLessThanOrEqual(target.y! + target.height! / 2 + 1);
    }
  });

  it("positions composite state contents with ancestor transforms applied", async (context) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(process.execPath, ["-e", 'require("canvas")'], { stdio: "ignore" });
    } catch {
      context.skip();
    }

    const diagram = await parseMermaid({
      mermaid: `
        stateDiagram-v2
        [*] --> Draft
        Draft --> Review
        state Review {
          [*] --> Screening
        }
        Review --> Live
        state Live {
          [*] --> Serving
        }
      `,
    });

    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
    const draft = byId.get("Draft")!;
    const screening = byId.get("Screening")!;
    // Screening is nested inside Review, rendered below Draft: without the
    // ancestor translate offsets its coordinates would sit near the origin.
    expect(screening.y!).toBeGreaterThan(draft.y! + draft.height!);
    // Serving sits in the second composite below Review: only correct when
    // the ancestor cluster translates are accumulated for both.
    expect(byId.get("Serving")!.y!).toBeGreaterThan(screening.y!);
    // Labels are measured (markdown state labels render as foreignObjects
    // unless htmlLabels are forced off, producing degenerate 16x16 boxes)
    expect(draft.width!).toBeGreaterThan(30);
  });

  it("excludes subgraph-endpoint edges and auto-created vertices from flowcharts", async (context) => {
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync(process.execPath, ["-e", 'require("canvas")'], { stdio: "ignore" });
    } catch {
      context.skip();
    }

    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        subgraph sg [Group]
          A --> B
        end
        sg --> C
      `,
    });

    // No duplicate/phantom node for the subgraph id
    expect(diagram.nodes.filter((node) => node.id === "sg")).toEqual([]);
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: undefined, kind: "directed" },
    ]);
    expect(diagram.warnings.some((warning) => warning.startsWith("unsupported_subgraph_edge:"))).toBe(true);
    // Geometry extraction still succeeded for the remaining nodes
    for (const node of diagram.nodes) {
      expect(node.x).toBeTypeOf("number");
      expect(node.y).toBeTypeOf("number");
    }
  });

  it("keeps the start arrowhead on thick bidirectional edges", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        A <==> B
      `,
    });

    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      { sourceId: "A", targetId: "B", label: undefined, kind: "bidirectional-thick-directed" },
    ]);
  });

  it("skips frontmatter before diagram header detection", async () => {
    const diagram = await parseMermaid({
      mermaid: `---
title: My Diagram
config:
  theme: base
---
flowchart LR
  A --> B
`,
    });

    expect(diagram.diagramType).toBe("flowchart");
    expect(diagram.direction).toBe("LR");
    expect(diagram.nodes.map(stripLayout)).toEqual([
      { id: "A", label: "A", shape: "rectangle" },
      { id: "B", label: "B", shape: "rectangle" },
    ]);
  });

  it("skips frontmatter for non-flowchart diagram types too", async () => {
    const diagram = await parseMermaid({
      mermaid: `---
title: Plan
---
gantt
  dateFormat YYYY-MM-DD
  section S
  A :a, 2026-01-01, 2d
`,
    });

    expect(diagram.diagramType).toBe("gantt");
  });

  it("rejects gantt quarter date formats explicitly", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          gantt
          dateFormat YYYY-QQ
          section S
          A :a, 2026-01, 3M
        `,
      }),
    ).rejects.toThrow(/unsupported_construct: gantt dateFormat "YYYY-QQ" uses quarter tokens/);
  });

  it("parses a gantt slice with month headers and month-aligned task starts", async () => {
    const diagram = await parseMermaid({
      sourceName: "delivery-plan-gantt.mermaid",
      mermaid: `
        gantt
        title EDA Migration - Multi-Team Swim Lanes
        dateFormat YYYY-MM
        axisFormat %Y-%m
        section api-catalogue
        EP1 Mutation Contract :p1e1, 2026-01, 1M
        EP2 Transactional Outbox :p1e2, 2026-02, 1M
      `,
    });

    expect(diagram.diagramType).toBe("gantt");
    expect(diagram.pageName).toBe("EDA Migration - Multi-Team Swim Lanes");
    expect(diagram.edges).toEqual([]);
    expect(diagram.warnings).toContain('ignored_gantt_directive: "axisFormat %Y-%m"');

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-period-"));
    expect(periodLabels.map(stripLayout)).toEqual([
      { id: "gantt-period-0", label: "2026-01", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-period-1", label: "2026-02", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
    ]);

    const firstBar = diagram.nodes.find((node) => node.id === "gantt-task-bar-p1e1");
    const secondBar = diagram.nodes.find((node) => node.id === "gantt-task-bar-p1e2");
    expect(firstBar).toMatchObject({ x: 288, width: 104, height: 22, shape: "rounded-rectangle" });
    expect(secondBar).toMatchObject({ x: 408, width: 104, height: 22, shape: "rounded-rectangle" });
  });

  it("parses datetime gantt input with after references and generated task ids", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        gantt
        dateFormat YYYY-MM-DD HH:mm
        section Build
        Compile :c1, 2026-01-01 08:00, 4h
        Test :after c1, 2h
        Deploy :d2, 2026-01-02 00:00, 1d
      `,
    });

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-period-"));
    expect(periodLabels.map((node) => node.label)).toEqual(["2026-01-01", "2026-01-02"]);

    expect(diagram.nodes.find((node) => node.id === "gantt-section-1")).toMatchObject({ label: "Build" });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-c1")).toMatchObject({ x: 328, width: 24 });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-task1")).toBeDefined();
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d2")).toMatchObject({ x: 408, width: 104 });
  });

  it("maps gantt task tags to bar colors", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        gantt
        dateFormat YYYY-MM-DD
        section Delivery
        Done task :done, d1, 2026-01-01, 1d
        Crit task :crit, c1, 2026-01-02, 1d
        Active task :active, a1, 2026-01-03, 1d
      `,
    });

    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d1")).toMatchObject({ fillColor: "#e0e0e0" });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-c1")).toMatchObject({ fillColor: "#f8cecc" });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-a1")).toMatchObject({ fillColor: "#d5e8d4" });
  });

  it("parses month-based gantt input", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        gantt
        title Monthly rollout
        dateFormat YYYY-MM
        section Delivery
        Discovery :d1, 2026-01, 2M
        Rollout :d2, 2026-03, 1M
      `,
    });

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-period-"));
    expect(periodLabels.map(stripLayout)).toEqual([
      { id: "gantt-period-0", label: "2026-01", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-period-1", label: "2026-02", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-period-2", label: "2026-03", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
    ]);

    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d1")).toMatchObject({ x: 288, width: 224 });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d2")).toMatchObject({ x: 528, width: 104 });
  });

  it("parses day-based gantt input", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        gantt
        title Daily rollout
        dateFormat YYYY-MM-DD
        section Delivery
        Discovery :d1, 2026-01-01, 3d
        Rollout :d2, 2026-01-04, 1d
      `,
    });

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-period-"));
    expect(periodLabels.map(stripLayout)).toEqual([
      { id: "gantt-period-0", label: "2026-01-01", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-period-1", label: "2026-01-02", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-period-2", label: "2026-01-03", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-period-3", label: "2026-01-04", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
    ]);

    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d1")).toMatchObject({ x: 288, width: 344 });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d2")).toMatchObject({ x: 648, width: 104 });
  });

  it("accepts zero-day milestones and month durations in day-based gantt input", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        gantt
        title Daily rollout with milestone
        dateFormat YYYY-MM-DD
        section Delivery
        Contracts reviewed and agreed at kickoff :milestone, ck, 2026-05-01, 0d
        Discovery :d1, 2026-05-02, 4M
      `,
    });

    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-ck")).toMatchObject({
      shape: "ellipse",
      width: 24,
      height: 24,
    });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d1")).toMatchObject({
      shape: "rounded-rectangle",
    });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d1")!.width).toBeGreaterThan(10000);
  });

  it("parses a supported xychart-beta bar chart into explicit layout nodes", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        xychart-beta
        title "Monthly Revenue"
        x-axis [Jan, Feb, Mar, Apr]
        y-axis "Revenue" 0 --> 100
        bar [30, 60, 45, 80]
      `,
    });

    expect(diagram.pageName).toBe("Monthly Revenue");
    expect(diagram.diagramType).toBe("xychart");
    expect(diagram.edges).toHaveLength(2);
    expect(diagram.nodes.find((node) => node.id === "xychart-title")).toMatchObject({
      label: "Monthly Revenue",
      shape: "text",
      width: 556,
      height: 36,
    });
    expect(diagram.nodes.find((node) => node.id === "xychart-bar-0-0")).toMatchObject({
      shape: "rounded-rectangle",
      x: 84,
      y: 336,
      width: 56,
      height: 108,
    });
    expect(diagram.nodes.find((node) => node.id === "xychart-bar-0-3")).toMatchObject({
      x: 444,
      y: 156,
      width: 56,
      height: 288,
    });
    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-y-tick-")).map((node) => node.label)).toEqual([
      "0",
      "20",
      "40",
      "60",
      "80",
      "100",
    ]);
    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-x-label-")).map((node) => node.x)).toEqual([
      52,
      172,
      292,
      412,
    ]);
  });

  it("parses a supported mixed xychart-beta into explicit bar and line primitives", async () => {
    const diagram = await parseMermaid({
      sourceName: "sales-trend.mermaid",
      mermaid: `
        xychart-beta
        x-axis [Q1, Q2, Q3, Q4]
        y-axis "Sales" 0 --> 200
        bar [50, 80, 120, 90]
        line [40, 100, 110, 85]
      `,
    });

    expect(diagram.pageName).toBe("sales-trend");
    expect(diagram.diagramType).toBe("xychart");
    expect(diagram.edges.map(stripEdgePoints)).toEqual([
      {
        sourceId: "xychart-axis-x-start",
        targetId: "xychart-axis-x-end",
        label: undefined,
        kind: "plain",
      },
      {
        sourceId: "xychart-axis-y-start",
        targetId: "xychart-axis-y-end",
        label: undefined,
        kind: "plain",
      },
      {
        sourceId: "xychart-line-point-0-0",
        targetId: "xychart-line-point-0-1",
        label: undefined,
        kind: "plain",
      },
      {
        sourceId: "xychart-line-point-0-1",
        targetId: "xychart-line-point-0-2",
        label: undefined,
        kind: "plain",
      },
      {
        sourceId: "xychart-line-point-0-2",
        targetId: "xychart-line-point-0-3",
        label: undefined,
        kind: "plain",
      },
    ]);
    expect(diagram.nodes.find((node) => node.id === "xychart-line-point-0-0")).toMatchObject({
      shape: "ellipse",
      x: 106,
      y: 330,
      width: 12,
      height: 12,
    });
    expect(diagram.nodes.find((node) => node.id === "xychart-line-point-0-2")).toMatchObject({
      x: 346,
      y: 204,
      width: 12,
      height: 12,
    });
  });

  it("supports quoted x-axis category labels containing arrows", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        xychart-beta
        x-axis ["A --> B", "B --> C"]
        y-axis 0 --> 10
        bar [3, 5]
      `,
    });

    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-x-label-")).map((node) => node.label)).toEqual([
      "A --> B",
      "B --> C",
    ]);
  });

  it("rejects unsupported xychart-beta header modifiers explicitly", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          xychart-beta horizontal
          x-axis [Jan, Feb]
          y-axis 0 --> 10
          bar [1, 2]
        `,
      }),
    ).rejects.toThrow(/unsupported_construct/);
  });

  it("rejects numeric x-axis ranges for xychart-beta explicitly", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          xychart-beta
          x-axis "Year" 2020 --> 2023
          y-axis 0 --> 100
          bar [10, 20, 30, 40]
        `,
      }),
    ).rejects.toThrow(/unsupported_construct/);
  });

  it("rejects malformed xychart-beta series lengths explicitly", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          xychart-beta
          x-axis [Jan, Feb, Mar]
          y-axis 0 --> 100
          bar [10, 20]
        `,
      }),
    ).rejects.toThrow(/parse_error/);
  });

  it("parses grouped xychart-beta bar series into separate bar primitives", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        xychart-beta
        title "Judge Phase Impact"
        x-axis ["Online (Flash)", "Batch (Flash)"]
        y-axis "USD" 0 --> 0.50
        bar [0.250, 0.162]
        bar [0.407, 0.136]
      `,
    });

    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-bar-"))).toHaveLength(4);
    expect(diagram.nodes.find((node) => node.id === "xychart-bar-0-0")).toMatchObject({
      x: 69,
      width: 39,
      fillColor: "#dae8fc",
    });
    expect(diagram.nodes.find((node) => node.id === "xychart-bar-1-0")).toMatchObject({
      x: 116,
      width: 39,
      fillColor: "#d5e8d4",
    });
  });

  it("parses line-only xychart-beta charts with multiple series", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        xychart-beta
        x-axis ["10K", "100K", "1M"]
        y-axis "USD" 0 --> 300
        line [2.50, 25, 250]
        line [1.62, 16.2, 162]
        line [0.82, 8.2, 82]
        line [0.56, 5.6, 56]
      `,
    });

    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-line-point-"))).toHaveLength(12);
    expect(diagram.edges).toHaveLength(10);
    expect(diagram.nodes.find((node) => node.id === "xychart-line-point-3-2")).toMatchObject({
      shape: "ellipse",
      x: 346,
      y: 335,
      strokeColor: "#b85450",
    });
  });

  it("rejects xychart-beta diagrams without any bar or line series explicitly", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          xychart-beta
          x-axis [Jan, Feb, Mar]
          y-axis 0 --> 100
        `,
      }),
    ).rejects.toThrow(/requires at least one bar or line series/);
  });

  it("derives the y-axis range from the data when no y-axis directive is present", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        xychart-beta
        x-axis [Jan, Feb]
        bar [2, 4]
      `,
    });

    expect(diagram.diagramType).toBe("xychart");
    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-bar-"))).toHaveLength(2);
    expect(diagram.nodes.filter((node) => node.id.startsWith("xychart-y-tick-")).length).toBeGreaterThan(0);
  });

  it("parses sequence participants, messages, self-messages, and notes", async () => {
    const diagram = await parseMermaid({
      sourceName: "catalogue-publication-sequence.mermaid",
      mermaid: `
        sequenceDiagram
        participant BO as Backoffice / Internal
        participant AC as api-catalogue
        participant MQ as RabbitMQ
        BO->>AC: Create or update product
        AC->>AC: Persist product
        AC->>MQ: Publish ProductMutationCommitted (via outbox)
        Note over AC: Legacy post_write HTTP call retired for API writes
      `,
    });

    expect(diagram.pageName).toBe("catalogue-publication-sequence");
    expect(diagram.diagramType).toBe("sequence");
    expect(diagram.sequenceParticipants).toEqual([
      { id: "BO", label: "Backoffice / Internal" },
      { id: "AC", label: "api-catalogue" },
      { id: "MQ", label: "RabbitMQ" },
    ]);
    expect(diagram.sequenceMessages).toEqual([
      {
        order: 0,
        sourceId: "BO",
        targetId: "AC",
        label: "Create or update product",
        kind: "solid",
      },
      {
        order: 1,
        sourceId: "AC",
        targetId: "AC",
        label: "Persist product",
        kind: "solid",
      },
      {
        order: 2,
        sourceId: "AC",
        targetId: "MQ",
        label: "Publish ProductMutationCommitted (via outbox)",
        kind: "solid",
      },
    ]);
    expect(diagram.sequenceNotes).toEqual([
      {
        order: 3,
        participantIds: ["AC"],
        label: "Legacy post_write HTTP call retired for API writes",
        placement: "over",
      },
    ]);
    expect(diagram.sequenceActivations).toEqual([]);
    expect(diagram.sequenceFrames).toEqual([]);
  });

  it("decodes mermaid entity escapes in sequence text", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        participant A as api #35;v1
        Note over A: first #59; second
        A->>A: a #59; b #38; c
      `,
    });

    expect(diagram.sequenceParticipants[0].label).toBe("api #v1");
    expect(diagram.sequenceNotes[0].label).toBe("first ; second");
    expect(diagram.sequenceMessages[0].label).toBe("a ; b & c");
  });

  it("rejects semicolons inside sequence note text like stock mermaid", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          sequenceDiagram
          participant MCI as Merchant Catalogue Intake
          participant AC as api-catalogue
          Note over MCI,AC: Ownership mode determines routing: legacy_batch → EP7 bridge still; api_canonical → this path
        `,
      }),
    ).rejects.toThrow(/parse_error/);
  });

  it("parses explicit activation and deactivation bars", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        participant A as API
        participant B as Worker
        A->>B: Dispatch
        activate B
        B->>B: Process
        deactivate B
        B-->>A: Ack
      `,
    });

    expect(diagram.sequenceActivations).toEqual([
      {
        participantId: "B",
        startOrder: 0,
        endOrder: 1,
        depth: 0,
      },
    ]);
    expect(diagram.sequenceMessages).toEqual([
      {
        order: 0,
        sourceId: "A",
        targetId: "B",
        label: "Dispatch",
        kind: "solid",
      },
      {
        order: 1,
        sourceId: "B",
        targetId: "B",
        label: "Process",
        kind: "solid",
      },
      {
        order: 2,
        sourceId: "B",
        targetId: "A",
        label: "Ack",
        kind: "dotted",
      },
    ]);
  });

  it("rejects deactivate without matching activate", async () => {
    await expect(
      parseMermaid({
        mermaid: `
          sequenceDiagram
          participant A
          deactivate A
        `,
      }),
    ).rejects.toThrow(/deactivate without matching activate|inactivate an inactive/);
  });

  it("parses opt and loop sequence control frames", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        participant A as API
        participant B as Worker
        opt Cache miss
          A->>B: Dispatch
          loop Retry until success
            B->>B: Process
          end
        end
        B-->>A: Ack
      `,
    });

    expect(diagram.sequenceFrames).toEqual([
      {
        kind: "loop",
        label: "Retry until success",
        startOrder: 1,
        endOrder: 1,
        depth: 1,
        participantIds: ["B"],
      },
      {
        kind: "opt",
        label: "Cache miss",
        startOrder: 0,
        endOrder: 1,
        depth: 0,
        participantIds: ["A", "B"],
      },
    ]);
  });

  it("ignores sequence rect wrappers and keeps inner messages", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        sequenceDiagram
        participant A as API
        participant B as Worker
        rect rgb(230, 240, 255)
          A->>B: Dispatch
        end
        B-->>A: Ack
      `,
    });

    expect(diagram.sequenceMessages).toEqual([
      {
        order: 0,
        sourceId: "A",
        targetId: "B",
        label: "Dispatch",
        kind: "solid",
      },
      {
        order: 1,
        sourceId: "B",
        targetId: "A",
        label: "Ack",
        kind: "dotted",
      },
    ]);
    expect(diagram.sequenceFrames).toEqual([]);
    expect(diagram.warnings).toContain('ignored_sequence_wrapper: "rect rgb(230, 240, 255)"');
  });
});
