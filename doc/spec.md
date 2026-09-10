# Confluence Mermaid Publisher MCP Specification

This document describes the implemented product contract. For syntax-level Mermaid coverage, see [`coverage-matrix.md`](coverage-matrix.md). For installation and operation, see [`user-manual.md`](user-manual.md).

## Objective

Publish locally authored Markdown and Mermaid diagrams to Confluence through a small, workflow-oriented MCP interface. Mermaid remains the authoring format; Confluence pages are the publication target.

The publisher supports two Confluence embedding modes:

- `macropack` embeds Mermaid source directly in a MacroPack extension and is the default
- `drawio` converts Mermaid into an editable `.drawio` attachment, creates or updates draw.io custom content, and embeds a draw.io extension

## Product boundaries

### In scope

- create and replace Confluence page bodies from Markdown text or server-visible files
- create, inspect, and update embedded Mermaid diagrams on existing pages
- select MacroPack or draw.io globally with `CONFLUENCE_DEFAULT_EMBEDDING_MODE`
- override the embedding mode on an individual MCP call
- convert the supported Mermaid subset to editable draw.io documents when draw.io mode is selected
- preserve unsupported or failed Mermaid blocks as source code during Markdown publication
- expose the same tools over stdio and stateless Streamable HTTP

### Out of scope

- arbitrary Confluence page editing beyond the exposed publication workflows
- full CommonMark or GitHub Flavored Markdown compatibility
- full Mermaid grammar, theme, or pixel-level rendering parity
- browser-driven draw.io editing
- a full-fidelity PNG render of generated draw.io diagrams
- automatic migration of an existing diagram from one embedding mode to another during update

## MCP server contract

The server name is `confluence-mermaid-publisher`. Older registrations using `drawio-confluence-mcp` and the old draw.io-specific tool names must be migrated.

### Tools

| Tool | Required input | Purpose |
| --- | --- | --- |
| `inspect_confluence_page_diagrams` | `pageId` | Return page metadata, attachments, draw.io custom content, and detected draw.io/MacroPack diagrams |
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

`embeddingMode` accepts only `macropack` or `drawio`.

For creation and full-page publication, resolution is:

1. the call-level `embeddingMode`, when supplied
2. `CONFLUENCE_DEFAULT_EMBEDDING_MODE`, when configured
3. `macropack`

For diagram updates, the target is resolved before mutation:

- `widgetDiagramName` and `custContentId` are draw.io-only selectors
- `localId` identifies either mode and lets the server detect the target mode
- `index` is zero-based within a mode; on a page containing both modes, provide `embeddingMode` or use `localId`
- supplying an override that contradicts the selected diagram fails instead of migrating it

Exactly one of `widgetDiagramName`, `custContentId`, `localId`, or `index` is required for an update.

### Results

Inspection and single-diagram mutations return the current page summary plus detected embedded diagrams, attachments, and draw.io custom-content metadata.

Markdown publication returns:

- the updated page summary
- the source name and effective embedding mode
- counts for Mermaid, successfully embedded, and fallback blocks
- the diagrams detected after publication

## Markdown publication contract

The block-level Markdown parser supports:

- headings
- paragraphs
- block quotes
- bullet lists
- ordered lists, including a non-default starting number
- tables
- horizontal rules
- fenced code blocks
- fenced `mermaid` blocks

Markdown publication replaces the destination page body; it is not a merge. Each Mermaid block is processed independently. If one block cannot be embedded, the publisher inserts an explanatory paragraph and the original Mermaid source as a code block, then continues with the remaining document.

In draw.io mode, generated diagram names are derived from the page title and block ordinal, for example `architecture-overview-01.drawio`. The original Mermaid source is also placed in an expandable section below the diagram. In MacroPack mode, the Mermaid source lives in the extension node and no `.drawio` artifact is generated.

## Mermaid-to-draw.io conversion contract

The conversion pipeline is:

1. TypeScript parses the supported Mermaid subset into a normalized intermediate model
2. the intermediate JSON is passed to the Java/Nasdanika generator
3. the generator creates one editable draw.io document and page
4. the publisher uploads the document and a placeholder PNG required by the widget lifecycle

Supported diagram families are:

- `flowchart` and `graph`
- `sequenceDiagram`
- `stateDiagram` and `stateDiagram-v2`
- `gantt`
- `xychart-beta`

Support within each family is intentionally partial. [`coverage-matrix.md`](coverage-matrix.md) is the normative feature matrix and must be updated with parser or generator changes.

## Runtime contract

The packaged Docker image contains Node.js, Java 21, the parser, the generator, the publisher, and both MCP transports.

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

- `CONFLUENCE_DEFAULT_EMBEDDING_MODE=macropack|drawio`
- `MCP_HOST` and `MCP_PORT` for HTTP transport
- `CONFLUENCE_MERMAID_PUBLISHER_MCP_IMAGE` and `CONFLUENCE_MERMAID_PUBLISHER_MCP_WORKSPACE` for the local stdio helper

Blank fallback values are treated as unset. Unsupported embedding-mode values fail at server startup with the accepted values in the error.

## Error and safety behaviour

- invalid configuration fails before Confluence mutation
- diagram updates reject zero or multiple selectors
- ambiguous mixed-mode index selection requires an explicit mode
- a selector/mode mismatch fails rather than mutating a different diagram
- duplicate draw.io names fail creation; update the existing diagram or choose another name
- Confluence writes use the latest page version to reduce version conflicts
- live Confluence validation remains tenant-dependent and should begin on disposable pages

## Known limitations

- draw.io PNG previews are placeholders rather than rendered diagram images
- Markdown support is block-oriented and does not implement the complete inline Markdown specification
- diagram-family support is a documented subset, not full Mermaid compatibility
- Confluence app availability and macro schemas vary by tenant
- HTTP transport is stateless; the server does not retain MCP sessions between requests
- the checked-in stdio helper and Compose services do not currently forward the server-wide embedding-mode environment variable; use a per-call override or a raw Docker launch
