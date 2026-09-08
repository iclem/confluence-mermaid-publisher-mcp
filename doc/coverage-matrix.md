# Markdown to Confluence Draw.io MCP Coverage Matrix

This matrix tracks what the current converter can handle today and what remains out of scope.

Status values:

- `supported`: implemented and covered by tests
- `partial`: some support exists, but large parts of the Mermaid feature set are not implemented
- `not-started`: no conversion support implemented
- `not-planned`: not on the current roadmap for this converter

Source of Mermaid diagram-type list:

- Mermaid syntax docs in `mermaid-js/mermaid` under `packages/mermaid/src/docs/syntax/`
- Mermaid syntax reference: `docs/intro/syntax-reference.md`

## Diagram-type coverage

| Mermaid diagram type | Mermaid syntax | Status | Notes |
| --- | --- | --- | --- |
| Flowchart / Graph | `flowchart`, `graph` | `supported` | Parsed with Mermaid's own flowchart parser and laid out with Mermaid's Dagre render geometry (headless render with canvas-backed text measurement): all node shapes, edge types, `&` branch groups, chains, (nested) subgraphs, `classDef`/`class`/inline `style` styling. Falls back to a computed Dagre layout when canvas is unavailable. |
| Architecture | `architecture-beta` | `not-started` | No parser or mapping yet. |
| Block diagram | `block-beta` | `not-started` | No parser or mapping yet. |
| C4 | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` | `not-started` | No parser or mapping yet. |
| Class diagram | `classDiagram` | `not-started` | Out of current v1 scope. |
| Entity relationship diagram | `erDiagram` | `not-started` | Out of current v1 scope. |
| Gantt | `gantt` | `partial` | Parsed with Mermaid's own gantt parser (full syntax coverage: any `dateFormat`, `after` references, durations, task tags, milestones), then laid out with the converter's explicit month/day column layout. |
| Git graph | `gitGraph` | `not-started` | No parser or mapping yet. |
| Ishikawa / Fishbone | `ishikawa-beta` | `not-started` | No parser or mapping yet. |
| Kanban | `kanban` | `not-started` | No parser or mapping yet. |
| Mindmap | `mindmap` | `not-started` | No parser or mapping yet. |
| Packet | `packet-beta` | `not-started` | No parser or mapping yet. |
| Pie | `pie` | `not-started` | No parser or mapping yet. |
| Quadrant chart | `quadrantChart` | `not-started` | No parser or mapping yet. |
| Radar | `radar-beta` | `not-started` | No parser or mapping yet. |
| Requirement diagram | `requirementDiagram` | `not-started` | No parser or mapping yet. |
| Sankey | `sankey-beta` | `not-started` | No parser or mapping yet. |
| Sequence diagram | `sequenceDiagram` | `supported` | Parsed through Mermaid's own sequence parser and laid out with Mermaid's render geometry (headless render with canvas-backed text measurement), matching stock draw.io mermaid import: participants, actors, boxes, autonumbering, the full message arrow set, inline `->>+` activation, activation bars, `Note over/left of/right of`, and `opt` / `loop` / `alt` / `par` / `critical` / `break` frames with section dividers. `create` / `destroy` and `rect` are ignored with warnings. When canvas is unavailable on a platform, conversion falls back to a computed grid layout with a warning. |
| State diagram | `stateDiagram-v2`, `stateDiagram` | `partial` | Supports a narrow v1 slice: transitions, start/end markers, explicit direction (`TD`, `TB`, `LR`, `RL`), and right/left-of notes rendered through the flowchart generator path. |
| Timeline | `timeline` | `not-started` | No parser or mapping yet. |
| Tree view | `treeView-beta` | `not-started` | No parser or mapping yet. |
| Treemap | `treemap-beta` | `not-started` | No parser or mapping yet. |
| User journey | `journey` | `not-started` | Out of current v1 scope. |
| Venn | `venn` | `not-started` | No parser or mapping yet. |
| Wardley map | `wardley` | `not-started` | No parser or mapping yet. |
| XY chart | `xychart-beta` | `partial` | Parsed with Mermaid's own xychart parser and laid out with the converter's explicit layout: optional `title`, categorical `x-axis`, optional ranged `y-axis` (auto-derived from data when omitted), and one or more `bar` and/or `line` series; horizontal charts, numeric x-axis ranges, legends, and Mermaid theming remain unsupported. |
| ZenUML | `zenuml` | `not-planned` | Mermaid treats this as an integration surface rather than a core target for this converter. |

## Flowchart feature coverage

Flowcharts are parsed with Mermaid's own parser and laid out with geometry extracted from a headless Mermaid render, so syntax coverage matches stock draw.io mermaid import.

| Flowchart feature | Example | Status | Notes |
| --- | --- | --- | --- |
| Flowchart header | `flowchart TD` | `supported` | `TD`, `TB`, `LR`, `RL` are supported. |
| Graph header alias | `graph LR` | `supported` | Parsed the same as flowchart. |
| Rectangle node | `A[Label]` | `supported` | Mapped to Draw.io rectangle. |
| Rounded node | `A(Label)` | `supported` | Mapped to rounded rectangle. |
| Decision node | `A{Decision}` | `supported` | Mapped to rhombus. |
| Terminal node | `A((Done))` | `supported` | Mapped to ellipse. |
| Bare node identifier | `A` | `supported` | Implicit rectangle node. |
| Additional flowchart shapes | `A([stadium])`, `A[[subroutine]]`, `A[(db)]`, `A{{hex}}`, `A>odd]`, `A[/para/]`, `A[\para\]`, `A[/trap\]`, `A[\trap/]`, `A(((double)))`, `A@{ shape: ... }` | `supported` | The full classic shape set plus common `@{shape:}` aliases are mapped to stock draw.io shapes (stadium, cylinder, hexagon, parallelogram, trapezoid, predefined process, double circle, etc.). Unknown shapes fall back to rectangle with a warning. |
| Directed edge | `A --> B` | `supported` | Mapped to arrow connection. |
| Plain edge | `A --- B` | `supported` | Mapped to plain line connection. |
| Dotted edges | `A -.-> B`, `A -.- B` | `supported` | Dashed directed and dashed open variants. |
| Thick edges | `A ==> B`, `A === B` | `supported` | Rendered with a wider stroke. |
| Invisible edges | `A ~~~ B` | `supported` | Participate in layout, rendered without a stroke. |
| Bidirectional edges | `A <--> B` | `supported` | Arrowheads on both ends. |
| Circle / cross arrowheads | `A --o B`, `A --x B` | `partial` | Rendered as block arrows with a warning. |
| Edge labels | `A -->|yes| B` | `supported` | Label preserved on connection. |
| Chained edges | `A --> B --> C` | `supported` | Expanded into multiple edges. |
| Branch targets | `A --> B & C` | `supported` | Expanded into one edge per target. |
| Chained branch groups | `A --> B & C --> D` | `supported` | Expanded as cross-product between adjacent groups. |
| Semicolon-separated statements | `A[Start]; B{Check}` | `supported` | Handled by Mermaid's parser. |
| Mermaid render geometry | generated | `supported` | Node rectangles and edge polylines come from a headless Mermaid (Dagre) render with canvas-backed text measurement; without canvas the converter falls back to its own Dagre layout with a warning. |
| Subgraphs | `subgraph X ... end` | `supported` | Explicit and generated ids, quoted titles, and nested subgraphs are emitted as Draw.io container nodes. |
| Edges attached to subgraphs | `subgraph A --> B` | `not-started` | Skipped with an `unsupported_subgraph_edge` warning. |
| `classDef` styling | `classDef red fill:#f00,stroke:#900,color:#fff` | `partial` | Node `fill`, `stroke`, and text `color` are mapped into Draw.io node styles; unsupported Mermaid style keys are still ignored. Note: `rgb()`/`rgba()` values in `classDef` are rejected by Mermaid's own parser. |
| Node class suffixes | `A[Label]:::danger` | `supported` | Class suffixes propagate `classDef` node colors into Draw.io output. |
| Node `style` directives | `style A fill:#f9f` | `supported` | Inline node styles override class colors. |
| `linkStyle` directives | `linkStyle 0 stroke:#333` | `not-started` | Ignored with a warning. |
| `click` directives | `click A href ...` | `not-started` | Parsed by Mermaid; links are not rendered (warning). |
| Mermaid directives | `%%{init: ...}%%` | `partial` | Handled by Mermaid during parsing/rendering; the converter does not map theme variables into draw.io styles. |
| Frontmatter config | `--- ... ---` | `partial` | Handled by Mermaid during parsing; not mapped into draw.io styles. |
| Mermaid themes / looks | `look: handDrawn` | `not-started` | No theme parity with Mermaid. |
| ELK layout | `layout: elk` | `not-started` | Stock draw.io uses ELK for flowcharts; the converter uses Mermaid's own Dagre geometry instead. |
| Rich text / quoted labels | `"A label"` forms | `supported` | Quoted node labels and multiline quoted labels inside supported node shapes are parsed. |
| Icons / images / markdown strings | Mermaid extensions | `not-started` | Markdown label markup is preserved as literal text. |
| Alternate quoted edge labels | `A -- "label" --> B` | `supported` | Implemented for directed edges. |

