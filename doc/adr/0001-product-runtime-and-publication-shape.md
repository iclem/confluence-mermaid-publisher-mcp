# ADR 0001: MacroPack-Only Publication Runtime

## Status

Superseded by MacroPack-only publication.

## Decision

The product publishes Mermaid diagrams to Confluence as MacroPack extension nodes. Mermaid source is stored directly in page ADF and rendered by MacroPack.

The repository does not own a Mermaid-to-draw.io renderer, a Java generator, or draw.io widget lifecycle automation.

## Consequences

- Runtime packaging is Node-only.
- MCP tools do not expose an embedding-mode switch.
- Diagram update selectors are MacroPack `localId` or index only.
- Mermaid syntax coverage is delegated to MacroPack.
- Existing draw.io-backed pages are outside the supported update path for this server.
