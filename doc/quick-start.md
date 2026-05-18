# Markdown to Confluence Draw.io MCP Quick Start

This is the shortest path from a clean checkout to a successful Confluence publish through the MCP server.

For the full setup and provider-specific installation details, see `doc/user-manual.md`.

The workflow assumes that Markdown is your local source of truth and Confluence is the final publication target. That keeps iteration fast and file-based, while the MCP server embeds Mermaid as MacroPack by default and can still use draw.io when you want editable `.drawio` artifacts.

## 1. Set Confluence credentials

Export either direct publisher variables:

```bash
export CONFLUENCE_BASE_URL="https://your-site.atlassian.net"
export CONFLUENCE_EMAIL="you@example.com"
export CONFLUENCE_API_TOKEN="..."
```

or the Copilot-style equivalents:

```bash
export COPILOT_MCP_CONFLUENCE_URL="https://your-site.atlassian.net"
export COPILOT_MCP_CONFLUENCE_USERNAME="you@example.com"
export COPILOT_MCP_CONFLUENCE_API_TOKEN="..."
```

## 2. Build the runtime image

From the repository root:

```bash
make image-mcp
```

## 3. Optional: use local Docker stdio instead of HTTP

If your agent can spawn command-based stdio MCP servers, run the helper from the workspace you want mounted:

```bash
./scripts/confluence-drawio-mcp.sh
```

If the helper is launched from another directory, override the workspace path explicitly:

```bash
CONFLUENCE_MERMAID_PUBLISHER_MCP_WORKSPACE=/absolute/path/to/your-project \
  ./scripts/confluence-drawio-mcp.sh
```

This uses `docker run` with the workspace bind-mounted at the same absolute path, which keeps file-based Markdown publishing compatible with the existing server-side path handling.

Use this mode when your MCP client prefers command-based stdio registration. Otherwise continue with HTTP below.

## 4. Start the HTTP MCP server

If you want to publish from a file path, mount the directory containing that file into the container at the **same absolute path**.

From the repository root:

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD":"$PWD" \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_PORT=3000 \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  confluence-mermaid-publisher-mcp:local mcp-http
```

Or use the compose service from the repository root:

```bash
docker compose -f build/docker-compose/docker-compose-local.yml up mcp-http
```

Equivalent Make target:

```bash
make mcp-http
```

Inside the container, the server must bind to `0.0.0.0` so Docker can publish port `3000`. From the host, connect to `http://127.0.0.1:3000/mcp`.

The default published port is host-local only. If you want the service reachable from your LAN, use `-p 3000:3000` instead.

Health check:

```bash
curl http://127.0.0.1:3000/healthz
```

## 5. Register the MCP server in your agent

Use the HTTP configuration examples in `doc/user-manual.md` for Copilot, Codex, Claude, or Gemini.

If your client supports command-based stdio registration, register `./scripts/confluence-drawio-mcp.sh` instead and run it from the workspace you want mounted.

The common endpoint is:

```text
http://127.0.0.1:3000/mcp
```

Optional default diagram mode:

```bash
export CONFLUENCE_DEFAULT_EMBEDDING_MODE="drawio"
```

If omitted, the server defaults to `macropack`.

## 6. Do a first publish

Recommended sample file in your own repository:

```text
<your-project>/docs/domain-context-map.md
```

Ask your agent to call:

- `create_confluence_page_from_markdown_file`

with:

- `title`: the new Confluence page title
- `markdownFile`: the absolute path to the Markdown file
- either `siblingPageId` or `spaceId`

Example request shape:

```json
{
  "title": "domain-context-map validation",
  "markdownFile": "/absolute/path/to/your-project/docs/domain-context-map.md",
  "siblingPageId": "123456"
}
```

## 7. Use the right tool for the job

- `create_confluence_page_from_markdown_file` for large Markdown files already on disk
- `create_confluence_page_from_markdown` when the Markdown is generated in memory
- `update_confluence_page_from_markdown_file` to republish an existing page directly from a Markdown file
- `update_confluence_page_from_markdown` to republish an existing page from Markdown already in memory
- `create_confluence_diagram_from_mermaid` to add a single new diagram to an existing page
- `update_confluence_diagram_from_mermaid` to replace an existing embedded diagram in place
- `inspect_confluence_page_diagrams` to inspect current page/diagram state before updating it

Every Mermaid-aware tool also accepts an optional `embeddingMode` of `macropack` or `drawio`. If you omit it, the server default is used.

## Common first-run issues

- **Authentication error:** check `CONFLUENCE_*` or `COPILOT_MCP_CONFLUENCE_*`
- **HTTP tool call fails on `/mcp`:** make sure the server was started with `mcp-http`, not `mcp`
- **File-based publish cannot see the Markdown file:** bind-mount the workspace into the container at the same absolute path; `./scripts/confluence-drawio-mcp.sh` does this automatically for local Docker stdio mode
- **A widget name already exists on the page:** change `diagramName` or update the existing widget instead of creating a new one
