## Why

The current Confluence publishing flow hard-codes draw.io as the Mermaid embedding path, but the requested operator experience is now different: Mermaid should embed as MacroPack by default while draw.io remains available for environments that still want editable `.drawio` artifacts.

The MCP surface also exposes draw.io-specific tool names, which no longer matches the product contract once both embedding modes are first-class options.

## What Changes

- Add two supported Confluence Mermaid embedding modes: `macropack` and `drawio`.
- Make `macropack` the server default when no embedding-mode configuration is provided.
- Add an `embeddingMode` override to every Mermaid publishing or diagram-update MCP tool so callers can choose `macropack` or `drawio` per request.
- Add MacroPack-specific Confluence ADF creation, inspection, and update support based on the Forge extension shape used on the sample page.
- Rename MCP tools that currently contain `drawio` in their names to generic diagram-oriented names. **BREAKING**: clients that call the old tool names will need to switch to the new names.
- Preserve the current draw.io conversion flow, attachment handling, custom-content handling, and page publication behavior when `embeddingMode` is explicitly set to `drawio`.

## Capabilities

### New Capabilities
- `confluence-embedding-modes`: Publish and update Confluence Mermaid diagrams through either `macropack` or `drawio`, with a server-level default and per-tool overrides.
- `generic-confluence-diagram-tools`: Expose mode-neutral MCP tools and inspection results for Confluence page diagrams instead of draw.io-only tool names and payloads.

### Modified Capabilities
- None.

## Impact

- Affected code: `publisher/src/mcp-app.ts`, `publisher/src/service.ts`, the current draw.io-specific ADF helper layer, shared publisher types, and MCP/runtime configuration handling.
- Affected behavior: Markdown page publication and Mermaid diagram tools can now target either MacroPack or draw.io, with MacroPack becoming the default when no embedding mode is specified.
- Affected interfaces: MCP tool names and payloads for diagram inspection/create/update, plus documentation and examples that currently refer to draw.io-only operations.
- Dependencies/systems: Confluence ADF extension handling for both the existing draw.io macro contract and the MacroPack Forge extension contract observed on page `6389661705`.