## Sequence diagram feature coverage

| Sequence feature | Example | Status | Notes |
| --- | --- | --- | --- |
| Sequence header | `sequenceDiagram` | `supported` | Dispatches to the sequence parser/generator path. |
| Explicit participants | `participant AC as api-catalogue` | `supported` | Preserves declaration order and aliases. |
| Implicit participants from messages/notes | `AC->>MQ: Publish` | `supported` | Auto-created when referenced before declaration. |
| Solid messages | `A->>B: Message` | `supported` | Rendered as horizontal arrows between lifelines with filled arrowheads. |
| Self-messages | `A->>A: Persist` | `supported` | Rendered as right-hand loopback arrows. |
| Notes over one or more participants | `Note over AC: text` | `supported` | Rendered as yellow note boxes spanning one or more lifelines. |
| Dashed messages | `A-->>B: Ack` | `supported` | Rendered as dashed arrows with `dashPattern=2 3`, matching stock draw.io Mermaid import. |
| Open messages without arrowheads | `A->B` / `A-->B` | `supported` | Rendered as plain solid/dotted lines, matching stock draw.io Mermaid import. |
| Cross messages | `A-xB` / `A--xB` | `supported` | Rendered with cross arrowheads. |
| Open-arrow (async) messages | `A-)B` / `A--)B` | `supported` | Rendered with open (`classic`) arrowheads. |
| Bidirectional messages | `A<<->>B` / `A<<-->>B` | `supported` | Rendered with arrowheads on both ends. |
| Participant aliases with rich labels | `participant BO as Backoffice / Internal` | `supported` | Multiline aliases are preserved as labels. |
| Actors | `actor U as User` | `supported` | Rendered as stick-figure lifelines (`umlActor`), matching stock draw.io Mermaid import. |
| Activation bars | `activate A` / `deactivate A` | `supported` | Explicit activation spans are rendered as nested bars on lifelines. |
| `opt` control frame | `opt Cache miss ... end` | `supported` | Rendered as a `umlFrame` with a label tab, matching stock draw.io Mermaid import. |
| `loop` control frame | `loop Retry ... end` | `supported` | Rendered as a `umlFrame` with a label tab, matching stock draw.io Mermaid import. |
| `alt` / `else` frames | `alt No cache ... else Cached ... end` | `supported` | Rendered as a `umlFrame` with dashed section dividers between `else` branches, matching stock draw.io Mermaid import. |
| `par` / `and` frames | `par Task ... and ... end` | `supported` | Rendered as a `umlFrame` with dashed section dividers. |
| `critical` / `option` frames | `critical ... option ... end` | `supported` | Rendered as a `umlFrame` with dashed section dividers. |
| `break` frames | `break Abort ... end` | `supported` | Rendered as a `umlFrame` with a label tab. |
| Participant boxes | `box rgb(...) Group ... end` | `supported` | Rendered as a labeled background box around the grouped participants, matching stock draw.io Mermaid import. |
| Autonumbering | `autonumber` | `supported` | Rendered as numbered badges on messages; `autonumber off`, custom starts, and steps are honored. |
| `rect` grouping wrappers | `rect rgb(...) ... end` | `partial` | Wrapper is ignored with a warning so inner sequence content can still convert. |
| Notes left/right of a participant | `Note left of A: text` | `supported` | Rendered beside the lifeline. |
| Entity escapes | `Note over A: a #59; b` | `supported` | Mermaid numeric entity codes (e.g. `#59;` for `;`, `#35;` for `#`) are decoded to real characters, matching stock rendering. Raw `;` still terminates the statement, as in stock mermaid. |
| Inline activation | `A->>+B: msg` | `supported` | Parsed through Mermaid's sequence DB, rendered as activation bars. |
| Create / destroy semantics | `create participant A` | `partial` | Accepted (parsed by Mermaid); created participants render as regular participants, destroy markers are ignored with a warning. |

