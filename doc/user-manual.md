# Markdown to Confluence Draw.io MCP User Manual

This manual covers installation, runtime setup, and the most common operator workflows for the Confluence diagram MCP server.

For the shortest path to a first successful publish, see `doc/quick-start.md`.

The intended workflow is: author locally in Markdown, iterate with normal file-based tools, and publish the final result to Confluence. This is typically faster, more reproducible, and less token-expensive than using Confluence itself as the primary editing surface. The project embeds Mermaid as MacroPack by default and can still use draw.io when editable `.drawio` artifacts are required.

## What this server does

The MCP server exposes a product-oriented tool surface for:

- publishing Markdown documents to Confluence
- embedding Mermaid blocks as MacroPack or draw.io diagrams
- creating a single Confluence diagram from Mermaid
- updating an existing embedded diagram in place
- inspecting diagrams already present on a page

## Prerequisites

- Docker
- access to a Confluence Cloud tenant with the draw.io app installed
- access to a Confluence Cloud tenant with MacroPack installed if you want to use the default MacroPack mode
- Confluence credentials via one of these explicit sets:
  - direct publisher variables:
    - `CONFLUENCE_BASE_URL`
    - plus either:
      - `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`, or
      - `CONFLUENCE_BEARER_TOKEN`
  - Copilot-style fallback variables:
    - `COPILOT_MCP_CONFLUENCE_URL`
    - `COPILOT_MCP_CONFLUENCE_USERNAME`
    - `COPILOT_MCP_CONFLUENCE_API_TOKEN`

## Build the image

From the repository root:

```bash
make image-mcp
```

## Choose a transport

### Recommended: HTTP MCP

HTTP is the best default for local agent integrations because one container can serve multiple clients and the current implementation is stateless.

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

Or start the equivalent compose service from the repository root:

```bash
docker compose -f build/docker-compose/docker-compose-local.yml up mcp-http
```

Equivalent Make target:

```bash
make mcp-http
```

For containerized HTTP, `MCP_HOST` must be `0.0.0.0` so the published Docker port can reach the server. MCP clients on the host should still use `http://127.0.0.1:3000/mcp`.

The documented default publishes the port on `127.0.0.1` only. If you explicitly want network access from other machines, change the Docker port mapping to `-p 3000:3000`.

Endpoint:

```text
http://127.0.0.1:3000/mcp
```

Health check:

```text
http://127.0.0.1:3000/healthz
```

### Stdio MCP

Stdio is useful when the host agent wants to spawn the container directly against the current workspace.

From the workspace you want mounted:

```bash
./scripts/confluence-drawio-mcp.sh
```

If the helper is launched from another directory, set the workspace explicitly:

```bash
MARKDOWN_TO_CONFLUENCE_DRAWIO_MCP_WORKSPACE=/absolute/path/to/your-project \
  ./scripts/confluence-drawio-mcp.sh
```

The helper launches the packaged image through `docker run` with:

- the active workspace bind-mounted at the same absolute path
- the container working directory set to that workspace path
- both direct `CONFLUENCE_*` variables and Copilot-style fallback variables forwarded into the container

The raw Docker equivalent is:

```bash
docker run --rm -i \
  -v "$PWD":"$PWD" \
  -w "$PWD" \
  -e CONFLUENCE_BASE_URL \
  -e CONFLUENCE_EMAIL \
  -e CONFLUENCE_API_TOKEN \
  -e CONFLUENCE_BEARER_TOKEN \
  -e CONFLUENCE_DEFAULT_EMBEDDING_MODE \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  markdown-to-confluence-drawio-mcp:local mcp
```

Use local Docker stdio when your agent prefers command-based MCP registration scoped to the current workspace. Use HTTP when you want a long-lived shared container and URL-based registration.

If you do **not** keep a local checkout and instead pull the packaged image from a registry, you can still use stdio mode by registering a direct `docker run` command. The examples below assume:

- macOS or Linux
- the MCP client launches the command with its cwd set to the workspace that should be mounted
- you replace `<your-registry>/markdown-to-confluence-drawio-mcp:<tag>` with your published image reference

## Provider installation

Migration note: if you previously registered this MCP server as `drawio-confluence-mcp`, update the server key/name to `confluence-mermaid-publisher` and switch any client automation to the generic Confluence diagram tool names.

### GitHub Copilot CLI

