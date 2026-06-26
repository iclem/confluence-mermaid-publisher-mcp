import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildMacroPackExtensionNode, findMacroPackExtensions } from "./macropack.js";
import { ConfluenceMermaidPublisherService } from "./service.js";
import type { ConfluenceAttachment, ConfluenceCustomContent, ConfluencePage, JsonObject } from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getStoredPage(client: FakeConfluenceClient): ConfluencePage {
  return (client as unknown as { page: ConfluencePage }).page;
}

function getStoredPageAdf(client: FakeConfluenceClient): JsonObject {
  return getStoredPage(client).body?.atlas_doc_format?.value as JsonObject;
}

class FakeConfluenceClient {
  readonly pageUpdateMessages: string[] = [];
  readonly pageUpdateStatuses: string[] = [];
  readonly createdPages: string[] = [];

  constructor(
    private readonly baseUrl: string,
    private page: ConfluencePage,
    private attachments: ConfluenceAttachment[],
  ) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getPage(): Promise<ConfluencePage> {
    return clone(this.page);
  }

  async createPage(args: {
    spaceId: string;
    title: string;
    parentId?: string;
    status?: "current" | "draft";
    adfDocument?: JsonObject;
  }): Promise<ConfluencePage> {
    this.page = {
      id: "created-page",
      status: args.status ?? "draft",
      title: args.title,
      spaceId: args.spaceId,
      parentId: args.parentId,
      version: {
        number: 1,
      },
      body: {
        atlas_doc_format: {
          value: clone(args.adfDocument ?? { type: "doc", version: 1, content: [] }),
        },
      },
    };
    this.attachments = [];
    this.createdPages.push(this.page.id);
    return clone(this.page);
  }

  async updatePageAdf(
    page: ConfluencePage,
    adfDocument: JsonObject,
    message?: string,
    targetStatus = page.status,
  ): Promise<ConfluencePage> {
    this.page = {
      ...page,
      status: targetStatus,
      version: {
        number: page.version.number + 1,
      },
      body: {
        atlas_doc_format: {
          value: clone(adfDocument),
        },
      },
    };
    if (message) {
      this.pageUpdateMessages.push(message);
    }
    this.pageUpdateStatuses.push(targetStatus);
    return clone(this.page);
  }

  async listPageAttachments(): Promise<ConfluenceAttachment[]> {
    return clone(this.attachments);
  }

  async getCustomContent(): Promise<ConfluenceCustomContent> {
    throw new Error("MacroPack publication does not use custom content");
  }

  async createCustomContent(): Promise<ConfluenceCustomContent> {
    throw new Error("MacroPack publication does not create custom content");
  }

  async updateCustomContent(): Promise<ConfluenceCustomContent> {
    throw new Error("MacroPack publication does not update custom content");
  }

  async upsertAttachment(): Promise<ConfluenceAttachment> {
    throw new Error("MacroPack publication does not upsert generated attachments");
  }
}

function createExistingMacroPackFixture(): {
  client: FakeConfluenceClient;
  pageId: string;
  localId: string;
} {
  const pageId = "6255738937";
  const extensionNode = buildMacroPackExtensionNode({
    pageId,
    spaceId: "42",
    spaceKey: "~user",
    mermaid: "flowchart TD\nA-->B",
  });
  const localId = ((extensionNode.attrs as JsonObject).localId as string | undefined) ?? "missing-local-id";
  const page: ConfluencePage = {
    id: pageId,
    status: "current",
    title: "MacroPack test",
    spaceId: "42",
    parentId: "24",
    version: {
      number: 2,
    },
    body: {
      atlas_doc_format: {
        value: {
          type: "doc",
          version: 1,
          content: [extensionNode],
        },
      },
    },
  };

  return {
    client: new FakeConfluenceClient("https://example.atlassian.net/wiki", page, []),
    pageId,
    localId,
  };
}

