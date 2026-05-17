## Context

The current publisher is built around one Confluence embedding implementation: Mermaid is converted to `.drawio`, uploaded as attachments, mirrored into draw.io custom content, and inserted into the page as a draw.io ecosystem extension. The MCP layer mirrors that implementation detail directly through tool names such as `create_confluence_drawio_widget_from_mermaid` and `inspect_confluence_drawio_page`.

The requested product behavior changes that assumption. A sample Confluence page now demonstrates a valid MacroPack ecosystem extension whose guest parameters carry Mermaid source directly in the page ADF rather than pointing at draw.io attachments and custom content. At the same time, the existing draw.io flow must remain available because it still provides editable `.drawio` artifacts and supports the current Markdown publication pipeline.

Constraints:
- The runtime already uses environment variables as its operator configuration surface, so the default embedding mode should follow that pattern.
- Existing draw.io publication behavior must remain available without changing the converter or the Nasdanika-backed generator.
- Tool names and result payloads need to become mode-neutral without losing the ability to inspect and update existing draw.io-backed pages.
- The first slice should minimize destructive Confluence operations because the current client does not support deleting attachments or custom content.

## Goals / Non-Goals

**Goals:**
- Support `macropack` and `drawio` as first-class Confluence embedding modes for Mermaid publication.
- Default the server to `macropack` when no explicit embedding-mode configuration is provided.
- Allow every Mermaid-aware MCP tool to override the embedding mode per request.
- Rename draw.io-specific MCP tools to generic diagram-oriented names that remain accurate across both modes.
- Preserve current draw.io behavior for operators who explicitly choose `drawio`.
- Make page inspection and update logic capable of recognizing both draw.io and MacroPack embeddings.

**Non-Goals:**
- Replacing the existing Mermaid-to-draw.io converter or removing draw.io artifact generation.
- Supporting arbitrary Confluence diagram apps beyond draw.io and MacroPack in this change.
- Cleaning up legacy draw.io attachments or custom content when a page is switched to MacroPack.
- Reworking the low-level Confluence client into a full CRUD client for every attachment or custom-content lifecycle operation.

## Decisions

### 1. Model embedding mode as a product-level enum with env-based default plus per-tool overrides

The publisher will introduce a shared embedding-mode concept with two supported values: `macropack` and `drawio`. `createPublisherService` will read a new environment variable for the default mode and fall back to `macropack` when unset. Every Mermaid-aware MCP tool will accept an optional `embeddingMode` argument that overrides the server default for that call.

This keeps the operator contract consistent with the existing `CONFLUENCE_*` runtime configuration style while giving agents explicit control where needed.

**Why this approach:** it matches the server's current configuration model and avoids forcing callers to pass the mode on every request just to get the new default.

**Alternatives considered:**
- Only per-tool arguments, no server default. Rejected because the request explicitly asks for a configurable default mode and because repeating the same mode in every tool call is noisy.
- A file-based config object or CLI-only setting. Rejected because the MCP runtime is already environment-driven in stdio, HTTP, and Docker helper flows.

### 2. Split Confluence embedding behavior into mode-specific adapters behind one publisher service

The current draw.io helper module combines draw.io-specific constants, ADF construction, extension discovery, and metadata updates. The change will introduce a mode-neutral publisher path that delegates mode-specific work to dedicated embedding helpers.

The draw.io helper remains responsible for attachments, draw.io custom content, and draw.io extension nodes. A new MacroPack helper will build and detect the Forge extension structure observed on the sample page: `extensionKey`/`extensionId` for MacroPack, `extensionTitle` of `Macro Pack`, Mermaid source stored in `parameters.guestParams.source.text`, and MacroPack options stored inside `parameters.guestParams.options.mermaid`.

**Why this approach:** it keeps the existing draw.io path largely intact while isolating MacroPack-specific ADF rules instead of scattering `if (mode === ...)` branches through Markdown publication and widget updates.

**Alternatives considered:**
- Collapse both modes into the existing `drawio.ts` helper. Rejected because the module name and abstractions are already tightly coupled to draw.io concepts like attachments and custom content.
- Build two separate services. Rejected because page publication, Markdown parsing, and client wiring remain shared concerns.

### 3. Standardize the external MCP contract on generic “diagram” tools while preserving mode-specific behavior internally

Tools whose names currently contain `drawio` will be renamed to generic diagram names, for example inspection, create-from-Mermaid, and update-from-Mermaid operations. Their descriptions and schemas will expose `embeddingMode` explicitly, and their result payloads will move from draw.io-only fields to generic diagram collections that can still include mode-specific details.

