# Specification

## Purpose

Publish Markdown and Mermaid diagrams to Confluence through MacroPack.

## Requirements

### MacroPack Embedding

The system SHALL embed Mermaid diagrams as MacroPack Confluence extension nodes.

- Mermaid source SHALL be stored directly in MacroPack guest parameters.
- The system SHALL NOT generate `.drawio` files.
- The system SHALL NOT create draw.io attachments or draw.io custom content.

### Markdown Publication

The system SHALL publish Markdown documents to Confluence pages.

- Headings, paragraphs, blockquotes, lists, tables, rules, and generic code blocks SHALL map to ADF.
- Fenced Mermaid code blocks SHALL map to MacroPack extension nodes.
- Publication SHALL preserve the original Mermaid source.

### Diagram Updates

The system SHALL update existing MacroPack diagrams by:

- `localId`
- zero-based `index`
- sole-diagram inference when exactly one MacroPack diagram exists

When multiple MacroPack diagrams exist and no selector is provided, the system SHALL fail with a clear selector error.

### MCP Contract

The MCP contract SHALL expose generic Confluence Mermaid tools and SHALL NOT expose `embeddingMode`, draw.io file names, or draw.io custom-content selectors.
