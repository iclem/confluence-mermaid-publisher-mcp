## ADDED Requirements

### Requirement: Confluence Mermaid publication supports configurable embedding modes
The system SHALL support `macropack` and `drawio` as Confluence Mermaid embedding modes for page publication and single-diagram creation, and it SHALL resolve one effective mode for each request from the explicit tool argument when provided or from the server default otherwise.

#### Scenario: Default to MacroPack when no mode is configured
- **WHEN** the MCP server starts without an embedding-mode configuration and a Mermaid publishing tool is called without an `embeddingMode` argument
- **THEN** the request is processed using `macropack`

#### Scenario: Honor the configured server default
- **WHEN** the MCP server is configured with a default embedding mode of `drawio` or `macropack` and a Mermaid publishing tool is called without an `embeddingMode` argument
- **THEN** the request is processed using the configured default mode

#### Scenario: Honor a per-request embedding mode override
- **WHEN** a Mermaid publishing or update tool call provides an explicit `embeddingMode`
- **THEN** the server uses that mode for the request instead of the configured default

### Requirement: MacroPack embedding stores Mermaid directly in the page extension
The system SHALL create Confluence MacroPack Mermaid embeddings using a Confluence ecosystem extension whose parameters carry the Mermaid source and required MacroPack metadata directly in the page ADF.

#### Scenario: Create a MacroPack diagram from Mermaid
- **WHEN** a Mermaid publishing request resolves to `macropack`
- **THEN** the published page content includes a MacroPack ecosystem extension node
- **THEN** that extension stores the Mermaid source in its guest parameters instead of requiring draw.io attachments or draw.io custom content

#### Scenario: Publish Markdown with Mermaid blocks in MacroPack mode
- **WHEN** Markdown publication processes Mermaid blocks with an effective embedding mode of `macropack`
- **THEN** each successfully embedded Mermaid block is represented as a MacroPack extension in the page body
- **THEN** the publication does not create draw.io attachments for those MacroPack blocks

### Requirement: Draw.io embedding remains available as an alternate mode
The system SHALL preserve the existing draw.io-backed Confluence publication behavior when a request resolves to `drawio`.

#### Scenario: Create a draw.io-backed diagram explicitly
- **WHEN** a Mermaid publishing request resolves to `drawio`
- **THEN** the server converts Mermaid to `.drawio`
- **THEN** it uploads the diagram and preview attachments, creates or updates draw.io custom content, and inserts a draw.io extension into the page

#### Scenario: Publish Markdown with Mermaid blocks in draw.io mode
- **WHEN** Markdown publication processes Mermaid blocks with an effective embedding mode of `drawio`
- **THEN** each successfully converted block is embedded as a draw.io extension
- **THEN** the published content includes the visible expand block containing the original Mermaid source

### Requirement: Embedded diagram inspection and update work for both supported modes
The system SHALL inspect embedded Confluence diagrams across both supported embedding modes, and it SHALL support in-place updates for diagrams whose current embedded mode matches the requested update mode.

#### Scenario: Inspect a page with mixed diagram modes
- **WHEN** a page contains any combination of MacroPack and draw.io Mermaid embeddings
- **THEN** the inspection result identifies each embedded diagram and its `embeddingMode`
- **THEN** the result includes the selector metadata needed to target later updates

#### Scenario: Update an existing MacroPack embedding
- **WHEN** an update tool targets an existing MacroPack diagram and the effective embedding mode is `macropack`
- **THEN** the matching MacroPack extension is updated in page ADF with the new Mermaid source

#### Scenario: Update an existing draw.io embedding
- **WHEN** an update tool targets an existing draw.io diagram and the effective embedding mode is `drawio`
- **THEN** the server updates the existing draw.io-backed embedding in place using the existing attachment and custom-content workflow
