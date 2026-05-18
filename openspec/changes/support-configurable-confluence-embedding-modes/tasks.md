## 1. Embedding mode configuration and shared types

- [x] 1.1 Add a shared embedding-mode model with supported values `macropack` and `drawio`, plus generic embedded-diagram result types that can represent both modes.
- [x] 1.2 Read the server default embedding mode from runtime configuration, validate supported values, and fall back to `macropack` when the configuration is absent.
- [x] 1.3 Thread an optional `embeddingMode` override through every Mermaid-aware MCP tool and publisher entrypoint so each request resolves one effective mode.

## 2. Mode-specific Confluence embedding behavior

- [x] 2.1 Keep the existing draw.io embedding flow behind a mode-specific helper without changing the current attachment, custom-content, and ADF behavior for explicit `drawio` requests.
- [x] 2.2 Add MacroPack ADF helper logic that can build, detect, select, and update MacroPack Mermaid extensions using the observed Forge extension contract.
- [x] 2.3 Update Markdown publication and single-diagram creation flows to insert MacroPack extensions in `macropack` mode and draw.io extensions in `drawio` mode while preserving the existing Mermaid fallback behavior.
- [x] 2.4 Update page inspection and in-place update flows so they report both supported embedding modes and support same-mode updates for existing MacroPack and draw.io diagrams.

## 3. Generic MCP contract and documentation

- [x] 3.1 Rename all MCP tools whose names contain `drawio` to generic diagram-oriented names and update their descriptions and schemas accordingly.
- [x] 3.2 Update MCP responses, README content, and operator guides to use generic diagram terminology while documenting the MacroPack default and the draw.io override path.

## 4. Regression coverage

- [x] 4.1 Add or update unit tests for embedding-mode configuration resolution, generic tool registration, and validation of unsupported configuration values.
- [x] 4.2 Add publisher tests that cover MacroPack embedding creation, MacroPack inspection/update, draw.io regression behavior under explicit `drawio` mode, and mixed-mode inspection payloads.