For inspection, the response should identify each discovered embedded diagram with its mode, selector information, and mode-specific metadata. Draw.io entries will continue surfacing attachment/custom-content identifiers. MacroPack entries will surface the local ID and enough guest-parameter metadata to target updates deterministically.

**Why this approach:** the tool surface should describe the user intent, not the current implementation backend. Generic names are required once MacroPack is the default.

**Alternatives considered:**
- Keep old tool names and add separate MacroPack tools. Rejected because it makes the default path semantically misleading and duplicates the workflow surface.
- Hide the mode entirely and infer it from page state. Rejected because create flows need an explicit choice and updates may need to switch behavior for new diagrams.

### 4. Keep Markdown publication semantics the same, but choose the embedded output per Mermaid block from the resolved mode

The Markdown publishing flow will continue parsing Markdown into block-level ADF content and preserving the current fallback behavior when Mermaid conversion or embedding fails. The difference is what gets inserted for successful Mermaid blocks.

- In `drawio` mode, the behavior stays the same: convert Mermaid to `.drawio`, upload artifacts, create draw.io custom content, insert a draw.io extension, and append the expand block containing the original Mermaid source.
- In `macropack` mode, the publisher inserts a MacroPack extension whose guest parameters carry the Mermaid source directly. No draw.io attachments or custom content are created for that block.

The expand block with original Mermaid source should remain present in draw.io mode only, because MacroPack already stores Mermaid source directly in the embedded macro and the request does not require duplicate visible source blocks there.

**Why this approach:** it keeps the existing draw.io publication output stable while making the MacroPack output match the target page contract rather than pretending it still depends on draw.io artifacts.

**Alternatives considered:**
- Always create draw.io artifacts even in MacroPack mode. Rejected because it undermines the intent of a true MacroPack default and creates unnecessary side effects.
- Always add the visible Mermaid expand block in both modes. Rejected because it duplicates the MacroPack source and changes page appearance without a stated need.

### 5. Scope update behavior to same-mode updates and generic selection in the first slice

Update operations will support selecting an existing embedded diagram generically, then updating it according to its current mode or an explicitly requested mode when that mode matches the targeted embed type. Draw.io updates keep using attachment/custom-content replacement. MacroPack updates rewrite the matching extension node in page ADF with the new Mermaid source and updated presentation options.

Cross-mode replacement on an existing page is intentionally out of scope for this change because the current Confluence client cannot delete stale draw.io attachments or custom content, and the request does not require a cleanup strategy for switching an existing widget from one backing model to another.

**Why this approach:** it provides a safe first slice with deterministic updates while avoiding partial cleanup behavior that would leave confusing residual artifacts.

**Alternatives considered:**
- Allow arbitrary mode switching in update flows. Rejected for now because it would strand draw.io backing content or require new destructive client operations that do not exist today.

## Risks / Trade-offs

- [Generic tool renames break existing MCP clients] → Mitigation: document the rename clearly in the change artifacts and implementation docs, and update all checked-in examples in the same change.
- [MacroPack ADF assumptions diverge across Confluence tenants or app versions] → Mitigation: anchor the first implementation to the inspected sample page contract and add tests for the observed extension structure.
- [Mixed-mode inspection payloads become harder to read] → Mitigation: use explicit `embeddingMode` fields and keep mode-specific metadata grouped rather than flattening unrelated keys.
- [Users expect update calls to switch an existing diagram from draw.io to MacroPack] → Mitigation: state the same-mode-only update scope in docs and require create/republish flows for cross-mode changes in the first slice.
- [MacroPack mode removes editable `.drawio` artifacts that some workflows relied on implicitly] → Mitigation: keep `drawio` as an explicit per-request and server-level option, and make the default configurable.

## Migration Plan

1. Add the shared embedding-mode model and server default configuration parsing.
2. Introduce mode-specific embedding helpers plus generic inspection/update result types.
3. Rename MCP tools to generic diagram names and thread `embeddingMode` through their schemas and handlers.
4. Update Markdown publication to resolve the effective mode per call and emit either MacroPack or draw.io embeddings.
5. Update tests, README, and operator guides to explain the new default, the per-tool override, and the renamed tools.

Rollback is straightforward: restore the draw.io-only tool surface and remove the MacroPack helper path. Because the change is additive at the data-model level and avoids destructive cleanup, reverting the code does not require Confluence-side rollback steps.

## Open Questions

None for the first slice. If users later need in-place switching between draw.io and MacroPack for existing page content, that should be handled as a follow-up change with explicit cleanup semantics for stale attachments and custom content.
