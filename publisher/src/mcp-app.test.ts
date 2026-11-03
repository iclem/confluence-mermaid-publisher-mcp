import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DrawioPublisherService } from "./service.js";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("defaults the publisher service to svg when embedding mode is unset", async () => {
    process.env.CONFLUENCE_BASE_URL = "https://example.atlassian.net/wiki";
    process.env.CONFLUENCE_EMAIL = "user@example.com";
    process.env.CONFLUENCE_API_TOKEN = "token";
    delete process.env[DEFAULT_EMBEDDING_MODE_ENV];

    const service = createPublisherService();
    expect((service as unknown as { defaultEmbeddingMode: string }).defaultEmbeddingMode).toBe("svg");
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
    const pageTools = result?.tools.filter((tool) => /^(create|update)_confluence_page_from_markdown(_file)?$/.test(tool.name));
    expect(pageTools).toHaveLength(4);
    for (const tool of pageTools ?? []) {
      expect(tool.inputSchema?.properties?.pageWidth?.enum).toEqual(["default", "full-width"]);
    }
    const createDiagramTool = result?.tools.find((tool: { name: string }) => tool.name === "create_confluence_diagram_from_mermaid");
    const svgTools = result?.tools.filter((tool) => /^(create|update)_confluence_(diagram_from_mermaid|page_from_markdown(_file)?)$/.test(tool.name));
    expect(svgTools).toHaveLength(6);
    for (const tool of svgTools ?? []) {
      expect(tool.inputSchema?.properties?.svgAccent?.enum).toEqual(["default", "blue", "green", "yellow", "pink", "orange", "purple", "white"]);
      expect(tool.inputSchema?.properties?.svgAccent?.description).toContain("Explicit Mermaid colors");
      expect(tool.inputSchema?.properties?.svgStyle?.enum).toEqual(["codex", "github"]);
      expect(tool.inputSchema?.properties?.svgStyle?.description).toContain("Omit for codex");
      expect(tool.inputSchema?.properties?.svgLayout?.enum).toEqual(["elk", "agentic"]);
      expect(tool.inputSchema?.properties?.svgLayout?.description).toContain("Omit for elk");
    }
    expect(createDiagramTool?.description).toContain("Omit embeddingMode to use the server default.");
    expect(createDiagramTool?.inputSchema?.properties?.embeddingMode).toBeDefined();
    expect(createDiagramTool?.inputSchema?.properties?.embeddingMode?.enum).toEqual(["macropack", "drawio", "svg"]);
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


describe("Markdown MCP width forwarding", () => {
  it.each([
    ["create_confluence_diagram_from_mermaid", "createDiagramFromMermaid"],
    ["update_confluence_diagram_from_mermaid", "updateDiagramFromMermaid"],
  ] as const)("forwards the selected accent through %s", async (name, method) => {
    vi.stubEnv("CONFLUENCE_BASE_URL", "https://example.atlassian.net/wiki");
    vi.stubEnv("CONFLUENCE_BEARER_TOKEN", "test");
    const publish = vi.spyOn(DrawioPublisherService.prototype, method).mockResolvedValue({} as never);
    const server = createMcpServer();
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const args = { pageId: "page", mermaid: "flowchart TD\nA-->B", embeddingMode: "svg", svgAccent: "purple" };
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      expect(publish).toHaveBeenCalledWith(expect.objectContaining(args));
      const invalid = await client.callTool({ name, arguments: { ...args, svgAccent: "#ff0000" } });
      expect(invalid.isError).toBe(true);
      expect(publish).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  });
  it.each([
    ["create_confluence_page_from_markdown", "createPageFromMarkdown", { title: "New", spaceId: "space", markdown: "Text" }],
    ["create_confluence_page_from_markdown_file", "createPageFromMarkdownFile", { title: "New", spaceId: "space", markdownFile: "/workspace/source.md" }],
    ["update_confluence_page_from_markdown", "updatePageFromMarkdown", { pageId: "page", markdown: "Text" }],
    ["update_confluence_page_from_markdown_file", "updatePageFromMarkdownFile", { pageId: "page", markdownFile: "/workspace/source.md" }],
  ] as const)("forwards call width through %s", async (name, method, args) => {
    vi.stubEnv("CONFLUENCE_BASE_URL", "https://example.atlassian.net/wiki");
    vi.stubEnv("CONFLUENCE_BEARER_TOKEN", "test");
    vi.stubEnv("CONFLUENCE_DEFAULT_PAGE_WIDTH", "full-width");
    const publish = vi.spyOn(DrawioPublisherService.prototype, method).mockResolvedValue({} as never);
    const server = createMcpServer();
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name, arguments: { ...args, pageWidth: "default", embeddingMode: "svg", svgStyle: "github", svgLayout: "agentic", svgAccent: "green" } });
      expect(result.isError).not.toBe(true);
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({ ...args, pageWidth: "default", embeddingMode: "svg", svgStyle: "github", svgLayout: "agentic", svgAccent: "green" }));
    } finally {
      await client.close();
      await server.close();
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  });
});