Typical local config file:

```text
~/.copilot/mcp-config.json
```

Recommended local HTTP registration:

```json
{
  "mcpServers": {
    "confluence-mermaid-publisher": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

For GitHub Copilot cloud agents, start from the repository-root example:

```text
.github/copilot/cloud-agent/confluence-mermaid-publisher.json
```

That checked-in example uses the packaged Docker image with stdio transport.

For local project-scoped stdio use, register `./scripts/confluence-drawio-mcp.sh` as the command from the workspace you want mounted.

If you prefer a registry-only setup without a local checkout, a direct stdio registration can use `docker run` through the shell:

```json
{
  "mcpServers": {
    "confluence-mermaid-publisher": {
      "type": "stdio",
      "command": "sh",
      "args": [
        "-c",
        "docker run --rm -i -v \"$PWD\":\"$PWD\" -w \"$PWD\" -e CONFLUENCE_BASE_URL -e CONFLUENCE_EMAIL -e CONFLUENCE_API_TOKEN -e CONFLUENCE_BEARER_TOKEN -e COPILOT_MCP_CONFLUENCE_URL -e COPILOT_MCP_CONFLUENCE_USERNAME -e COPILOT_MCP_CONFLUENCE_API_TOKEN <your-registry>/markdown-to-confluence-drawio-mcp:<tag> mcp"
      ]
    }
  }
}
```

### Codex

Typical global config file:

```text
~/.codex/config.toml
```

Example registration:

```toml
[mcp_servers.confluence-mermaid-publisher]
url = "http://127.0.0.1:3000/mcp"
```

If you prefer per-project setup, place the same block in:

```text
.codex/config.toml
```

Registry-only stdio example:

```toml
[mcp_servers.confluence-mermaid-publisher]
command = "sh"
args = [
  "-c",
  "docker run --rm -i -v \"$PWD\":\"$PWD\" -w \"$PWD\" -e CONFLUENCE_BASE_URL -e CONFLUENCE_EMAIL -e CONFLUENCE_API_TOKEN -e CONFLUENCE_BEARER_TOKEN -e COPILOT_MCP_CONFLUENCE_URL -e COPILOT_MCP_CONFLUENCE_USERNAME -e COPILOT_MCP_CONFLUENCE_API_TOKEN <your-registry>/markdown-to-confluence-drawio-mcp:<tag> mcp"
]
```

### Claude Code / Claude Desktop

Claude Code and Claude Desktop both use a JSON `mcpServers` definition. The easiest shared shape is:

```json
{
  "mcpServers": {
    "confluence-mermaid-publisher": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Common locations:

- Claude Code global: `~/.claude.json`
- Claude Code project-local: `.mcp.json`
- Claude Desktop:
  - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
  - Linux: `~/.config/Claude/claude_desktop_config.json`
  - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`

Registry-only stdio example:

```json
{
  "mcpServers": {
    "confluence-mermaid-publisher": {
      "type": "stdio",
      "command": "sh",
      "args": [
        "-c",
        "docker run --rm -i -v \"$PWD\":\"$PWD\" -w \"$PWD\" -e CONFLUENCE_BASE_URL -e CONFLUENCE_EMAIL -e CONFLUENCE_API_TOKEN -e CONFLUENCE_BEARER_TOKEN -e COPILOT_MCP_CONFLUENCE_URL -e COPILOT_MCP_CONFLUENCE_USERNAME -e COPILOT_MCP_CONFLUENCE_API_TOKEN <your-registry>/markdown-to-confluence-drawio-mcp:<tag> mcp"
      ]
    }
  }
}
```

### Gemini CLI

Typical config file:

```text
~/.gemini/settings.json
```

Example registration:

```json
{
  "mcpServers": {
    "confluence-mermaid-publisher": {
      "httpUrl": "http://127.0.0.1:3000/mcp",
      "trust": true
    }
  }
}
```

Project-local overrides can also live in:

```text
.gemini/settings.json
```

## File-based publishing and bind mounts

`create_confluence_page_from_markdown_file` reads the Markdown file on the **server side**. If the server runs in Docker, the file must exist inside the container too.

Recommended rule:

- bind-mount the directory containing the Markdown file into the container
- preserve the same absolute path inside the container when practical

That is why the HTTP startup examples mount `"$PWD":"$PWD"` when the document lives under the current repository, and why `./scripts/confluence-drawio-mcp.sh` mounts the active workspace at the same absolute path for local Docker stdio mode.

If you do not want to expose the file path to the container, use:

- `create_confluence_page_from_markdown`

and send the Markdown body directly instead.

## Current MCP tools

| Tool | Use when |
| --- | --- |
| `inspect_confluence_page_diagrams` | You want to inspect embedded diagrams, attachments, and draw.io custom content on an existing page |
| `create_confluence_page_from_markdown` | The Markdown content is already in memory |
| `create_confluence_page_from_markdown_file` | The Markdown already exists on disk and you want to avoid sending it through model context |
| `update_confluence_page_from_markdown` | You want to replace an existing page body from Markdown already in memory |
| `update_confluence_page_from_markdown_file` | You want to republish an existing page directly from a Markdown file on disk |
| `create_confluence_diagram_from_mermaid` | You want to add one new diagram to an existing page |
| `update_confluence_diagram_from_mermaid` | You want to replace an existing embedded diagram without recreating the page |
| `append_confluence_page_paragraph` | You want a small text-only page edit |

## Typical workflows

### Publish a Markdown document with Mermaid blocks

Use one of:

- `create_confluence_page_from_markdown`
- `create_confluence_page_from_markdown_file`
- `update_confluence_page_from_markdown`
- `update_confluence_page_from_markdown_file`

Provide:

- `title` plus either `spaceId` or `siblingPageId` for page creation
- or `pageId` for in-place page updates
- optional `spaceKey`

The publisher:

1. creates the page
2. parses Markdown into Confluence ADF
3. embeds each Mermaid block as MacroPack or draw.io based on the effective `embeddingMode`
4. uses draw.io conversion only when the effective mode is `drawio`
5. falls back to Mermaid source blocks when embedding fails

### Add a single diagram to an existing page

Use:

- `create_confluence_diagram_from_mermaid`

Provide:

- `pageId`
- `mermaid`
- optional `diagramName` when the embedding mode is `drawio`
- optional `embeddingMode` only when you want to override the server default
- optional `anchorText`

### Update an existing embedded diagram

Use:

- `inspect_confluence_page_diagrams`
- then `update_confluence_diagram_from_mermaid`

Select the target diagram by:

- `widgetDiagramName`
- or `custContentId`
- or `localId`
- or `index`

When `embeddingMode` is omitted, the server uses its configured default and falls back to `macropack` when no server default is set. Pass `embeddingMode` only when you explicitly want to override that default for a specific tool call.

## Example prompts for agents

- "Publish `/absolute/path/to/your-project/docs/domain-context-map.md` as a sibling of page `123456` using `create_confluence_page_from_markdown_file`."
- "Republish page `123456` from `/absolute/path/to/your-project/docs/domain-context-map.md` using `update_confluence_page_from_markdown_file`."
- "Create a new diagram on page `123456` from this Mermaid block using `drawio` mode and the file name `context-map.drawio`."
- "Inspect page `123456` and then update the diagram named `context-map.drawio` from this Mermaid source."
- "Create a new Confluence page titled `Architecture Validation` from this Markdown body and keep Mermaid fallbacks if conversion fails."

## Operational notes

- The HTTP server is intentionally **stateless**. That avoids session bootstrap issues with current HTTP MCP hosts.
- The draw.io preview uploaded with draw.io-backed diagrams is currently a **placeholder PNG preview**, not a full rendered export.
- Markdown publication supports headings, paragraphs, block quotes, bullet lists, ordered lists, tables, rules, code blocks, and Mermaid fenced blocks.

## Troubleshooting

### Missing Confluence configuration

If the server reports missing Confluence settings, provide either:

- `CONFLUENCE_BASE_URL`
- plus auth via `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN`, or `CONFLUENCE_BEARER_TOKEN`

or the equivalent `COPILOT_MCP_CONFLUENCE_*` values.

### File-based publish cannot find the source file

The server is reading the file inside Docker. Mount the host path into the container and keep the same path visible there.

### HTTP calls fail even though the container is running

Check:

1. the container was started with `mcp-http`
2. the MCP endpoint is `http://127.0.0.1:3000/mcp`
3. `http://127.0.0.1:3000/healthz` returns `ok`

### A page already has a widget with the same diagram name

Use a new `diagramName` or switch to `update_confluence_diagram_from_mermaid`.
