import { describe, expect, it } from "vitest";

import { parseMermaid } from "./index.js";

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

  it("preserves rgb and rgba values in classDef directives", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        flowchart TD
        classDef themed fill:rgb(230, 240, 255),stroke:rgba(25, 113, 194, 0.8),color:rgb(10, 20, 30)
        A[Start]:::themed --> B[Finish]:::themed
      `,
    });

    expect(diagram.nodes.map(stripLayout)).toEqual([
      {
        id: "A",
        label: "Start",
        shape: "rectangle",
        fillColor: "rgb(230, 240, 255)",
        strokeColor: "rgba(25, 113, 194, 0.8)",
        fontColor: "rgb(10, 20, 30)",
      },
      {
        id: "B",
        label: "Finish",
        shape: "rectangle",
        fillColor: "rgb(230, 240, 255)",
        strokeColor: "rgba(25, 113, 194, 0.8)",
        fontColor: "rgb(10, 20, 30)",
      },
    ]);
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
    expect(noteNode?.width).toBe(295);
    expect(noteNode?.height).toBe(64);
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

  it("parses a gantt slice with quarter headers and month-aligned task starts", async () => {
    const diagram = await parseMermaid({
      sourceName: "delivery-plan-gantt.mermaid",
      mermaid: `
        gantt
        title EDA Migration - Multi-Team Swim Lanes
        dateFormat YYYY-QQ
        axisFormat %Y Q%q
        section api-catalogue
        EP1 Mutation Contract :p1e1, 2026-01, 1q
        EP2 Transactional Outbox :p1e2, 2026-02, 1q
      `,
    });

    expect(diagram.diagramType).toBe("gantt");
    expect(diagram.pageName).toBe("EDA Migration - Multi-Team Swim Lanes");
    expect(diagram.edges).toEqual([]);
    expect(diagram.warnings).toContain('ignored_gantt_directive: "axisFormat %Y Q%q"');

    const quarterLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-quarter-"));
    expect(quarterLabels.map(stripLayout)).toEqual([
      { id: "gantt-quarter-0", label: "2026 Q1", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-1", label: "2026 Q2", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
    ]);

    const firstBar = diagram.nodes.find((node) => node.id === "gantt-task-bar-p1e1");
    const secondBar = diagram.nodes.find((node) => node.id === "gantt-task-bar-p1e2");
    expect(firstBar).toMatchObject({ x: 288, width: 104, height: 22, shape: "rounded-rectangle" });
    expect(secondBar).toMatchObject({ x: 328, width: 104, height: 22, shape: "rounded-rectangle" });
  });

  it("parses named yearly periods when gantt uses YYYY-QQ input", async () => {
    const diagram = await parseMermaid({
      mermaid: `
        gantt
        title Seasonal rollout
        dateFormat YYYY-QQ
        section Delivery
        Discovery :d1, 2026-S1, 1q
        Rollout :d2, 2026-S2, 1q
      `,
    });

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-quarter-"));
    expect(periodLabels.map(stripLayout)).toEqual([
      { id: "gantt-quarter-0", label: "2026 S1", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-1", label: "2026 S2", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
    ]);

    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d1")).toMatchObject({ x: 288, width: 104 });
    expect(diagram.nodes.find((node) => node.id === "gantt-task-bar-d2")).toMatchObject({ x: 408, width: 104 });
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

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-quarter-"));
    expect(periodLabels.map(stripLayout)).toEqual([
      { id: "gantt-quarter-0", label: "2026-01", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-1", label: "2026-02", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-2", label: "2026-03", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
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

    const periodLabels = diagram.nodes.filter((node) => node.id.startsWith("gantt-quarter-"));
    expect(periodLabels.map(stripLayout)).toEqual([
      { id: "gantt-quarter-0", label: "2026-01-01", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-1", label: "2026-01-02", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-2", label: "2026-01-03", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
      { id: "gantt-quarter-3", label: "2026-01-04", shape: "rectangle", fillColor: "#f5f5f5", strokeColor: "#d0d0d0", fontColor: "#333333" },
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
    expect(diagram.warnings).toEqual([
      'ignored_sequence_wrapper: "rect rgb(230, 240, 255)"',
    ]);
  });
});
