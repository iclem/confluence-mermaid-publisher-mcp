# SVG styles implementation plan

> Implement in this session using the executing-plans and test-driven-development skills.

**Goal:** Make a Codex-inspired SVG look the default and advertise selectable styles through MCP.

**Architecture:** Keep the existing adaptive SVG renderer and strict security. Add a shared named-style registry used by rendering and MCP schema descriptions; pass the optional `svgStyle` through the existing publication service.

**Tech Stack:** TypeScript, agentic-mermaid 0.4.1, xmldom, Zod, Vitest.

**Spec:** User-approved design in this chat: `codex` default, `github` preserves the current appearance; six MCP tools advertise both; automatic light/dark switching, authored colors and source remain intact.

## Global constraints

- Task type: implementation; workflow `.agent-kit/workflows/spec-to-code.md` v1.5.0.
- Reference: `publisher/src/svg.ts`, `publisher/src/mcp-app.ts`, existing SVG gallery and service tests.
- Work in `feat/svg-styles` in this checkout; preserve unrelated existing changes.
- No dependency additions, external publication, commits or pushes.
- Local versioned dependency documentation/types are available; Context7 is unavailable.
- Risk: font availability varies between viewers; style changes must not change Mermaid meaning or bypass strict rendering.
- Confirmation: approved; no additional confirmation needed for implementation.

## Review focus

- Explicit node and link colors must survive both palettes.
- Light and dark rendering must retain identical geometry.
- Selection must reach all six MCP tools and file-based service wrappers.
- Invalid styles must fail before external mutations; styles apply only to SVG.
- Unknown font faces must have usable local monospace fallbacks.

### Task 1: Named adaptive SVG styles

**Files:** `publisher/src/svg-style.ts` (new), `publisher/src/svg.ts`, `publisher/src/svg.test.ts`.
**Interface:** export `SVG_STYLES`, `SvgStyle`, style descriptions, and validated style resolution; `renderAdaptiveSvg(mermaid: string, svgStyle?: SvgStyle): RenderedSvg`.

- [x] Add tests for default appearance, legacy style, invalid style, source colors, geometry and strict security.
- [x] Run `npm --prefix publisher test -- src/svg.test.ts`; confirm new tests fail.
- [x] Implement shared styles using supported dependency style roles; preserve source semantics.
- [x] Run focused rendering tests; inspect reference diagram in both palettes.

### Task 2: MCP and publication contract

**Files:** `publisher/src/mcp-app.ts`, `publisher/src/service.ts`, corresponding test files, `README.md`, `doc/user-manual.md`.
**Interface:** optional `svgStyle: 'codex' | 'github'` on six MCP tools and matching service inputs. Omission uses `codex` for SVG; other modes remain unchanged.

- [x] Add failing schema and selection/validation tests at the MCP and service boundaries.
- [x] Advertise defaults and choices in the schemas, forward selection through Markdown wrappers and image creation, reject invalid style before writes.
- [x] Update SVG documentation with the style contract and examples.
- [x] Run publisher tests and TypeScript build; compare generated SVG with user reference.

## Validation decisions

- Run publisher suite and build: changed rendering and public tool/service inputs.
- Run direct browser visual inspection: appearance is the requested outcome.
- Parser/Java tests: not applicable; no parser or draw.io implementation changes.
- Confluence live publication: not applicable; user requested local renderer implementation.

## Progress

- Design approved. Source and dependency docs inspected. Existing checkout changes are outside this change's files.

- Complete: 98 publisher tests passed; TypeScript build and git diff --check passed. Both palettes inspected in the browser using the supplied diagram. Independent review found no actionable issues. Legacy and new previews preserve 13 nodes, 14 edges, their labels, and exact Mermaid source.
- Limitation: the installed font face and graph layout differ from the reference; this is a Codex-inspired style rather than a pixel-identical renderer.