## State diagram feature coverage

| State feature | Example | Status | Notes |
| --- | --- | --- | --- |
| State diagram header | `stateDiagram-v2` | `supported` | Dispatches to the state parser/generator path. |
| Start / end markers | `[*] --> A`, `A --> [*]` | `supported` | Rendered as ellipse nodes labelled Start / End. |
| Directed transitions | `A --> B` | `supported` | Rendered through the flowchart edge path. |
| Transition labels | `A --> B : promote` | `supported` | Preserved on the connection. |
| Diagram direction | `direction LR` | `supported` | `TD`, `TB`, `LR`, and `RL` are honored; default is `TD` to match Mermaid's usual top-down rendering. |
| Right/left notes | `note right of A ... end note` | `supported` | Rendered as yellow note boxes attached to the referenced state. |
| Multiline notes | note block with multiple lines | `supported` | Note sizing now respects real line breaks instead of collapsing to a single line. |
| Composite states / nested blocks | `state Foo { ... }` | `not-started` | No nested state containers yet. |
| Choice / fork / join pseudostates | Mermaid pseudostate syntax | `not-started` | Not mapped today. |
| Concurrent regions | nested `--` regions | `not-started` | Not parsed today. |
| State styling directives | `classDef`, `style` | `not-started` | No state-specific styling support yet. |

