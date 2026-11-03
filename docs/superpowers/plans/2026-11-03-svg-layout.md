# Selectable SVG layout implementation plan

Goal: expose svgLayout independently of svgStyle, default to ELK, and render both diagrams from the requested Confluence page as github + elk.

Architecture: reuse measured shapes and labels from Agentic Mermaid, then apply direct layered ELK placement to flowcharts and reposition the existing SVG elements. Merge adaptive paints before placement so light and dark geometry stays identical. Retain the previous pipeline as agentic. Other diagram families keep their native layouts.

Ruling: use the existing transitive elkjs package directly rather than adding a browser renderer — the user explicitly requires a light image with no unnecessary dependencies. Direct declaration adds zero package entries to the lockfile; Dockerfile stays unchanged. Tradeoff: this is not pixel-identical to Codex or the official Mermaid renderer.

Task type: changes-to-pr. Branch: feat/selectable-svg-styles, existing PR 24. No Confluence writes; private page sources and rendered artifacts remain outside git.

Checks: real renderer tests across styles/layouts and gallery families; directions, groups, parallel edges, loops, invisible links, explicit colors, metadata and security; MCP schema/forwarding; publisher suite and build; render and inspect both page diagrams.

- [x] Add layout/schema tests (initial failures observed before implementation).
- [x] Implement browserless ELK adapter, async SVG pipeline, and MCP/service forwarding.
- [x] Update documentation and verify both page diagrams visually.
- [x] Final review, full suite and build: 112 tests pass; TypeScript build and diff checks pass.

Final: fixed nested group transforms, isolated group direction, group title sizing, invisible link matching and synthetic ID collisions — regression probes failed before fixes and pass after; suite 112/112.
- [ ] Commit, push and update PR 24 with validation and provenance.
