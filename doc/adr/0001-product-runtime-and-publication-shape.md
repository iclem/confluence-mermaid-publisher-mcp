# ADR 0001: Product runtime and publication shape

- **Status:** Accepted
- **Date:** 2026-04-06

## Context

The product goal is not only to convert Mermaid into draw.io, but to do it in a form that works for automated documentation publishing:

1. convert Mermaid blocks into editable `.drawio` artifacts by default, with adaptive SVG and MacroPack alternatives
2. publish Markdown documents to Confluence
3. create or update draw.io, SVG, and MacroPack diagrams on those pages
4. support local and agent-driven usage through MCP
5. run the same way across Copilot, Codex, Claude, and Gemini

That combination makes the problem broader than "render Mermaid somehow" or "talk to Confluence somehow". The runtime has to own the full document-publication workflow, including fallback behaviour when a Mermaid block cannot be converted.

The workflow goal is equally important: teams should be able to author locally in Markdown, iterate in small file-based edits, and publish to Confluence only when the content is ready. That gives a faster feedback loop than treating Confluence as the primary editing surface, is easier to reproduce from source control, and is usually less token-expensive for LLM-driven editing because local file changes can be made in focused chunks instead of repeatedly fetching and rewriting large remote page bodies.

## Decision

We will:

1. use **Nasdanika `drawio`** as the draw.io generation backend
2. keep a **product-owned publisher + MCP server** on top of that generator
3. ship the runtime as **one Docker image** containing the Node and Java toolchains
4. expose both **stdio MCP** and **stateless Streamable HTTP MCP**
5. keep **direct Confluence HTTP** as the reference publication backend
6. support both **in-memory Markdown publication** and **file-based Markdown publication**
7. make **draw.io the default embedding mode**, while retaining adaptive SVG and MacroPack as server-wide or per-call choices

## Why use Nasdanika

Nasdanika is a good fit for the conversion backend because it already gives us a headless way to produce native draw.io documents from a model-driven generator.

That matters here because the required artifact boundary is not a rendered PNG or an editor session. It is an editable `.drawio` file that can be:

- attached to Confluence
- versioned and tested in automation
- updated in place on an existing draw.io widget
- regenerated deterministically from the same Mermaid input

Using Nasdanika also keeps the conversion backend separate from Confluence publication and MCP orchestration. The generator can stay focused on draw.io output while the product-owned publisher owns page creation, MacroPack ADF nodes, attachment updates, custom content, and fallback policy.

## Why not use the official Atlassian MCP tooling directly

The official Atlassian MCP tooling is useful for general Confluence and Jira operations, but it is not the right product boundary for this workflow.

The missing pieces are the draw.io-specific ones:

- no Mermaid-to-draw.io conversion
- no draw.io widget lifecycle abstraction
- no draw.io custom-content body management
- no product-owned Markdown publication flow with per-block conversion and fallback

It also does not solve the authoring-loop problem. Confluence-oriented tooling still tends to operate on large published page bodies, while this project is intentionally built around local Markdown as the source of truth and Confluence as the final publication target.

In other words, the official Atlassian tools expose general page and issue primitives, while this product needs a specialized publication workflow.

## Why not use `mcp-atlassian` as the core runtime

`mcp-atlassian` is still a generic Atlassian server. If we built the product around it, we would still need product-owned logic for:

- creating and updating draw.io attachments
- creating and updating draw.io custom content
- mutating page ADF to insert draw.io extension nodes
- choosing fallback behaviour when Mermaid conversion fails

That would leave us with two problems instead of one:

1. a broad external MCP surface we do not control
2. a second product layer that still has to own the draw.io workflow anyway

`mcp-atlassian` can remain an optional future adapter where it helps, but it is not the right core runtime contract.

## Why not use draw.io MCP, draw.io Desktop, or draw.io CLI

The draw.io user interface can import Mermaid, but that is an editor capability, not the automation contract we need.

