# User Manual

This server publishes Markdown to Confluence and embeds Mermaid source with MacroPack. It is designed for local authoring: edit Markdown in your workspace, then publish the finished page through MCP.

## Supported Workflow

1. Author Markdown locally.
2. Put diagrams in fenced code blocks with language `mermaid`.
3. Publish to Confluence with a Markdown MCP tool.
4. The server writes each Mermaid block into a MacroPack extension in the page ADF.

## Tools

| Tool | Purpose |
| --- | --- |
| `inspect_confluence_page_diagrams` | Inspect MacroPack diagrams and page attachments |
| `create_confluence_diagram_from_mermaid` | Add one MacroPack Mermaid diagram to a page |
| `update_confluence_diagram_from_mermaid` | Update an existing MacroPack Mermaid diagram |
| `append_confluence_page_paragraph` | Append plain text to a page |
| `create_confluence_page_from_markdown` | Create a page from Markdown content |
| `create_confluence_page_from_markdown_file` | Create a page from a Markdown file path |
| `update_confluence_page_from_markdown` | Replace an existing page from Markdown content |
| `update_confluence_page_from_markdown_file` | Replace an existing page from a Markdown file path |

## Diagram Updates

Use `localId` when you have it from inspection. Use `index` when the page ordering is stable. Omit both only when the page contains exactly one MacroPack diagram.

The update tool does not accept draw.io names, custom-content IDs, or an embedding-mode override.

## File Paths

File-based tools read files from the MCP server host. The Docker stdio wrapper mounts the active workspace at the same absolute path:

```bash
./scripts/confluence-mermaid-mcp.sh
```

When running HTTP mode manually, mount the workspace yourself if you plan to use file-based tools.

## Local CLI

After building the publisher package:

```bash
npm --prefix publisher run build
node publisher/dist/cli.js inspect-page --base-url "$CONFLUENCE_BASE_URL" --email "$CONFLUENCE_EMAIL" --api-token "$CONFLUENCE_API_TOKEN" --page-id 123456
```
