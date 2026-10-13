# confluence-mermaid-publisher-mcp

`confluence-mermaid-publisher-mcp` is an MCP server for publishing locally authored Markdown to Confluence while embedding Mermaid diagrams as Confluence diagrams. Draw.io is the default embedding mode for editable `.drawio` artifacts. Adaptive SVG is opt-in, and MacroPack remains available.

Migration note: older MCP registrations may still refer to this server as `drawio-confluence-mcp` and to the previous draw.io-specific tool names. Update those registrations to use the `confluence-mermaid-publisher` server name and the generic Confluence diagram tool names.

The intended workflow is:

1. author and iterate locally in Markdown
2. keep that Markdown as the reproducible source of truth
3. publish the final result to Confluence

This gives a faster editing loop than using Confluence as the primary authoring surface, usually uses fewer model tokens during iterative edits, and avoids relying on Confluence's limited Mermaid support by publishing through draw.io, adaptive SVG, or MacroPack.

## What it does

- publish Markdown documents to Confluence
- embed Mermaid blocks as draw.io diagrams, adaptive SVG images, or MacroPack macros during publication
- create a Confluence diagram from Mermaid on an existing page
- update an existing embedded Confluence diagram in place
- inspect diagrams already present on a page

The server currently exposes eight workflow-oriented tools:

| Workflow | Tools |
| --- | --- |
| Inspect | `inspect_confluence_page_diagrams` |
| Publish a new page | `create_confluence_page_from_markdown`, `create_confluence_page_from_markdown_file` |
| Republish a page | `update_confluence_page_from_markdown`, `update_confluence_page_from_markdown_file` |
| Manage one diagram | `create_confluence_diagram_from_mermaid`, `update_confluence_diagram_from_mermaid` |
| Small text edit | `append_confluence_page_paragraph` |

Mermaid-to-draw.io conversion covers flowcharts, sequence diagrams, state diagrams, Gantt charts, and `xychart-beta`, with varying feature depth. See [`doc/coverage-matrix.md`](doc/coverage-matrix.md) before relying on a specific Mermaid construct.

## Markdown formatting and page width

Markdown is converted with Atlassian's official Markdown and JSON transformers. Links, strikethrough (`~~text~~`), bold, italic, inline code, nested lists, blockquotes and tables retain their ADF formatting. Mermaid code blocks are replaced in place with the selected diagram mode; failures retain their source. Raw HTML is treated as text. Relative document links are not automatically mapped to Confluence pages, and Markdown image URLs are not uploaded as local attachments.

All four Markdown MCP tools accept `pageWidth: "full-width" | "default"`. Here `default` means Confluence's centered, fixed-width column, not “use the configured default”. New pages resolve width in this order: explicit call, `CONFLUENCE_DEFAULT_PAGE_WIDTH`, then `full-width`. Updates preserve existing width when neither a call override nor an environment override is present.

```json
{
  "pageId": "123456",
  "markdownFile": "/workspace/docs/architecture.md",
  "pageWidth": "full-width"
}
```

Set `CONFLUENCE_DEFAULT_PAGE_WIDTH=full-width` to apply wide layout to all Markdown publications, including updates. Set it to `default` for a centered column. The CLI equivalents are `--page-width full-width` and `--page-width default`. Pass the environment variable into Docker with `-e CONFLUENCE_DEFAULT_PAGE_WIDTH`; the local stdio helper and Compose services forward it automatically.

Width is applied to both Confluence editor and published appearance properties after content publication. Existing matching properties are left untouched. If a property update fails, the tool reports that the content was already published; a partial property update is possible, and blindly retrying page creation can create duplicates. Single-diagram tools do not change page width.

## Opt-in adaptive SVG

Set `"embeddingMode": "svg"` on the Mermaid diagram or Markdown MCP tools. For example:

```json
{
  "pageId": "123456",
  "diagramName": "rollout.svg",
  "mermaid": "flowchart LR\nStart --> Done",
  "embeddingMode": "svg"
}
```

SVG uses Agentic Mermaid 0.4.1 locally on Node.js 22+, bypassing the Java/draw.io converter. No rendering service or Confluence diagram app is required for this mode. Each SVG contains `github-light` colors plus `github-dark` overrides selected by `prefers-color-scheme`; explicit colors in the source remain unchanged. Theme switching depends on the browser's scheme for embedded images and is not guaranteed to track Confluence's theme setting.

The SVG is a native image attachment, not an editable draw.io widget. Original Mermaid is preserved in SVG metadata; Markdown publication also adds an expandable source block. Inspection returns `embeddingMode: "svg"`, the filename, dimensions, and a stable attachment ID as `localId`. Use that `localId` to update the image; its attachment version and media reference are refreshed. Renaming or changing embedding modes during a diagram update is not supported. On mixed pages, select by `localId`, or supply both `index` and `embeddingMode`.

All Markdown tools support SVG, including file-based tools. The CLI's Markdown commands accept `--embedding-mode svg`. Invalid or unsupported Mermaid blocks retain the existing per-block source fallback; single-diagram failures return an error. Sources are not silently rewritten to accommodate renderer gaps.

Known Agentic Mermaid limitations from the gallery: composite state layout can overlap labels, state class colors may be absent, and sequence activation placement can differ from Mermaid. Gantt and XY charts render, but success on these examples does not imply full Mermaid compatibility. Explicit light source colors may have poor contrast in dark mode. If light and dark renders disagree on geometry or content, adaptive rendering fails rather than publishing mismatched diagrams.

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

The local stdio helper forwards both supported direct Confluence credential variables and the Copilot-style fallback credential variables into the container.

The server accepts `CONFLUENCE_DEFAULT_EMBEDDING_MODE=drawio|svg|macropack`; when unset, it defaults to `drawio`. Individual publication and diagram calls can override the default with `embeddingMode`. The checked-in helper and Compose services currently do not forward this environment variable, so use a per-call override or the raw Docker form below to configure a different default.

Run local Docker stdio from the workspace you want mounted:

```bash
./scripts/confluence-drawio-mcp.sh
```

If your MCP client launches the server from another directory, point the helper at the workspace explicitly:

```bash
CONFLUENCE_MERMAID_PUBLISHER_MCP_WORKSPACE=/absolute/path/to/your-project \
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
  -e CONFLUENCE_DEFAULT_EMBEDDING_MODE \
  -e CONFLUENCE_DEFAULT_PAGE_WIDTH \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  confluence-mermaid-publisher-mcp:local mcp-http
```

Or use the development compose service:

```bash
docker compose -f build/docker-compose/docker-compose-local.yml up mcp-http
```

The checked-in helper and Compose services use the built-in `drawio` default because they do not forward `CONFLUENCE_DEFAULT_EMBEDDING_MODE`. They do forward `CONFLUENCE_DEFAULT_PAGE_WIDTH`.

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
- `doc/spec.md` - implemented MCP, publication, conversion, and runtime contracts
- `doc/coverage-matrix.md` - exact Mermaid syntax coverage and limitations
- `doc/development.md` - development workflow and packaged layout
- `doc/adr/0001-product-runtime-and-publication-shape.md` - key design rationale