## Gantt feature coverage

| Gantt feature | Example | Status | Notes |
| --- | --- | --- | --- |
| Gantt header | `gantt` | `supported` | Dispatches to the gantt parser/generator path. |
| Chart title | `title Delivery plan` | `supported` | Rendered as a top text node. |
| Date formats | `dateFormat YYYY-MM-DD`, `YYYY-MM`, `YYYY-MM-DD HH:mm`, ... | `supported` | Parsed by Mermaid's gantt parser, so every Mermaid `dateFormat` is accepted. Charts whose format carries months but no day/time tokens render month columns; everything else renders day columns. |
| Axis format directive | `axisFormat %Y-%m` | `partial` | Accepted and preserved as a warning today; explicit axis-format rendering is not implemented yet. |
| Sections | `section api-catalogue` | `supported` | Rendered as grey band rows. |
| Explicit task ids | `Task :task1, ...` | `supported` | Preserved for `after` references. |
| Explicit start + duration | `Task :id, 2026-01, 2M` | `supported` | Resolved by Mermaid for any supported `dateFormat`. |
| Explicit start + end | `Task :id, 2026-01-01, 2026-01-04` | `supported` | End dates are treated as exclusive Mermaid-style bounds. |
| `after` references | `Task :id, after other, 1w` | `supported` | Resolved by Mermaid (uses the latest referenced task end). |
| Tasks without ids or sections | `Task : 2026-01-01, 2d` | `supported` | Mermaid-generated ids; tasks before any `section` land in a default `Tasks` band. |
| Duration units | `1h`, `3d`, `1w`, `2M` | `supported` | Resolved by Mermaid's gantt parser. |
| Task tags | `crit`, `done`, `active`, `milestone` | `partial` | Tags drive bar colors and milestone shape, but Mermaid's richer gantt styling/config is still missing. |
| Milestones | `milestone` task tag | `supported` | Rendered as ellipse markers. |
| Excludes / weekends | `excludes weekends` | `not-started` | Calendar-aware exclusion logic is not implemented. |
| Tick intervals / vertical markers | `tickInterval`, `vert` | `not-started` | Not parsed yet. |
| Compact display / today marker / theme config | YAML/config directives | `not-started` | No gantt config passthrough yet. |

## XY chart feature coverage

| XY chart feature | Example | Status | Notes |
| --- | --- | --- | --- |
| XY chart header | `xychart-beta` | `supported` | Dispatches to the xychart parser path and emits explicit-layout nodes and edges. |
| Chart title | `title Cost by phase` | `supported` | Rendered as a top text node. |
| Categorical x-axis | `x-axis "Phase" [prep, judge, scale]` | `supported` | Optional quoted axis label plus categorical bands are supported. |
| Ranged y-axis | `y-axis "Cost" 0 --> 100` | `supported` | Optional quoted axis label plus numeric `min --> max` range drive linear scaling and readable ticks; when omitted, the range is derived from the data. |
| Bar series | `bar [10, 20, 30]` | `supported` | One or more bar series are rendered as grouped rounded-rectangle columns. |
| Line series | `line [10, 20, 30]` | `supported` | One or more line series are rendered as point markers connected by plain edges. |
| Mixed bar + line charts | repeated `bar` and `line` directives | `supported` | Mixed charts convert through the same explicit-layout synthesis path. |
| Grouped multi-series bars | repeated `bar` directives | `supported` | Per-category bar groups are split into stable per-series sub-bars. |
| Line-only charts | repeated `line` directives | `supported` | Charts do not require a bar series as long as at least one line series is present. |
| Stable y-axis ticks | generated | `supported` | Tick spacing uses deterministic, human-readable intervals derived from the declared range. |
| Horizontal modifier | `xychart-beta horizontal` | `not-started` | Explicitly rejected today. |
| Numeric x-axis ranges | `x-axis "Year" 2020 --> 2023` | `not-started` | Explicitly rejected today. |
| Legends / Mermaid theming / palette control | Mermaid config and legend behavior | `not-started` | No legend rendering or Mermaid theme parity yet; chart colors use converter defaults. |

## Interpretation

- The converter is **not feature-complete for Mermaid flowcharts**.
- The converter has **initial, partial support** for sequence, state, gantt, and xychart diagrams; other Mermaid diagram families remain unimplemented.
- This matrix should be updated whenever parser or generator support changes, so documentation and implementation stay aligned.
