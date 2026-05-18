import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfluenceClient } from "./confluence-client.js";
import { getDefaultEmbeddingMode } from "./embedding-mode.js";
import { DrawioPublisherService } from "./service.js";
import { EMBEDDING_MODES } from "./types.js";

function getConfluenceSetting(primary: string, fallback?: string): string | undefined {
  const primaryValue = process.env[primary]?.trim();
  if (primaryValue) {
    return primaryValue;
  }

  const fallbackValue = fallback ? process.env[fallback]?.trim() : undefined;
  return fallbackValue || undefined;
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function formatMarkdownFileNotFoundMessage(markdownFile: string): string {
  return (
    `Markdown file not found: ${markdownFile}. The path must exist on the MCP server host. ` +
    `If the server runs in Docker, bind-mount the active workspace into the container at the same absolute path ` +
    `(local Docker stdio mode depends on this workspace-aware mount), ` +
    `or use the non-file Markdown tool and send the Markdown content directly.`
  );
}

function withMarkdownFileHint<T>(markdownFile: string, operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    if (isFileNotFoundError(error)) {
      throw new Error(formatMarkdownFileNotFoundMessage(markdownFile));
    }

    throw error;
  });
}

export function createPublisherService(): DrawioPublisherService {
  const baseUrl = getConfluenceSetting("CONFLUENCE_BASE_URL", "COPILOT_MCP_CONFLUENCE_URL");
  const email = getConfluenceSetting("CONFLUENCE_EMAIL", "COPILOT_MCP_CONFLUENCE_USERNAME");
  const apiToken = getConfluenceSetting("CONFLUENCE_API_TOKEN", "COPILOT_MCP_CONFLUENCE_API_TOKEN");
  const bearerToken = process.env.CONFLUENCE_BEARER_TOKEN;
  const defaultEmbeddingMode = getDefaultEmbeddingMode();

  if (!baseUrl) {
    throw new Error("Missing CONFLUENCE_BASE_URL or COPILOT_MCP_CONFLUENCE_URL");
  }

  return new DrawioPublisherService(
    new ConfluenceClient({
      baseUrl,
      bearerToken,
      email,
      apiToken,
    }),
    undefined,
    defaultEmbeddingMode,
  );
}

function textResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "confluence-mermaid-publisher",
    version: "0.1.0",
  });
  const embeddingModeGuidance =
    "Omit this field to use the server default embedding mode. Only set it when the user explicitly requests a non-default mode such as macropack or drawio. When omitted, the server uses its configured default; if that is unset, it falls back to macropack.";
  const embeddingModeSchema = z.enum(EMBEDDING_MODES).optional().describe(
    `Optional Mermaid embedding mode override. ${embeddingModeGuidance}`,
  );
  const defaultEmbeddingModeToolGuidance =
    "Omit embeddingMode to use the server default. Only set it when the user explicitly requests a non-default mode.";

  server.tool(
    "inspect_confluence_page_diagrams",
    "Inspect Confluence page diagrams, attachments, and draw.io custom content.",
    {
      pageId: z.string().describe("Confluence page ID."),
    },
    async ({ pageId }) => {
      const service = createPublisherService();
      return textResult(await service.inspectPage(pageId));
    },
  );

  server.tool(
    "create_confluence_diagram_from_mermaid",
    `Create a new embedded Confluence diagram from Mermaid. ${defaultEmbeddingModeToolGuidance}`,
    {
      pageId: z.string().describe("Target Confluence page ID."),
      diagramName: z.string().optional().describe("Optional diagram file name for draw.io mode, typically ending in .drawio."),
      mermaid: z.string().describe("Mermaid diagram source."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for the page."),
      anchorText: z.string().optional().describe("Optional text anchor. The widget is inserted immediately after the first matching text inside a paragraph."),
      embeddingMode: embeddingModeSchema,
    },
    async ({ pageId, diagramName, mermaid, spaceKey, anchorText, embeddingMode }) => {
      const service = createPublisherService();
      return textResult(
        await service.createDiagramFromMermaid({
          pageId,
          diagramName,
          mermaid,
          spaceKey,
          anchorText,
          embeddingMode,
        }),
      );
    },
  );

  server.tool(
    "append_confluence_page_paragraph",
    "Append a plain-text paragraph to an existing Confluence page.",
    {
      pageId: z.string().describe("Target Confluence page ID."),
      text: z.string().describe("Paragraph text to append."),
    },
    async ({ pageId, text }) => {
      const service = createPublisherService();
      return textResult(await service.appendPageParagraph({ pageId, text }));
    },
  );

  server.tool(
    "create_confluence_page_from_markdown",
    `Create a Confluence page from Markdown content. ${defaultEmbeddingModeToolGuidance} Mermaid blocks fall back per block when embedding fails.`,
    {
      title: z.string().describe("New page title."),
      markdown: z.string().describe("Markdown document to publish."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceId: z.string().optional().describe("Target Confluence space ID. Optional when siblingPageId is provided."),
      parentId: z.string().optional().describe("Optional parent page ID."),
      siblingPageId: z.string().optional().describe("Optional existing page ID whose parent should be reused for the new sibling page."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
      embeddingMode: embeddingModeSchema,
    },
    async ({ title, markdown, sourceName, spaceId, parentId, siblingPageId, spaceKey, embeddingMode }) => {
      const service = createPublisherService();
      return textResult(
        await service.createPageFromMarkdown({
          title,
          markdown,
          sourceName,
          spaceId,
          parentId,
          siblingPageId,
          spaceKey,
          embeddingMode,
        }),
      );
    },
  );

  server.tool(
    "create_confluence_page_from_markdown_file",
    `Create a Confluence page from a Markdown file path. ${defaultEmbeddingModeToolGuidance} Mermaid blocks fall back per block when embedding fails.`,
    {
      title: z.string().describe("New page title."),
      markdownFile: z.string().describe("Path to the Markdown document to publish."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceId: z.string().optional().describe("Target Confluence space ID. Optional when siblingPageId is provided."),
      parentId: z.string().optional().describe("Optional parent page ID."),
      siblingPageId: z.string().optional().describe("Optional existing page ID whose parent should be reused for the new sibling page."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
      embeddingMode: embeddingModeSchema,
    },
    async ({ title, markdownFile, sourceName, spaceId, parentId, siblingPageId, spaceKey, embeddingMode }) => {
      const service = createPublisherService();
      return textResult(await withMarkdownFileHint(
        markdownFile,
        () => service.createPageFromMarkdownFile({
          title,
          markdownFile,
          sourceName,
          spaceId,
          parentId,
          siblingPageId,
          spaceKey,
          embeddingMode,
        }),
      ));
    },
  );

  server.tool(
    "update_confluence_page_from_markdown",
    `Update an existing Confluence page from Markdown content. ${defaultEmbeddingModeToolGuidance} Mermaid blocks fall back per block when embedding fails.`,
    {
      pageId: z.string().describe("Target Confluence page ID."),
      markdown: z.string().describe("Markdown document to publish into the existing page."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
      embeddingMode: embeddingModeSchema,
    },
    async ({ pageId, markdown, sourceName, spaceKey, embeddingMode }) => {
      const service = createPublisherService();
      return textResult(
        await service.updatePageFromMarkdown({
          pageId,
          markdown,
          sourceName,
          spaceKey,
          embeddingMode,
        }),
      );
    },
  );

  server.tool(
    "update_confluence_page_from_markdown_file",
    `Update an existing Confluence page from a Markdown file path. ${defaultEmbeddingModeToolGuidance} Mermaid blocks fall back per block when embedding fails.`,
    {
      pageId: z.string().describe("Target Confluence page ID."),
      markdownFile: z.string().describe("Path to the Markdown document to publish into the existing page."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
      embeddingMode: embeddingModeSchema,
    },
    async ({ pageId, markdownFile, sourceName, spaceKey, embeddingMode }) => {
      const service = createPublisherService();
      return textResult(await withMarkdownFileHint(
        markdownFile,
        () => service.updatePageFromMarkdownFile({
          pageId,
          markdownFile,
          sourceName,
          spaceKey,
          embeddingMode,
        }),
      ));
    },
  );

  server.tool(
    "update_confluence_diagram_from_mermaid",
    `Update an existing embedded Confluence diagram from Mermaid. ${defaultEmbeddingModeToolGuidance}`,
    {
      pageId: z.string().describe("Target Confluence page ID."),
      mermaid: z.string().describe("Mermaid diagram source."),
      diagramName: z.string().optional().describe("Optional resulting draw.io file name or logical diagram name."),
      widgetDiagramName: z.string().optional().describe("Existing draw.io diagram name selector. Use only one selector."),
      custContentId: z.string().optional().describe("Existing draw.io custom content ID selector. Use only one selector."),
      localId: z.string().optional().describe("Existing embedded diagram local ID selector. Use only one selector."),
      index: z.number().int().nonnegative().optional().describe("Existing embedded diagram index selector. Use only one selector. On mixed pages, also provide embeddingMode or use localId."),
      embeddingMode: embeddingModeSchema,
    },
    async ({ pageId, mermaid, diagramName, widgetDiagramName, custContentId, localId, index, embeddingMode }) => {
      const service = createPublisherService();
      return textResult(
        await service.updateDiagramFromMermaid({
          pageId,
          mermaid,
          diagramName,
          embeddingMode,
          diagram: {
            diagramName: widgetDiagramName,
            custContentId,
            localId,
            index,
          },
        }),
      );
    },
  );

  return server;
}
