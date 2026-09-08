# Markdown to Confluence Draw.io MCP Specification

## Objective

Convert Mermaid diagrams embedded in Markdown or stored in `.mermaid` resources into editable `.drawio` diagrams for downstream publication, including Confluence page publishing.

## Scope

Version 1 focuses on a constrained, deterministic conversion path which is practical to implement and easy to validate.

For the current implementation status by Mermaid diagram family and by flowchart feature, see `doc/coverage-matrix.md`.

### In scope

- Mermaid input as inline text or resource content
- `flowchart` / `graph` diagrams
- `sequenceDiagram` support parsed through Mermaid's own sequence parser: participants and actors, boxes, autonumbering, the full message arrow set, inline activation, self-messages, notes, and `opt` / `loop` / `alt` / `par` / `critical` / `break` control frames
- initial `stateDiagram-v2` / `stateDiagram` support for transitions, start/end markers, and right-of notes
- initial `gantt` support for quarter-based delivery-plan timelines (`dateFormat YYYY-QQ`, sections, and explicit task bars)
- initial `xychart-beta` support for optional `title`, categorical `x-axis`, ranged `y-axis`, and one or more `bar` and/or `line` series
- Conversion to a single `.drawio` document
- One page per Mermaid diagram
- One default layer per page
- Basic node, edge, label, and direction mapping
- Deterministic auto-layout suitable for manual refinement in Draw.io
- Explicit warnings and errors for unsupported constructs

### Out of scope for version 1

- `classDiagram`
- `erDiagram`
- `journey`
- Theme parity with Mermaid
- Pixel-perfect visual equivalence with Mermaid rendering
- Full Draw.io editor integration

## Primary Use Case

1. Read Markdown containing Mermaid fenced blocks or `mermaid-resource` references.
2. Convert each Mermaid diagram to `.drawio`.
3. Save generated `.drawio` artifacts.
4. Attach generated artifacts during Confluence publication.
5. Embed or reference the generated Draw.io attachment in the published page.

## Functional Contract

### Tool name

`convert_mermaid_to_drawio`

### Input

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `mermaid` | string | yes | Mermaid source text |
| `source_name` | string | no | Logical source name for diagnostics and page naming |
| `format` | enum | no | `drawio-xml` or `drawio-html`, default `drawio-xml` |
| `layout` | enum | no | `auto` or `none`, default `auto` |
| `page_name` | string | no | Optional Draw.io page name override |

### Output

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `drawio_xml` | string | yes | Generated Draw.io XML |
| `drawio_html` | string | no | HTML viewer output when requested |
| `page_name` | string | yes | Generated page name |
| `warnings` | string[] | yes | Non-fatal conversion warnings |

### Error categories

- `parse_error`
- `unsupported_dialect`
- `unsupported_construct`
- `invalid_reference`
- `conversion_error`

## Conversion Model

The converter shall translate Mermaid into an intermediate diagram model and then map that model to Nasdanika Draw.io objects using:

- `Document.create(...)`
- `Document.createPage()`
- `Root.createLayer()`
- `Layer.createNode()`
- `Layer.createConnection(...)`
- `Document.save(false)`

The implementation should keep Mermaid parsing separate from Draw.io generation so parsers and mappings can evolve independently.

## Version 1 Mermaid Mapping

### Supported diagram headers

- `flowchart TD`
- `flowchart TB`
- `flowchart LR`
- `flowchart RL`
- `graph TD`
- `graph TB`
- `graph LR`
- `graph RL`

### Node mapping

| Mermaid form | Meaning | Draw.io mapping |
| --- | --- | --- |
| `A[Label]` | process node | rectangle |
| `A(Label)` | rounded node | rounded rectangle |
| `A{Decision}` | decision node | rhombus |
| `A((Label))` | terminal-style node | ellipse |
| bare identifier | implicit node | rectangle with identifier as label |

### Edge mapping

| Mermaid form | Meaning | Draw.io mapping |
| --- | --- | --- |
| `A --> B` | directed edge | arrow connection |
| `A --- B` | plain edge | line connection |
| `A -->|Text| B` | labeled edge | arrow connection with label |
| `A --> B & C` | branch to multiple targets | one arrow connection per target |
| `A --> B & C --> D` | chained branch groups | cross-product edges between adjacent groups |

### Layout mapping

| Mermaid direction | Preferred layout |
| --- | --- |
| `TD`, `TB` | top-to-bottom |
| `LR` | left-to-right |
| `RL` | right-to-left |

The initial layout only needs to produce readable non-overlapping output. It does not need to replicate Mermaid positioning exactly.

## Non-Functional Requirements

- Deterministic output for identical input
- Stable node and edge identifiers within a single conversion run
- Clear diagnostics for unsupported syntax
- Editable output in Draw.io
- No dependency on the Draw.io editor UI

## Markdown Integration Requirements

The Markdown publication pipeline shall:

1. detect `mermaid` fenced blocks
2. detect `mermaid-resource` fenced blocks
3. resolve resource references relative to the source document
4. convert Mermaid content to `.drawio`
5. persist generated `.drawio` files as publication artifacts
6. hand the generated artifacts to the Confluence publishing step

## Confluence Integration Requirements

The publication flow shall support:

1. uploading generated `.drawio` files as page attachments
2. embedding or referencing those attachments in the published page
3. falling back to alternate rendering when the Draw.io macro is unavailable

The Confluence-specific embedding mechanism is intentionally left configurable because it depends on the target Confluence environment and installed apps.

## Suggested Architecture

### Components

1. Mermaid parser adapter
2. Intermediate diagram model
3. Draw.io generator based on Nasdanika `drawio`
4. Markdown integration layer
5. Confluence publication integration layer

### Runtime choice

Use a containerized runtime combining:

- Node.js for Mermaid parsing
- Java for Draw.io generation via this repository

## Incremental Delivery Plan

### Version 1

- Flowchart parsing
- Basic node and edge mapping
- Draw.io XML generation
- Markdown integration hooks

### Version 2

- richer sequence diagram support (`rect` backgrounds, create/destroy markers)
- Better styles and themes
- Richer layout
- Confluence-specific embedding improvements

## Open Decisions

- Which Mermaid parser/library to use in the containerized runtime
- Exact intermediate model schema
- Whether generated `.drawio` files are stored on disk only or also returned inline
- Exact Confluence macro or attachment embedding strategy
