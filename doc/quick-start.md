# Quick Start

## 1. Configure Confluence

```bash
export CONFLUENCE_BASE_URL="https://your-site.atlassian.net"
export CONFLUENCE_EMAIL="you@example.com"
export CONFLUENCE_API_TOKEN="..."
```

Use `CONFLUENCE_BEARER_TOKEN` instead of email/API token when that is how your environment authenticates.

## 2. Build The MCP Image

```bash
make image-mcp
```

## 3. Run Stdio MCP

```bash
./scripts/confluence-mermaid-mcp.sh
```

The wrapper mounts the active workspace into Docker at the same absolute path so file-based Markdown tools can read local files.

## 4. Register The Server

Register the command above as a stdio MCP server named `confluence-mermaid-publisher`.

For Streamable HTTP:

```bash
make mcp-http
```

The HTTP server listens on `127.0.0.1:${MCP_PORT:-3000}` by default.

## 5. Publish

Use `create_confluence_page_from_markdown` or `update_confluence_page_from_markdown` with Markdown content. Fenced Mermaid blocks are embedded as MacroPack diagrams.

For file-based publishing, use the `_file` tool variants and pass a path that exists on the MCP server host. With `./scripts/confluence-mermaid-mcp.sh`, paths under the current workspace are mounted automatically.

## Notes

- There is no `embeddingMode` argument.
- The server does not generate `.drawio` files.
- Existing diagrams can be updated by `localId`, by zero-based `index`, or by omitting a selector when the page has exactly one MacroPack diagram.
