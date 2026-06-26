# Confluence Mermaid Publisher MCP

`confluence-mermaid-publisher-mcp` is an MCP server for publishing locally authored Markdown to Confluence while embedding Mermaid diagrams with MacroPack.

The runtime stores Mermaid source directly in Confluence page ADF as MacroPack extension nodes. There is no Mermaid-to-draw.io conversion path, no Java generator, and no `embeddingMode` selection.

## What It Does

- publish Markdown content to new or existing Confluence pages
- embed fenced Mermaid blocks as MacroPack diagrams
- create or update individual MacroPack Mermaid diagrams on a page
- inspect MacroPack diagrams already present on a page
- run as stdio MCP, Streamable HTTP MCP, Docker, or a local publisher CLI

## Requirements

- Node.js 22 for local development
- Docker for containerized MCP usage
- Confluence Cloud credentials
- MacroPack installed in the target Confluence site

## Configuration

Set either direct Confluence variables:

```bash
export CONFLUENCE_BASE_URL="https://your-site.atlassian.net"
export CONFLUENCE_EMAIL="you@example.com"
export CONFLUENCE_API_TOKEN="..."
```

or a bearer token:

```bash
export CONFLUENCE_BASE_URL="https://your-site.atlassian.net"
export CONFLUENCE_BEARER_TOKEN="..."
```

Copilot-style fallback variables are also accepted:

- `COPILOT_MCP_CONFLUENCE_URL`
- `COPILOT_MCP_CONFLUENCE_USERNAME`
- `COPILOT_MCP_CONFLUENCE_API_TOKEN`

## Local MCP

Build the image:

```bash
make image-mcp
```

Run stdio MCP with the current workspace mounted at the same absolute path:

```bash
./scripts/confluence-mermaid-mcp.sh
```

Run the HTTP MCP server:

```bash
make mcp-http
```

## Development

```bash
npm --prefix publisher ci
npm --prefix publisher test
npm --prefix publisher run check
```

or through Docker:

```bash
make test
```

## MCP Tools

- `inspect_confluence_page_diagrams`
- `create_confluence_diagram_from_mermaid`
- `update_confluence_diagram_from_mermaid`
- `append_confluence_page_paragraph`
- `create_confluence_page_from_markdown`
- `create_confluence_page_from_markdown_file`
- `update_confluence_page_from_markdown`
- `update_confluence_page_from_markdown_file`

Update selectors for existing diagrams are MacroPack-only: use `localId`, `index`, or omit both when the page contains exactly one MacroPack diagram.