The rejected options are not good primary backends for this product because they are too editor-centric or export-centric:

- **draw.io UI / desktop import** depends on the editor flow being in the loop
- **draw.io CLI / desktop export paths** are good at exporting existing `.drawio` files, but not a stable, documented headless Mermaid-to-`.drawio` generation contract for CI-oriented automation
- **draw.io MCP** is useful for opening or previewing diagrams in draw.io, but not as a proven deterministic backend for non-interactive Markdown publication

The product needs a backend that can generate `.drawio` artifacts without opening an editor and without requiring a human to finish the conversion.

draw.io is still the right published diagram format because Confluence does not offer satisfactory Mermaid support for this workflow. Teams need diagrams that are reliable inside Confluence pages, editable after publication, and compatible with the installed draw.io app. That is why Mermaid is treated as an authoring format and draw.io as the publication format.

## Why not use Mermaid's npm library as the primary backend

The Mermaid npm ecosystem is valuable for parsing and rendering Mermaid, but it is not the artifact contract this product needs.

The main mismatch is that the product needs:

- native `.drawio` output
- deterministic identifiers and layout decisions
- explicit control over supported syntax and fallback behaviour
- a backend that stays stable inside Docker and CI

Mermaid's own libraries are optimized around Mermaid parsing and rendering, often with browser-oriented assumptions. They do not remove the need for a product-owned mapping layer from Mermaid concepts to draw.io widget-ready artifacts.

## Why Docker

Docker is part of the design, not just packaging convenience.

It solves several problems at once:

- the runtime needs both **Node.js** and **Java 21**
- agents and operators need one repeatable installation story
- the MCP server should behave the same in local development and in hosted agent environments
- Confluence publishing needs a controlled environment for credentials and dependencies

The tradeoff is that file-based publication must respect container path visibility. That is acceptable because it is explicit and documentable, and it avoids pushing large Markdown files through the agent context when the file already exists on disk.

## Additional runtime decisions

### Stateless HTTP MCP

The HTTP transport is implemented as a **stateless Streamable HTTP MCP endpoint**. That matches the way current agent hosts call HTTP MCP servers more reliably than a sessionful transport.

### File-based Markdown publication

The MCP server exposes both:

- `create_confluence_page_from_markdown`
- `create_confluence_page_from_markdown_file`
- `update_confluence_page_from_markdown`
- `update_confluence_page_from_markdown_file`

The file-based variant exists to reduce token usage and avoid forcing agents to load full Markdown bodies into model context before publishing.

### Configurable embedding modes

Draw.io is the default because it produces editable `.drawio` attachments and is the project's primary artifact path. Adaptive SVG provides a diagram-app-free native image with light/dark styling, while MacroPack embeds Mermaid source directly when the compatible app is installed. The server-level default can be changed with `CONFLUENCE_DEFAULT_EMBEDDING_MODE`, and publication calls can override it explicitly. Existing-diagram updates detect the target mode where possible and reject contradictory overrides instead of silently migrating content.

## Consequences

### Positive

- one product-owned MCP surface for the real workflow users care about
- deterministic `.drawio` artifact generation
- native adaptive SVG and direct Mermaid embedding alternatives when draw.io is not desired
- clean separation between parser, generator, publisher, and transport
- provider-neutral packaging
- efficient publication of large Markdown files

### Negative

- the product owns draw.io widget lifecycle details directly
- MacroPack operation depends on the target tenant having the compatible app installed
- file-based publication requires the Markdown path to exist inside the container
- draw.io preview rendering can fall back to a placeholder when rendering fails

## Revisit conditions

Revisit this ADR if any of the following become true:

1. an external tool proves a stable headless Mermaid-to-`.drawio` contract with automation-grade behaviour
2. Atlassian tooling gains first-class draw.io widget lifecycle operations
3. the product scope broadens from draw.io publication into generic Confluence automation
4. the Docker runtime becomes a deployment constraint rather than an enabler
