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
| Flowchart / Graph | `flowchart`, `graph` | `partial` | Current converter target. Supports a constrained v1 subset only. |
| Architecture | `architecture-beta` | `not-started` | No parser or mapping yet. |
| Block diagram | `block-beta` | `not-started` | No parser or mapping yet. |
| C4 | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` | `not-started` | No parser or mapping yet. |
| Class diagram | `classDiagram` | `not-started` | Out of current v1 scope. |
| Entity relationship diagram | `erDiagram` | `not-started` | Out of current v1 scope. |
| Gantt | `gantt` | `partial` | Supports a narrow explicit-layout slice used by the delivery-plan sample: `title`, `dateFormat` (`YYYY-QQ`, `YYYY-MM`, `YYYY-MM-DD`), `axisFormat`, `section`, and task rows with explicit starts plus limited duration/reference metadata. |
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
| Sequence diagram | `sequenceDiagram` | `partial` | Parsed through Mermaid's own sequence parser, so syntax support matches stock draw.io: participants, actors, boxes, autonumbering, the full message arrow set, inline `->>+` activation, activation bars, `Note over/left of/right of`, and `opt` / `loop` / `alt` / `par` / `critical` / `break` frames with section dividers. Layout still uses the converter's own grid (not Mermaid's measured geometry); `create` / `destroy` and `rect` are ignored with warnings. |
| State diagram | `stateDiagram-v2`, `stateDiagram` | `partial` | Supports a narrow v1 slice: transitions, start/end markers, explicit direction (`TD`, `TB`, `LR`, `RL`), and right/left-of notes rendered through the flowchart generator path. |
| Timeline | `timeline` | `not-started` | No parser or mapping yet. |
| Tree view | `treeView-beta` | `not-started` | No parser or mapping yet. |
| Treemap | `treemap-beta` | `not-started` | No parser or mapping yet. |
| User journey | `journey` | `not-started` | Out of current v1 scope. |
| Venn | `venn` | `not-started` | No parser or mapping yet. |
| Wardley map | `wardley` | `not-started` | No parser or mapping yet. |
| XY chart | `xychart-beta` | `partial` | Supports a constrained explicit-layout subset: optional `title`, categorical `x-axis`, ranged `y-axis`, and one or more `bar` and/or `line` series; horizontal charts, numeric x-axis ranges, legends, and Mermaid theming remain unsupported. |
| ZenUML | `zenuml` | `not-planned` | Mermaid treats this as an integration surface rather than a core target for this converter. |

## Flowchart feature coverage

The current implementation is intentionally narrow. It is usable for simple process flows, but it is not close to full Mermaid flowchart coverage yet.

| Flowchart feature | Example | Status | Notes |
| --- | --- | --- | --- |
| Flowchart header | `flowchart TD` | `supported` | `TD`, `TB`, `LR`, `RL` are supported. |
| Graph header alias | `graph LR` | `supported` | Parsed the same as flowchart. |
| Rectangle node | `A[Label]` | `supported` | Mapped to Draw.io rectangle. |
| Rounded node | `A(Label)` | `supported` | Mapped to rounded rectangle. |
| Decision node | `A{Decision}` | `supported` | Mapped to rhombus. |
| Terminal node | `A((Done))` | `supported` | Mapped to ellipse. |
| Bare node identifier | `A` | `supported` | Implicit rectangle node. |
| Directed edge | `A --> B` | `supported` | Mapped to arrow connection. |
| Plain edge | `A --- B` | `supported` | Mapped to plain line connection. |
| Edge labels | `A -->|yes| B` | `supported` | Label preserved on connection. |
| Chained edges | `A --> B --> C` | `supported` | Expanded into multiple edges. |
| Branch targets | `A --> B & C` | `supported` | Expanded into one edge per target. |
| Chained branch groups | `A --> B & C --> D` | `supported` | Expanded as cross-product between adjacent groups. |
| Semicolon-separated statements | `A[Start]; B{Check}` | `supported` | Split before parsing. |
| Deterministic auto-layout | generated | `supported` | Flowcharts now use Dagre-based layered layout on the parser side, and the generator reuses Dagre edge waypoints so branching connections stay closer to Mermaid's routed geometry. |
| Subgraphs | `subgraph X ... end` | `supported` | Quoted subgraph labels are supported and emitted as Draw.io container nodes. |
| `classDef` styling | `classDef red fill:#f00,stroke:#900,color:#fff` | `partial` | Node `fill`, `stroke`, and text `color` are mapped into Draw.io node styles; unsupported Mermaid style keys are still ignored. |
| Node class suffixes | `A[Label]:::danger` | `supported` | Class suffixes now propagate `classDef` node colors into Draw.io output. |
| Node `style` directives | `style A fill:#f9f` | `not-started` | Ignored support has not been added yet. |
| `linkStyle` directives | `linkStyle 0 stroke:#333` | `not-started` | Explicitly rejected today. |
| `click` directives | `click A href ...` | `not-started` | Explicitly rejected today. |
| Mermaid directives | `%%{init: ...}%%` | `not-started` | Explicitly rejected today. |
| Frontmatter config | `--- ... ---` | `not-started` | Not parsed by the converter yet. |
| Mermaid themes / looks | `look: handDrawn` | `not-started` | No theme parity with Mermaid. |
| ELK / Dagre config passthrough | `layout: elk` | `not-started` | The converter now reuses Mermaid's default Dagre family for flowchart geometry, but explicit Mermaid layout-configuration passthrough is still not implemented. |
| Additional flowchart shapes | many Mermaid shape aliases | `not-started` | Only the current four node forms are mapped. |
| Rich text / quoted labels | `"A label"` forms | `supported` | Quoted node labels and multiline quoted labels inside supported node shapes are parsed. |
| Icons / images / markdown strings | Mermaid extensions | `not-started` | No support yet. |
| Alternate quoted edge labels | `A -- "label" --> B` | `supported` | Implemented for directed edges. |
| Dotted directed edges | `A -.-> B` | `supported` | Parsed as directed edges. |
| Edge variants beyond `-->`, `-.->`, and `---` | e.g. thick/arrows | `not-started` | No support yet. |
| Multi-line substructure and nested constructs | various | `not-started` | No support yet. |

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
| Date formats | `dateFormat YYYY-QQ`, `YYYY-MM`, `YYYY-MM-DD` | `supported` | `YYYY-QQ` accepts quarter-like labels such as `Q1` or `S1`; the current delivery-plan sample also uses month-aligned starts under quarter headers. |
| Axis format directive | `axisFormat %Y Q%q` | `partial` | Accepted and preserved as a warning today; explicit axis-format rendering is not implemented yet. |
| Sections | `section api-catalogue` | `supported` | Rendered as grey band rows. |
| Explicit task ids | `Task :task1, ...` | `supported` | Preserved for `after` / `until` references. |
| Explicit start + duration | `Task :id, 2026-01, 2M` | `supported` | Supported for quarter/month/day timelines with limited unit sets. |
| Explicit start + end | `Task :id, 2026-01-01, 2026-01-04` | `supported` | End dates are treated as inclusive Mermaid-style bounds. |
| `after` references | `Task :id, after other, 1q` | `supported` | Uses the latest referenced task end as the next start. |
| `until` references | `Task :id, 2026-01, until other` | `supported` | Stops at the referenced task start. |
| Duration units | `1q`, `2M`, `3d`, `1w` | `partial` | `q` for quarter-style timelines, `M` for month and day timelines, and `d` / `w` for day timelines are supported; broader Mermaid duration coverage is still missing. |
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
| Ranged y-axis | `y-axis "Cost" 0 --> 100` | `supported` | Optional quoted axis label plus numeric `min --> max` range drive linear scaling and readable ticks. |
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
