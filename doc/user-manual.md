# Confluence Mermaid Publisher MCP User Manual

This manual covers installation, runtime setup, and the most common operator workflows for the Confluence diagram MCP server.

For the shortest path to a first successful publish, see `doc/quick-start.md`.

The intended workflow is: author locally in Markdown, iterate with normal file-based tools, and publish the final result to Confluence. This is typically faster, more reproducible, and less token-expensive than using Confluence itself as the primary editing surface. The project embeds Mermaid as editable draw.io diagrams by default; adaptive SVG and MacroPack are optional modes.

## What this server does

The MCP server exposes a product-oriented tool surface for:

- publishing Markdown documents to Confluence
- embedding Mermaid blocks as draw.io, adaptive SVG, or MacroPack diagrams
- creating a single Confluence diagram from Mermaid
- updating an existing embedded diagram in place
- inspecting diagrams already present on a page

## Prerequisites

- Docker
- access to a Confluence Cloud tenant with the draw.io app installed for draw.io mode; SVG mode requires no diagram app
- access to a Confluence Cloud tenant with MacroPack installed if you choose MacroPack mode
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

### HTTP MCP

HTTP is a good default when one long-lived container should serve multiple clients. Use stdio instead when the MCP host should start a workspace-scoped server on demand.

```bash
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -v "$PWD":"$PWD" \
  -e MCP_HOST=0.0.0.0 \
  -e MCP_PORT=3000 \
  -e CONFLUENCE_DEFAULT_EMBEDDING_MODE \
  -e CONFLUENCE_DEFAULT_PAGE_WIDTH \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  confluence-mermaid-publisher-mcp:local mcp-http
```

Or start the equivalent compose service from the repository root:

```bash
docker compose -f build/docker-compose/docker-compose-local.yml up mcp-http
```

Equivalent Make target:

```bash
make mcp-http
```

The checked-in Compose service and stdio helper currently do not forward `CONFLUENCE_DEFAULT_EMBEDDING_MODE`; they therefore use the built-in `drawio` default. Use a per-call `embeddingMode` override with those launch paths, or use the raw Docker form when you need a different server-wide default. Both launch paths forward `CONFLUENCE_DEFAULT_PAGE_WIDTH`.

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
CONFLUENCE_MERMAID_PUBLISHER_MCP_WORKSPACE=/absolute/path/to/your-project \
  ./scripts/confluence-drawio-mcp.sh
```

The helper launches the packaged image through `docker run` with:

- the active workspace bind-mounted at the same absolute path
- the container working directory set to that workspace path
- both direct `CONFLUENCE_*` variables and Copilot-style fallback variables forwarded into the container

The raw Docker form is below. It also forwards the optional server-wide embedding default, unlike the current helper:

```bash
docker run --rm -i \
  -v "$PWD":"$PWD" \
  -w "$PWD" \
  -e CONFLUENCE_BASE_URL \
  -e CONFLUENCE_EMAIL \
  -e CONFLUENCE_API_TOKEN \
  -e CONFLUENCE_BEARER_TOKEN \
  -e CONFLUENCE_DEFAULT_EMBEDDING_MODE \
  -e CONFLUENCE_DEFAULT_PAGE_WIDTH \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  confluence-mermaid-publisher-mcp:local mcp
