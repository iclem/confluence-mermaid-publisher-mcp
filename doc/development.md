# Development

## Stack

- Node.js 22
- TypeScript in `publisher/`
- Vitest for unit tests
- Docker for local MCP runtime packaging

There is no Java, Maven, parser package, or conversion toolchain.

## Local Commands

```bash
npm --prefix publisher ci
npm --prefix publisher test
npm --prefix publisher run check
```

Docker-backed:

```bash
make build
make test
```

Build the MCP image:

```bash
make image-mcp
```

Run HTTP MCP locally:

```bash
make mcp-http
```

Run stdio MCP through Docker:

```bash
./scripts/confluence-mermaid-mcp.sh
```

## Project Layout

| Path | Purpose |
| --- | --- |
| `publisher/` | MCP server, HTTP server, CLI, Confluence client, MacroPack publisher |
| `scripts/confluence-mermaid-mcp.sh` | Docker stdio MCP wrapper with workspace mount |
| `scripts/confluence-mermaid.sh` | Docker publisher CLI wrapper |
| `scripts/test.sh` | Packaged verification |
| `doc/` | Operator and developer docs |

## Verification

Run:

```bash
./scripts/test.sh
```

Before publishing a change, also build the container when Docker is available:

```bash
docker build -t confluence-mermaid-publisher-mcp:local .
```
