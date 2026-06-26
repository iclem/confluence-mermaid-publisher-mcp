# Architecture

The project is now a Node-only Confluence publisher. Mermaid source is not parsed or converted by this repository; it is passed through to MacroPack in Confluence page ADF.

## Runtime Shape

```text
MCP client
  -> publisher MCP server
  -> Confluence publisher service
  -> Confluence Cloud REST API
  -> MacroPack extension nodes in page ADF
```

## Main Modules

| Area | Responsibility |
| --- | --- |
| `publisher/src/mcp-app.ts` | MCP tool registration and environment-backed service creation |
| `publisher/src/service.ts` | Page creation, page updates, diagram creation, diagram updates |
| `publisher/src/macropack.ts` | MacroPack ADF extension construction, discovery, and source updates |
| `publisher/src/adf.ts` | Small generic ADF helpers |
| `publisher/src/markdown.ts` | Markdown block parsing for page publication |
| `publisher/src/confluence-client.ts` | Confluence REST client |

## Removed Surfaces

The project no longer includes:

- Java or Maven
- the Nasdanika draw.io generator
- a Mermaid parser package
- `.drawio` artifact generation
- draw.io attachment/custom-content orchestration
- `embeddingMode` configuration or MCP parameters

## Publication

Markdown publication rebuilds the target page ADF from parsed Markdown blocks. Mermaid fenced code blocks become MacroPack extension nodes containing the original Mermaid text.

Single-diagram creation appends or anchor-inserts one MacroPack extension. Single-diagram update finds a MacroPack extension by `localId`, by `index`, or by sole-diagram inference and replaces the stored Mermaid source.