```

Use local Docker stdio when your agent prefers command-based MCP registration scoped to the current workspace. Use HTTP when you want a long-lived shared container and URL-based registration.

If you do **not** keep a local checkout and instead pull the packaged image from a registry, you can still use stdio mode by registering a direct `docker run` command. The examples below assume:

- macOS or Linux
- the MCP client launches the command with its cwd set to the workspace that should be mounted
- you replace `<your-registry>/confluence-mermaid-publisher-mcp:<tag>` with your published image reference

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
        "docker run --rm -i -v \"$PWD\":\"$PWD\" -w \"$PWD\" -e CONFLUENCE_BASE_URL -e CONFLUENCE_EMAIL -e CONFLUENCE_API_TOKEN -e CONFLUENCE_BEARER_TOKEN -e COPILOT_MCP_CONFLUENCE_URL -e COPILOT_MCP_CONFLUENCE_USERNAME -e COPILOT_MCP_CONFLUENCE_API_TOKEN <your-registry>/confluence-mermaid-publisher-mcp:<tag> mcp"
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
  "docker run --rm -i -v \"$PWD\":\"$PWD\" -w \"$PWD\" -e CONFLUENCE_BASE_URL -e CONFLUENCE_EMAIL -e CONFLUENCE_API_TOKEN -e CONFLUENCE_BEARER_TOKEN -e COPILOT_MCP_CONFLUENCE_URL -e COPILOT_MCP_CONFLUENCE_USERNAME -e COPILOT_MCP_CONFLUENCE_API_TOKEN <your-registry>/confluence-mermaid-publisher-mcp:<tag> mcp"
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
        "docker run --rm -i -v \"$PWD\":\"$PWD\" -w \"$PWD\" -e CONFLUENCE_BASE_URL -e CONFLUENCE_EMAIL -e CONFLUENCE_API_TOKEN -e CONFLUENCE_BEARER_TOKEN -e COPILOT_MCP_CONFLUENCE_URL -e COPILOT_MCP_CONFLUENCE_USERNAME -e COPILOT_MCP_CONFLUENCE_API_TOKEN <your-registry>/confluence-mermaid-publisher-mcp:<tag> mcp"
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

All diagram creation and Markdown publication tools accept an optional `embeddingMode` override. Omit it to use `CONFLUENCE_DEFAULT_EMBEDDING_MODE`, which itself defaults to `drawio`. Accepted values are `drawio`, `svg`, and `macropack`.

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
3. embeds each Mermaid block as draw.io, SVG, or MacroPack based on the effective `embeddingMode`
4. uses draw.io conversion only when the effective mode is `drawio`
5. falls back to Mermaid source blocks when embedding fails

### Add a single diagram to an existing page

Use:

- `create_confluence_diagram_from_mermaid`

Provide:

- `pageId`
- `mermaid`
- optional `diagramName` for draw.io or SVG attachments
- optional `embeddingMode` only when you want to override the server default
- optional `anchorText`

### Update an existing embedded diagram

Use:

- `inspect_confluence_page_diagrams`
- then `update_confluence_diagram_from_mermaid`

Inspect the page first, then select the target diagram by exactly one of:

- `widgetDiagramName` for draw.io or SVG diagrams
- or `custContentId` for draw.io diagrams
- or `localId` for draw.io, SVG, or MacroPack diagrams
- or a zero-based `index` within an embedding mode

Use only one selector per update request.

For `localId` and `widgetDiagramName`, the server detects the existing diagram's mode. `custContentId` is draw.io-only. For `index`, pass `embeddingMode` when the page contains multiple embedding modes; otherwise the request is ambiguous and fails. An update never migrates a diagram between modes, and an SVG cannot be renamed during update.

## Markdown formatting and width

The content and file-based Markdown tools share Atlassian's official Markdown-to-ADF conversion. Inline links, strike, emphasis and code marks are preserved, including inside headings, lists, quotes and tables. Mermaid fences are transformed in their original containers; top-level source uses an expandable block, while nested source remains a code block to respect ADF container rules. Raw HTML is literal text; local images and relative document links are not automatically uploaded or mapped.

Use `pageWidth: "full-width"` or `pageWidth: "default"` on any Markdown create/update call. `default` means the centered column. The environment override is `CONFLUENCE_DEFAULT_PAGE_WIDTH`; new pages use call → environment → `full-width`. Existing pages retain their width when neither override is set. For CLI publication, use `--page-width full-width` or `--page-width default`.

Page width uses the REST v2 page-property API for both `content-appearance-draft` and `content-appearance-published`. If changing properties fails after publishing, the error identifies the already-published page; inspect it before retrying creation. This API requires page-property write permission in addition to publishing access.

## Adaptive SVG mode

Use `embeddingMode: "svg"` when you want a native image attachment instead of an editable draw.io widget or a MacroPack macro. SVG rendering runs locally through Agentic Mermaid and requires neither the Java converter nor a Confluence diagram app. The generated attachment contains light and dark color rules selected by `prefers-color-scheme`, plus the original Mermaid source in metadata.

Inspection reports SVG attachments with `embeddingMode: "svg"`, dimensions, a filename, and a stable attachment ID as `localId`. Prefer that `localId` for updates. Updating refreshes the attachment version and page media reference; changing the mode or filename during the update is rejected.

Markdown publishing adds an expandable Mermaid source block below an SVG. Unsupported blocks retain their source instead of aborting the whole document. Single-diagram SVG rendering failures return an error.

## Example prompts for agents

- "Publish `/absolute/path/to/your-project/docs/domain-context-map.md` as a sibling of page `123456` using `create_confluence_page_from_markdown_file`."
- "Republish page `123456` from `/absolute/path/to/your-project/docs/domain-context-map.md` using `update_confluence_page_from_markdown_file`."
- "Create a new diagram on page `123456` from this Mermaid block using `drawio` mode and the file name `context-map.drawio`."
- "Inspect page `123456` and then update the diagram named `context-map.drawio` from this Mermaid source."
- "Create a new Confluence page titled `Architecture Validation` from this Markdown body and keep Mermaid fallbacks if conversion fails."

## Operational notes

- The HTTP server is intentionally **stateless**. That avoids session bootstrap issues with current HTTP MCP hosts.
- Draw.io publication attempts a rendered PNG preview and falls back to a placeholder if preview generation fails.
- Markdown publication preserves common inline formatting and nested structures through Atlassian's transformers, in addition to headings, lists, quotes, tables, code, and Mermaid fences.
- Full-page update tools replace the page body; they do not merge with existing content.
- Markdown publication reports Mermaid, embedded, and fallback block counts. A failed Mermaid block is preserved as source and does not stop the remaining document.

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

### An update reports an ambiguous embedding mode

The page contains multiple embedding modes and the request used `index` without a mode. Inspect the page, then use the diagram's `localId`, or repeat the update with the intended `embeddingMode`.

### An update reports that the target uses a different mode

The selector identified an existing diagram whose mode conflicts with the requested `embeddingMode`. Remove the override to let the server detect the mode, or select a diagram that already uses the requested mode. Updates do not convert between draw.io, SVG, and MacroPack.