function createMultipleMacroPackFixture(): {
  client: FakeConfluenceClient;
  pageId: string;
  localIds: string[];
} {
  const pageId = "6255738939";
  const firstNode = buildMacroPackExtensionNode({
    pageId,
    spaceId: "42",
    spaceKey: "~user",
    mermaid: "flowchart TD\nA-->B",
  });
  const secondNode = buildMacroPackExtensionNode({
    pageId,
    spaceId: "42",
    spaceKey: "~user",
    mermaid: "flowchart TD\nC-->D",
  });
  const localIds = [firstNode, secondNode].map(
    (node) => ((node.attrs as JsonObject).localId as string | undefined) ?? "missing-local-id",
  );
  const page: ConfluencePage = {
    id: pageId,
    status: "current",
    title: "Multiple MacroPack diagrams",
    spaceId: "42",
    parentId: "24",
    version: {
      number: 4,
    },
    body: {
      atlas_doc_format: {
        value: {
          type: "doc",
          version: 1,
          content: [firstNode, secondNode],
        },
      },
    },
  };

  return {
    client: new FakeConfluenceClient("https://example.atlassian.net/wiki", page, []),
    pageId,
    localIds,
  };
}

describe("ConfluenceMermaidPublisherService", () => {
  it("inspects MacroPack diagrams on a page", async () => {
    const { client, pageId, localId } = createExistingMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    const result = await service.inspectPage(pageId);

    expect(result.page.id).toBe(pageId);
    expect(result.embeddedDiagrams).toEqual([
      expect.objectContaining({
        localId,
        height: 600,
      }),
    ]);
    expect(result.attachments).toHaveLength(0);
    expect(result.customContents).toHaveLength(0);
  });

  it("creates a MacroPack diagram from Mermaid without generated artifacts", async () => {
    const { client, pageId, localId } = createExistingMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    const result = await service.createDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nB-->C",
      spaceKey: "~user",
    });

    expect(client.pageUpdateMessages).toEqual(["Create MacroPack diagram"]);
    expect(result.embeddedDiagrams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ localId }),
        expect.objectContaining({ localId: expect.any(String) }),
      ]),
    );
    const macroPackExtensions = findMacroPackExtensions(getStoredPageAdf(client));
    expect(macroPackExtensions).toHaveLength(2);
    expect(macroPackExtensions[1]?.source).toContain("B-->C");
  });

  it("updates an existing MacroPack diagram in place", async () => {
    const { client, pageId, localId } = createExistingMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    const result = await service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->C",
      diagram: {
        localId,
      },
    });

    expect(client.pageUpdateMessages).toEqual(["Update MacroPack diagram"]);
    expect(result.embeddedDiagrams).toEqual([
      expect.objectContaining({
        localId,
      }),
    ]);
    const macroPackExtensions = findMacroPackExtensions(getStoredPageAdf(client));
    expect(macroPackExtensions[0]?.source).toContain("A-->C");
  });

  it("updates the only MacroPack diagram when no selector is provided", async () => {
    const { client, pageId, localId } = createExistingMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    const result = await service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->D",
      diagram: {},
    });

    expect(client.pageUpdateMessages).toEqual(["Update MacroPack diagram"]);
    expect(result.embeddedDiagrams).toEqual([
      expect.objectContaining({
        localId,
      }),
    ]);
  });

  it("requires an explicit selector when multiple MacroPack diagrams exist", async () => {
    const { client, pageId } = createMultipleMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    await expect(service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->E",
      diagram: {},
    })).rejects.toThrow("Multiple MacroPack diagrams found; provide localId or index");
  });

  it("appends page text and inserts a MacroPack diagram at an anchor", async () => {
    const { client, pageId } = createExistingMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    const paragraphResult = await service.appendPageParagraph({
      pageId,
      text: "Anchor before diagram and trailing text.",
    });

    expect(paragraphResult.page.id).toBe(pageId);
    expect(client.pageUpdateMessages).toContain("Append page paragraph");
    expect(client.pageUpdateStatuses).toContain("current");

    const result = await service.createDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nC-->D",
      spaceKey: "~user",
      anchorText: "Anchor before diagram",
    });

    expect(client.pageUpdateMessages).toContain("Create MacroPack diagram");
    expect(result.embeddedDiagrams).toHaveLength(2);
    expect((getStoredPageAdf(client).content as Array<{ type: string }>)[2]?.type).toBe("extension");
  });

  it("creates a sibling page from markdown with Mermaid blocks embedded as MacroPack", async () => {
    const { client, pageId } = createExistingMacroPackFixture();
    const service = new ConfluenceMermaidPublisherService(client as never);

    const result = await service.createPageFromMarkdown({
      title: "Domain Context Map",
      markdown: `# Domain Context Map\n\nIntro paragraph.\n\n> Important quoted note\n\n| Team | Work stream |\n| --- | --- |\n| api-catalogue | EP1 |\n\n\`\`\`mermaid\nflowchart TD\nA[Start] --> B{Decision}\n\`\`\`\n\n\`\`\`mermaid\npie\n  title Release\n\`\`\`\n`,
      sourceName: "ddd-context-map.md",
      siblingPageId: pageId,
      spaceKey: "~user",
    });

    expect(client.createdPages).toEqual(["created-page"]);
    expect(result.page.id).toBe("created-page");
    expect(result.page.parentId).toBe("24");
    expect(result.source).toBe("ddd-context-map.md");
    expect(result.mermaidBlocks).toBe(2);
    expect(result.embeddedBlocks).toBe(2);
    expect(result.embeddedDiagrams).toHaveLength(2);
    expect(client.pageUpdateMessages).toContain("Publish ddd-context-map.md");
    expect(getStoredPage(client).body?.atlas_doc_format?.value).toEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({ type: "heading" }),
          expect.objectContaining({ type: "paragraph" }),
          expect.objectContaining({ type: "blockquote" }),
          expect.objectContaining({ type: "table" }),
          expect.objectContaining({ type: "extension" }),
        ]),
      }),
    );
  });

  it("creates a sibling page from a markdown file path", async () => {
    const { client, pageId } = createExistingMacroPackFixture();
    const dir = mkdtempSync(join(tmpdir(), "macropack-markdown-"));
    const markdownFile = join(dir, "ddd-context-map.md");
    writeFileSync(markdownFile, "# Domain Context Map\n\n```mermaid\nflowchart TD\nA-->B\n```\n");
    const service = new ConfluenceMermaidPublisherService(client as never);

    try {
      const result = await service.createPageFromMarkdownFile({
        title: "Domain Context Map",
        markdownFile,
        siblingPageId: pageId,
        spaceKey: "~user",
      });

      expect(result.page.id).toBe("created-page");
      expect(result.source).toBe("ddd-context-map.md");
      expect(result.mermaidBlocks).toBe(1);
      expect(result.embeddedBlocks).toBe(1);
      expect(client.pageUpdateMessages).toContain("Publish ddd-context-map.md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a sibling page from a relative markdown file path in the current workspace", async () => {
    const { client, pageId } = createExistingMacroPackFixture();
    const dir = mkdtempSync(join(tmpdir(), "macropack-markdown-relative-"));
    const docsDir = join(dir, "docs");
    mkdirSync(docsDir);
    writeFileSync(join(docsDir, "ddd-context-map.md"), "# Domain Context Map\n\n```mermaid\nflowchart TD\nA-->B\n```\n");
    const service = new ConfluenceMermaidPublisherService(client as never);
    const cwd = process.cwd();

    try {
      process.chdir(dir);

      const result = await service.createPageFromMarkdownFile({
        title: "Domain Context Map",
        markdownFile: "docs/ddd-context-map.md",
        siblingPageId: pageId,
        spaceKey: "~user",
      });

      expect(result.page.id).toBe("created-page");
      expect(result.source).toBe("ddd-context-map.md");
      expect(result.mermaidBlocks).toBe(1);
      expect(result.embeddedBlocks).toBe(1);
      expect(client.pageUpdateMessages).toContain("Publish ddd-context-map.md");
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
