# Mermaid Coverage

This repository no longer parses Mermaid into an intermediate rendering model. Mermaid support is delegated to MacroPack in Confluence.

The publisher treats Mermaid blocks as source text and stores that source in MacroPack extension nodes. Syntax coverage, rendering details, and diagram-family support therefore depend on the MacroPack app installed in the target Confluence site.

Repository-owned coverage is limited to:

| Surface | Status |
| --- | --- |
| Markdown fenced `mermaid` block detection | supported |
| MacroPack extension creation | supported |
| MacroPack extension inspection | supported |
| MacroPack source update by `localId` | supported |
| MacroPack source update by index | supported |
| Mermaid syntax validation | delegated to MacroPack |
| Diagram rendering | delegated to MacroPack |
