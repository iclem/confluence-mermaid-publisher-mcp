## ADDED Requirements

### Requirement: MCP tool names are generic across diagram embedding modes
The system SHALL expose Confluence Mermaid publishing tools with diagram-oriented names that do not hard-code draw.io in the MCP contract.

#### Scenario: Inspect diagrams on a page
- **WHEN** an MCP client lists or calls the page-inspection tool after this change
- **THEN** the tool name is generic to Confluence diagrams rather than draw.io-specific

#### Scenario: Create a new embedded diagram from Mermaid
- **WHEN** an MCP client calls the tool that inserts a Mermaid-derived diagram into an existing page
- **THEN** the tool name does not contain `drawio`
- **THEN** the tool accepts an optional `embeddingMode` argument

#### Scenario: Update an existing embedded diagram from Mermaid
- **WHEN** an MCP client calls the tool that updates an existing Mermaid-derived Confluence diagram
- **THEN** the tool name does not contain `drawio`
- **THEN** the tool accepts an optional `embeddingMode` argument

### Requirement: Tool results use generic diagram terminology while preserving mode-specific metadata
The system SHALL return inspection and publication results using generic diagram collections and selectors, and it SHALL preserve mode-specific details inside those results where needed for follow-up operations.

#### Scenario: Inspect a draw.io-backed page
- **WHEN** the inspection tool reads a page containing draw.io-backed diagrams
- **THEN** the result uses generic diagram terminology at the top level
- **THEN** it still includes draw.io-specific metadata such as attachment-facing names or custom-content identifiers for those entries

#### Scenario: Inspect a MacroPack-backed page
- **WHEN** the inspection tool reads a page containing MacroPack-backed diagrams
- **THEN** the result includes `embeddingMode: macropack`
- **THEN** it includes the selector metadata needed to target that MacroPack entry for update

### Requirement: Documentation and examples describe the generic tool surface and mode selection
The system SHALL update its user-facing documentation and checked-in examples to describe the renamed generic tools, the supported embedding modes, and the MacroPack default.

#### Scenario: Operator reads the quick-start guidance
- **WHEN** an operator follows the project quick-start or user manual after this change
- **THEN** the documentation shows the generic tool names
- **THEN** it explains that `macropack` is the default when no embedding mode is configured

#### Scenario: Operator needs draw.io-specific behavior
- **WHEN** an operator wants editable draw.io-backed publication after this change
- **THEN** the documentation explains how to select `drawio` through the default configuration or a per-tool override
