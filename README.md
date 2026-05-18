# markdown-to-confluence-drawio-mcp

`markdown-to-confluence-drawio-mcp` is an MCP server for publishing locally authored Markdown to Confluence while embedding Mermaid diagrams as Confluence diagrams. MacroPack is the default embedding mode, and draw.io remains available when you want editable `.drawio` artifacts.

Migration note: older MCP registrations may still refer to this server as `drawio-confluence-mcp` and to the previous draw.io-specific tool names. Update those registrations to use the `confluence-mermaid-publisher` server name and the generic Confluence diagram tool names.

The intended workflow is:

1. author and iterate locally in Markdown
2. keep that Markdown as the reproducible source of truth
3. publish the final result to Confluence

This gives a faster editing loop than using Confluence as the primary authoring surface, usually uses fewer model tokens during iterative edits, and avoids relying on Confluence's limited Mermaid support by publishing through MacroPack or draw.io.

## What it does

- publish Markdown documents to Confluence
- embed Mermaid blocks as MacroPack or draw.io diagrams during publication
- create a Confluence diagram from Mermaid on an existing page
- update an existing embedded Confluence diagram in place
- inspect diagrams already present on a page

## Runtime shape

The packaged runtime combines:

- a TypeScript Mermaid parser
- a Java/Nasdanika draw.io generator
- a Node.js Confluence publisher
- MCP transports for stdio and stateless HTTP

## Quick start

Build the local image:

```bash
make image-mcp
```

Export one supported Confluence credential set before starting the server.

Direct publisher variables with email + API token:

```bash
export CONFLUENCE_BASE_URL="https://your-site.atlassian.net"
export CONFLUENCE_EMAIL="you@example.com"
export CONFLUENCE_API_TOKEN="..."
```

or direct publisher variables with a bearer token:

```bash
export CONFLUENCE_BASE_URL="https://your-site.atlassian.net"
export CONFLUENCE_BEARER_TOKEN="..."
```

or the Copilot-style fallback variables:

```bash
export COPILOT_MCP_CONFLUENCE_URL="https://your-site.atlassian.net"
export COPILOT_MCP_CONFLUENCE_USERNAME="you@example.com"
export COPILOT_MCP_CONFLUENCE_API_TOKEN="..."
```

The local stdio helper forwards both the direct `CONFLUENCE_*` variables and the Copilot-style fallback variables into the container.

Set `CONFLUENCE_DEFAULT_EMBEDDING_MODE=drawio` if you want draw.io to be the server default. When unset, the server defaults to `macropack`.

Run local Docker stdio from the workspace you want mounted:

```bash
./scripts/confluence-drawio-mcp.sh
```

If your MCP client launches the server from another directory, point the helper at the workspace explicitly:

```bash
MARKDOWN_TO_CONFLUENCE_DRAWIO_MCP_WORKSPACE=/absolute/path/to/your-project \
  ./scripts/confluence-drawio-mcp.sh
```

This helper launches `docker run` with the active workspace bind-mounted at the same absolute path, so file-based Markdown tools can read project-local documents without a separately managed HTTP server.

If you are using only a published image from a registry and do not have a local checkout, see `doc/user-manual.md` for direct MCP configuration examples that run `docker` without the repository helper script.

Or start the HTTP MCP server:

The HTTP example below shows the Copilot-style variables because they are common in MCP setups, but the direct `CONFLUENCE_*` variables work there too.

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD":"$PWD" \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_PORT=3000 \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  markdown-to-confluence-drawio-mcp:local mcp-http
```

Or use the development compose service:

```bash
docker compose -f build/docker-compose/docker-compose-local.yml up mcp-http
```

The container binds to `0.0.0.0`, while local MCP clients should still connect to `http://127.0.0.1:3000/mcp` on the host.

This keeps the default host exposure local-only. If you intentionally want LAN access, change the published port binding to `-p 3000:3000`.

Use local Docker stdio when your agent can spawn command-based MCP servers directly. Use HTTP when you want one long-lived container that multiple local clients can share.

For HTTP mode, register the server in your agent at:

```text
http://127.0.0.1:3000/mcp
```

## Documentation

- `doc/quick-start.md` - shortest path to a first publish
- `doc/user-manual.md` - installation and operator workflows
- `doc/architecture.md` - implementation structure
- `doc/spec.md` - product and conversion scope
- `doc/development.md` - development workflow and packaged layout
- `doc/adr/0001-product-runtime-and-publication-shape.md` - key design rationale
