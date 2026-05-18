import { afterEach, describe, expect, it } from "vitest";

import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { createPublisherService, formatMarkdownFileNotFoundMessage } from "./mcp-app.js";
import { createMcpServer } from "./mcp-app.js";
import { DEFAULT_EMBEDDING_MODE_ENV } from "./embedding-mode.js";

interface ToolListHandlerHost {
  _requestHandlers: Map<string, (request: unknown, extra: unknown) => Promise<{
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: { properties?: Record<string, { description?: string; enum?: string[] }> };
    }>;
  }>>;
}

const ORIGINAL_ENV = { ...process.env };

describe("mcp app", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("falls back to Copilot Confluence settings when direct vars are blank", () => {
    process.env.CONFLUENCE_BASE_URL = "";
    process.env.CONFLUENCE_EMAIL = "";
    process.env.CONFLUENCE_API_TOKEN = "";
    process.env.COPILOT_MCP_CONFLUENCE_URL = "https://example.atlassian.net/wiki";
    process.env.COPILOT_MCP_CONFLUENCE_USERNAME = "user@example.com";
    process.env.COPILOT_MCP_CONFLUENCE_API_TOKEN = "token";

    expect(() => createPublisherService()).not.toThrow();
  });

  it("defaults the publisher service to macropack when embedding mode is unset", async () => {
    process.env.CONFLUENCE_BASE_URL = "https://example.atlassian.net/wiki";
    process.env.CONFLUENCE_EMAIL = "user@example.com";
    process.env.CONFLUENCE_API_TOKEN = "token";
    delete process.env[DEFAULT_EMBEDDING_MODE_ENV];

    const service = createPublisherService();
    expect((service as unknown as { defaultEmbeddingMode: string }).defaultEmbeddingMode).toBe("macropack");
  });

  it("rejects unsupported embedding mode configuration", () => {
    process.env.CONFLUENCE_BASE_URL = "https://example.atlassian.net/wiki";
    process.env.CONFLUENCE_EMAIL = "user@example.com";
    process.env.CONFLUENCE_API_TOKEN = "token";
    process.env[DEFAULT_EMBEDDING_MODE_ENV] = "invalid-mode";

    expect(() => createPublisherService()).toThrow(`Unsupported ${DEFAULT_EMBEDDING_MODE_ENV} value: invalid-mode`);
  });

  it("registers generic diagram tools with embeddingMode inputs", async () => {
    const server = createMcpServer();

    const result = await (server.server as unknown as ToolListHandlerHost)._requestHandlers.get(ListToolsRequestSchema.shape.method.value)?.({
      method: "tools/list",
    }, {} as never);

    expect(result?.tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining([
        "inspect_confluence_page_diagrams",
        "create_confluence_diagram_from_mermaid",
        "update_confluence_diagram_from_mermaid",
      ]),
    );
    const createDiagramTool = result?.tools.find((tool: { name: string }) => tool.name === "create_confluence_diagram_from_mermaid");
    expect(createDiagramTool?.description).toContain("Omit embeddingMode to use the server default.");
    expect(createDiagramTool?.inputSchema?.properties?.embeddingMode).toBeDefined();
    expect(createDiagramTool?.inputSchema?.properties?.embeddingMode?.enum).toEqual(["macropack", "drawio"]);
    expect(createDiagramTool?.inputSchema?.properties?.embeddingMode?.description).toContain(
      "Only set it when the user explicitly requests a non-default mode",
    );
  });

  it("adds a workspace bind-mount hint when a markdown file is missing", () => {
    const message = formatMarkdownFileNotFoundMessage("/missing/file.md");

    expect(message).toContain("bind-mount");
    expect(message).toContain("active workspace");
    expect(message).toContain("local Docker stdio");
  });
});
