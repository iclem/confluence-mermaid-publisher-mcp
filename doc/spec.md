# Confluence Mermaid Publisher MCP Specification

This document describes the implemented product contract. For syntax-level Mermaid coverage, see [`coverage-matrix.md`](coverage-matrix.md). For installation and operation, see [`user-manual.md`](user-manual.md).

## Objective

Publish locally authored Markdown and Mermaid diagrams to Confluence through a small, workflow-oriented MCP interface. Mermaid remains the authoring format; Confluence pages are the publication target.

The publisher supports three Confluence embedding modes:

- `drawio` converts Mermaid into an editable `.drawio` attachment, creates or updates draw.io custom content, and embeds a draw.io extension; this is the default
- `svg` renders an adaptive light/dark SVG attachment with the Mermaid source preserved in metadata
- `macropack` embeds Mermaid source directly in a MacroPack extension

## Product boundaries

### In scope

- create and replace Confluence page bodies from Markdown text or server-visible files
- preserve inline Markdown formatting and nested block structure through Atlassian's Markdown and JSON transformers
- create, inspect, and update embedded Mermaid diagrams on existing pages
- select draw.io, SVG, or MacroPack globally with `CONFLUENCE_DEFAULT_EMBEDDING_MODE`
- override the embedding mode on an individual MCP call
- control the width of pages created or updated from Markdown
- convert supported Mermaid diagrams to editable draw.io documents
- render Mermaid as adaptive SVG without a Confluence diagram app
- preserve unsupported or failed Mermaid blocks as source code during Markdown publication
- expose the same eight tools over stdio and stateless Streamable HTTP

### Out of scope

- arbitrary Confluence page editing beyond the exposed publication workflows
- complete CommonMark or GitHub Flavored Markdown compatibility
- full Mermaid grammar, theme, or pixel-level rendering parity
- browser-driven draw.io editing
- automatic upload or remapping of local images and relative document links
- automatic migration of an existing diagram from one embedding mode to another during update

## MCP server contract

The server name is `confluence-mermaid-publisher`. Older registrations using `drawio-confluence-mcp` and the old draw.io-specific tool names must be migrated.

### Tools

| Tool | Required input | Purpose |
| --- | --- | --- |
| `inspect_confluence_page_diagrams` | `pageId` | Return page metadata, attachments, draw.io custom content, and detected draw.io, SVG, and MacroPack diagrams |
| `create_confluence_diagram_from_mermaid` | `pageId`, `mermaid` | Add one embedded diagram, optionally after the first paragraph containing `anchorText` |
| `update_confluence_diagram_from_mermaid` | `pageId`, `mermaid`, exactly one selector | Update one embedded diagram in place without replacing the page |
| `create_confluence_page_from_markdown` | `title`, `markdown`, and a destination | Create a page and publish an in-memory Markdown document |
| `create_confluence_page_from_markdown_file` | `title`, `markdownFile`, and a destination | Create a page from a server-visible Markdown file |
| `update_confluence_page_from_markdown` | `pageId`, `markdown` | Replace an existing page body from in-memory Markdown |
| `update_confluence_page_from_markdown_file` | `pageId`, `markdownFile` | Replace an existing page body from a server-visible Markdown file |
| `append_confluence_page_paragraph` | `pageId`, `text` | Append one plain-text paragraph |

A page-creation destination is either:

- `spaceId`, with optional `parentId`; or
- `siblingPageId`, which supplies the sibling page's space and parent

`spaceKey` is optional macro metadata. `sourceName` is optional publication metadata and defaults to the Markdown filename for file-based calls.

### Embedding mode resolution

`embeddingMode` accepts `drawio`, `svg`, or `macropack`.

For creation and full-page publication, resolution is:

1. the call-level `embeddingMode`, when supplied
2. `CONFLUENCE_DEFAULT_EMBEDDING_MODE`, when configured
3. `drawio`

For diagram updates, the target is resolved before mutation:

- `widgetDiagramName` maps to the generic diagram-name selector and can identify draw.io or SVG diagrams
- `custContentId` is draw.io-only
- `localId` identifies draw.io, SVG, or MacroPack diagrams and lets the server detect the target mode
- `index` is zero-based within a mode; on a page containing multiple modes, provide `embeddingMode` or use a stable selector
- supplying an override that contradicts the selected diagram fails instead of migrating it
- SVG attachments cannot be renamed during update

Exactly one of `widgetDiagramName`, `custContentId`, `localId`, or `index` is required for an update.

### Results

Inspection and single-diagram mutations return the current page summary plus detected embedded diagrams, attachments, and draw.io custom-content metadata. SVG inspection includes the filename, dimensions, embedding mode, and stable attachment ID as `localId`.

Markdown publication returns:

- the updated page summary
- the source name and effective embedding mode
- counts for Mermaid, successfully embedded, and fallback blocks
- the diagrams detected after publication

## Markdown publication contract

Markdown is converted through Atlassian's Markdown-to-ADF and JSON transformer packages. The supported publication behavior includes:

- headings, paragraphs, block quotes, horizontal rules, and fenced code blocks
- bullet and ordered lists, including nesting and non-default ordered-list starts
- tables and nested inline content
- links, bold, italic, strikethrough, and inline code marks
- fenced `mermaid` blocks in top-level and nested containers

Raw HTML is treated as text. Relative document links are not mapped to Confluence pages, and Markdown image URLs are not uploaded as local attachments.

Markdown publication replaces the destination page body; it is not a merge. Each Mermaid block is processed independently. If one block cannot be embedded, the publisher inserts an explanation and preserves the original Mermaid source, then continues with the remaining document. Top-level source uses an expandable section where supported; nested source remains a code block to satisfy ADF container rules.

