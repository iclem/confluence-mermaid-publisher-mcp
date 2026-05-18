# Markdown to Confluence Draw.io MCP Architecture

This document describes the implemented runtime shape for Mermaid-to-draw.io conversion and Confluence publication.

For the design rationale, see `doc/adr/0001-product-runtime-and-publication-shape.md`.

## High-level architecture

The product is split into five responsibilities:

1. **TypeScript Mermaid parser**
2. **Intermediate diagram contract**
3. **Java draw.io generator**
4. **Node.js publisher**
5. **MCP transport layer**

At a high level, the flow is:

```text
Markdown / Mermaid input
  -> parser
  -> intermediate diagram model
  -> Nasdanika-backed draw.io generator
  -> .drawio artifact + preview
  -> publisher
  -> Confluence page / attachment / draw.io widget
  -> MCP tool response
```

## Component view

| Layer | Responsibility | Main implementation |
| --- | --- | --- |
| Parser | Parse supported Mermaid syntax into a normalized model | `parser/src/index.ts` |
| Generator | Convert the normalized model into draw.io XML using Nasdanika | `generator/pom.xml` and generator sources |
| Converter bridge | Run the packaged conversion script and stage temporary artifacts | `publisher/src/converter.ts`, `scripts/convert.sh` |
| Publisher | Create and update pages, attachments, draw.io custom content, and page ADF | `publisher/src/service.ts` |
| MCP app | Expose product-level tools | `publisher/src/mcp-app.ts` |
| MCP HTTP transport | Serve the same tool contract over stateless Streamable HTTP | `publisher/src/mcp-http-server.ts` |
| Container runtime | Package Node, Java, scripts, and entrypoints in one deployable image | `Dockerfile`, `scripts/docker-entrypoint.sh` |

## Detailed responsibilities

### Parser

The parser owns Mermaid-specific concerns:

- diagram header detection
- supported subset parsing
- Mermaid validation and normalization
- stable intermediate-model output

It does **not** own:

- draw.io XML generation
- Confluence publication
- page/widget orchestration

### Intermediate contract

The parser and generator communicate through a normalized diagram model rather than direct Mermaid syntax.

The current contract centers on concepts such as:

- `pageName`
- `direction`
- `nodes`
- `edges`
- `warnings`

This keeps Mermaid grammar churn out of the Java generator and keeps generator rules testable.

### Generator

The generator uses the Nasdanika `drawio` Maven artifact to create native `.drawio` documents.

It owns:

- document and page creation
- node and edge mapping
- layout
- draw.io serialization

It does **not** own:

- Markdown parsing
- Confluence ADF
- Confluence attachments or custom content

### Publisher

The publisher is the application layer that turns generated `.drawio` artifacts into publishable Confluence results.

It owns:

- page inspection
- page creation
- attachment upsert
- draw.io custom-content creation and update
- draw.io extension-node insertion into page ADF
- Markdown-to-ADF conversion
- per-block Mermaid conversion with fallback

This keeps Confluence-specific behaviour out of the parser and generator.

### MCP layer

The MCP layer exposes workflow-oriented tools instead of low-level transport primitives.

Current tools include:

- page inspection
- Markdown page publication from text
- Markdown page publication from file path
- single-widget creation from Mermaid
- in-place widget update from Mermaid

That tool surface is intentionally closer to user intent than to Confluence's raw REST operations.

## Runtime and deployment topology

The packaged runtime is one Docker image containing:

- Node.js for parser and publisher code
- Java 21 for the Nasdanika-backed generator
- shell scripts for packaging and conversion orchestration

The default container entrypoint starts the stdio MCP server:

```text
confluence-mermaid-publisher-mcp:local mcp
```

The same image can also start the HTTP MCP server:

```text
confluence-mermaid-publisher-mcp:local mcp-http
```

and utility commands:

- `publisher-cli`
- `convert`
- `test`
- `shell`

## Request flows

### 1. Single Mermaid widget creation

1. MCP client calls `create_confluence_diagram_from_mermaid`
2. `publisher/src/mcp-app.ts` creates a publisher service
3. if the effective `embeddingMode` is `drawio`, `publisher/src/converter.ts` writes temporary Mermaid input and runs `scripts/convert.sh`
4. in draw.io mode, the generator produces `.drawio`
5. the publisher either uploads the draw.io artifacts and injects a draw.io extension, or injects a MacroPack extension directly into page ADF
6. the tool returns the inspected page state

### 2. Existing widget update

1. MCP client calls `update_confluence_diagram_from_mermaid`
2. the publisher finds the existing embedded diagram by draw.io-only selector (`widgetDiagramName`/`custContentId`), or by `localId`, or by `index` within the resolved embedding mode
3. in draw.io mode, the new `.drawio` and preview replace the old attachments and draw.io custom content is updated
4. in MacroPack mode, the embedded Mermaid source is rewritten directly in page ADF
5. page ADF metadata is updated when the backing diagram mode requires it

### 3. Markdown publication

1. MCP client calls `create_confluence_page_from_markdown`, `create_confluence_page_from_markdown_file`, `update_confluence_page_from_markdown`, or `update_confluence_page_from_markdown_file`
2. the publisher creates the target page or loads the existing page to republish
3. `publisher/src/markdown.ts` parses Markdown into block-level content
4. normal text blocks are mapped to Confluence ADF nodes
5. each Mermaid block is embedded as MacroPack or draw.io according to the resolved `embeddingMode`
6. when conversion fails, the page gets an explanatory paragraph plus the original Mermaid code block
7. the final ADF is written back to Confluence

## HTTP transport architecture

The HTTP transport is deliberately **stateless**.

Each POST request:

1. creates a fresh MCP server instance
2. creates a `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`
3. handles the request
4. closes transport and server

This matches current agent-host expectations better than a sessionful HTTP MCP flow and avoids server-side session state.

## File-based publication model

`create_confluence_page_from_markdown_file` and `update_confluence_page_from_markdown_file` read the Markdown file on the **server side**.

That is useful because it avoids copying a large document into agent context first, but it introduces an operational boundary:

- the file path passed to the tool must exist inside the running container

When the server runs under Docker, the recommended pattern is to bind-mount the relevant host path into the container at the same absolute path.

## Operational boundaries and current limitations

### Confluence boundary

The current reference backend talks to Confluence directly. The product therefore owns draw.io-specific Confluence details such as:

- attachments
- custom content
- page ADF mutation

and MacroPack-specific page ADF mutation for embedded Mermaid diagrams.

### Preview boundary

The publisher currently generates a **placeholder PNG preview** for draw.io widgets. This is enough for the widget contract and page publication flow, but it is not yet a full rendered preview of the generated diagram.

### Supported Markdown boundary

The Markdown publisher currently supports:

- headings
- paragraphs
- block quotes
- bullet lists
- ordered lists
- tables
- rules
- fenced code blocks
- fenced Mermaid blocks

### Repository boundary

This repository is still an incubation workspace. The recommended long-term direction remains:

1. keep the product-owned publisher and MCP server as the product boundary
2. keep generic draw.io generation upstream in Nasdanika
3. consume Nasdanika through Maven artifacts rather than a long-lived vendored source copy
