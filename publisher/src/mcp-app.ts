import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ConfluenceClient } from "./confluence-client.js";
import { ConfluenceMermaidPublisherService } from "./service.js";

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

export function createPublisherService(): ConfluenceMermaidPublisherService {
  const baseUrl = getConfluenceSetting("CONFLUENCE_BASE_URL", "COPILOT_MCP_CONFLUENCE_URL");
  const email = getConfluenceSetting("CONFLUENCE_EMAIL", "COPILOT_MCP_CONFLUENCE_USERNAME");
  const apiToken = getConfluenceSetting("CONFLUENCE_API_TOKEN", "COPILOT_MCP_CONFLUENCE_API_TOKEN");
  const bearerToken = process.env.CONFLUENCE_BEARER_TOKEN;

  if (!baseUrl) {
    throw new Error("Missing CONFLUENCE_BASE_URL or COPILOT_MCP_CONFLUENCE_URL");
  }

  return new ConfluenceMermaidPublisherService(
    new ConfluenceClient({
      baseUrl,
      bearerToken,
      email,
      apiToken,
    }),
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

  server.tool(
    "inspect_confluence_page_diagrams",
    "Inspect MacroPack Mermaid diagrams and attachments on a Confluence page.",
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
    "Create a new MacroPack Mermaid diagram on a Confluence page.",
    {
      pageId: z.string().describe("Target Confluence page ID."),
      mermaid: z.string().describe("Mermaid diagram source."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for the page."),
      anchorText: z.string().optional().describe("Optional text anchor. The diagram is inserted immediately after the first matching text inside a paragraph."),
    },
    async ({ pageId, mermaid, spaceKey, anchorText }) => {
      const service = createPublisherService();
      return textResult(
        await service.createDiagramFromMermaid({
          pageId,
          mermaid,
          spaceKey,
          anchorText,
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
    "Create a Confluence page from Markdown content and embed Mermaid blocks as MacroPack diagrams.",
    {
      title: z.string().describe("New page title."),
      markdown: z.string().describe("Markdown document to publish."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceId: z.string().optional().describe("Target Confluence space ID. Optional when siblingPageId is provided."),
      parentId: z.string().optional().describe("Optional parent page ID."),
      siblingPageId: z.string().optional().describe("Optional existing page ID whose parent should be reused for the new sibling page."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
    },
    async ({ title, markdown, sourceName, spaceId, parentId, siblingPageId, spaceKey }) => {
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
        }),
      );
    },
  );

  server.tool(
    "create_confluence_page_from_markdown_file",
    "Create a Confluence page from a Markdown file path and embed Mermaid blocks as MacroPack diagrams.",
    {
      title: z.string().describe("New page title."),
      markdownFile: z.string().describe("Path to the Markdown document to publish."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceId: z.string().optional().describe("Target Confluence space ID. Optional when siblingPageId is provided."),
      parentId: z.string().optional().describe("Optional parent page ID."),
      siblingPageId: z.string().optional().describe("Optional existing page ID whose parent should be reused for the new sibling page."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
    },
    async ({ title, markdownFile, sourceName, spaceId, parentId, siblingPageId, spaceKey }) => {
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
        }),
      ));
    },
  );

  server.tool(
    "update_confluence_page_from_markdown",
    "Update an existing Confluence page from Markdown content and embed Mermaid blocks as MacroPack diagrams.",
    {
      pageId: z.string().describe("Target Confluence page ID."),
      markdown: z.string().describe("Markdown document to publish into the existing page."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
    },
    async ({ pageId, markdown, sourceName, spaceKey }) => {
      const service = createPublisherService();
      return textResult(
        await service.updatePageFromMarkdown({
          pageId,
          markdown,
          sourceName,
          spaceKey,
        }),
      );
    },
  );

  server.tool(
    "update_confluence_page_from_markdown_file",
    "Update an existing Confluence page from a Markdown file path and embed Mermaid blocks as MacroPack diagrams.",
    {
      pageId: z.string().describe("Target Confluence page ID."),
      markdownFile: z.string().describe("Path to the Markdown document to publish into the existing page."),
      sourceName: z.string().optional().describe("Optional source file name used in publication metadata."),
      spaceKey: z.string().optional().describe("Optional Confluence space key for diagram macro metadata."),
    },
    async ({ pageId, markdownFile, sourceName, spaceKey }) => {
      const service = createPublisherService();
      return textResult(await withMarkdownFileHint(
        markdownFile,
        () => service.updatePageFromMarkdownFile({
          pageId,
          markdownFile,
          sourceName,
          spaceKey,
        }),
      ));
    },
  );

  server.tool(
    "update_confluence_diagram_from_mermaid",
    "Update an existing MacroPack Mermaid diagram.",
    {
      pageId: z.string().describe("Target Confluence page ID."),
      mermaid: z.string().describe("Mermaid diagram source."),
      localId: z.string().optional().describe("Existing MacroPack diagram local ID selector."),
      index: z.number().int().nonnegative().optional().describe("Existing MacroPack diagram index selector."),
    },
    async ({ pageId, mermaid, localId, index }) => {
      const service = createPublisherService();
      return textResult(
        await service.updateDiagramFromMermaid({
          pageId,
          mermaid,
          diagram: {
            localId,
            index,
          },
        }),
      );
    },
  );

  return server;
}