In draw.io mode, generated diagram names are derived from the page title and block ordinal, for example `architecture-overview-01.drawio`. The original Mermaid source is placed in an expandable section below the diagram. In SVG mode, the SVG attachment contains the source in metadata and Markdown publication also adds an expandable source section. In MacroPack mode, the source lives in the extension node.

### Page width

All four Markdown creation and update tools accept `pageWidth: "full-width" | "default"`. Here `default` means Confluence's centered fixed-width column.

New pages resolve width in this order:

1. call-level `pageWidth`
2. `CONFLUENCE_DEFAULT_PAGE_WIDTH`
3. `full-width`

Updates preserve the page's current width when neither the call nor environment supplies an override. Width is written to both `content-appearance-draft` and `content-appearance-published` after content publication. Matching properties are left unchanged. If a property update fails, content may already be published and one property may already have changed; callers should inspect the page before retrying creation. Single-diagram tools do not change page width.

## Diagram rendering contracts

### Draw.io

The draw.io conversion pipeline is:

1. TypeScript parses Mermaid into a normalized intermediate model, using Mermaid parsers and render geometry where applicable
2. the intermediate JSON is passed to the Java/Nasdanika generator
3. the generator creates one editable draw.io document and page
4. the publisher uploads the document and attempts to generate a rendered preview
5. if preview rendering fails, the publisher uses a placeholder PNG required by the widget lifecycle

Supported diagram families are:

- `flowchart` and `graph`, including common nodes, edges, labels, directions, subgraphs, and styling
- `sequenceDiagram`, including participants and actors, boxes, autonumbering, message variants, activation, notes, and control frames
- `stateDiagram` and `stateDiagram-v2`, including descriptions, notes, composite/concurrent states, and pseudostates
- `gantt`, including Mermaid date formats, references, durations, sections, tags, and milestones
- `xychart-beta`, including titles, categorical axes, ranges, and multiple bar or line series

[`coverage-matrix.md`](coverage-matrix.md) is the normative feature matrix and must be updated with parser or generator changes.

### Adaptive SVG

SVG mode uses Agentic Mermaid locally on Node.js 22+ and bypasses the Java/draw.io converter. No rendering service or Confluence diagram app is required. Generated SVGs contain `github-light` colors and `github-dark` overrides selected by `prefers-color-scheme`; explicit source colors are retained. Theme switching depends on the embedded image browser context and is not guaranteed to follow Confluence's theme setting.

The SVG is a native image attachment rather than an editable widget. Updates refresh its attachment version and media reference while preserving the stable attachment ID. Light and dark renders must agree on geometry and content; otherwise adaptive rendering fails. Known renderer gaps include some composite-state label overlap, missing state class colors, and sequence activation differences.

## Runtime contract

The packaged Docker image contains Node.js 22, Java 21, the parser, generator, publisher, and both MCP transports.

| Command | Behaviour |
| --- | --- |
| `mcp` | stdio MCP server; default container command |
| `mcp-http` | stateless Streamable HTTP at `/mcp`, with `/healthz` |
| `publisher-cli` | direct Confluence publication CLI |
| `convert` | Mermaid-to-draw.io conversion utility |
| `test` | repository test entrypoint |
| `shell` | interactive shell |

File-based MCP calls read paths in the server process. A Docker deployment must mount the source file so that the same path is visible inside the container. The supplied stdio helper enforces an absolute workspace path and mounts it at the same absolute location.

## Configuration contract

Required base URL:

- `CONFLUENCE_BASE_URL`, or fallback `COPILOT_MCP_CONFLUENCE_URL`

Required authentication, using one set:

- `CONFLUENCE_EMAIL` plus `CONFLUENCE_API_TOKEN`
- `CONFLUENCE_BEARER_TOKEN`
- fallback `COPILOT_MCP_CONFLUENCE_USERNAME` plus `COPILOT_MCP_CONFLUENCE_API_TOKEN`

Optional runtime settings:

- `CONFLUENCE_DEFAULT_EMBEDDING_MODE=drawio|svg|macropack`
- `CONFLUENCE_DEFAULT_PAGE_WIDTH=full-width|default`
- `MCP_HOST` and `MCP_PORT` for HTTP transport
- `CONFLUENCE_MERMAID_PUBLISHER_MCP_IMAGE` and `CONFLUENCE_MERMAID_PUBLISHER_MCP_WORKSPACE` for the local stdio helper

Blank fallback values are treated as unset. Unsupported embedding-mode and page-width values fail with the accepted values in the error. The checked-in stdio helper and Compose services forward `CONFLUENCE_DEFAULT_PAGE_WIDTH`, but currently do not forward `CONFLUENCE_DEFAULT_EMBEDDING_MODE`.

## Error and safety behaviour

- invalid configuration fails before Confluence mutation
- diagram updates reject zero or multiple selectors
- ambiguous mixed-mode index selection requires an explicit mode
- a selector/mode mismatch fails rather than mutating a different diagram
- duplicate draw.io names fail creation; update the existing diagram or choose another name
- changing embedding mode during update is rejected
- renaming an SVG during update is rejected
- Confluence writes use the latest page version to reduce version conflicts
- live Confluence validation remains tenant-dependent and should begin on disposable pages

## Known limitations

- Markdown conversion intentionally does not implement every CommonMark or GFM feature
- diagram-family support is broad but not full Mermaid compatibility
- draw.io preview rendering can fall back to a placeholder when a real preview cannot be produced
- Confluence app availability and macro schemas vary by tenant
- HTTP transport is stateless; the server does not retain MCP sessions between requests
- the checked-in stdio helper and Compose services use the built-in draw.io default because they do not forward the server-wide embedding-mode environment variable
