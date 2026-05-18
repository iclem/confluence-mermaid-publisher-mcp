import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildDrawioExtensionNode, DRAWIO_CUSTOM_CONTENT_TYPE } from "./drawio.js";
import { buildMacroPackExtensionNode, findMacroPackExtensions } from "./macropack.js";
import { DrawioPublisherService } from "./service.js";
import type { ConfluenceAttachment, ConfluenceCustomContent, ConfluencePage, EmbeddedDiagram, JsonObject } from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createPng(width: number, height: number): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    0x08, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function createTempDiagramFiles(drawioName: string, width: number, height: number): { dir: string; drawioPath: string; previewPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "drawio-publisher-"));
  const drawioPath = join(dir, drawioName);
  const previewPath = `${drawioPath}.png`;
  writeFileSync(drawioPath, '<mxfile><diagram name="demo"><mxGraphModel><root><mxCell value="API" /></root></mxGraphModel></diagram></mxfile>');
  writeFileSync(previewPath, createPng(width, height));
  return { dir, drawioPath, previewPath };
}

function getStoredPage(client: FakeConfluenceClient): ConfluencePage {
  return (client as unknown as { page: ConfluencePage }).page;
}

function getStoredPageAdf(client: FakeConfluenceClient): JsonObject {
  return getStoredPage(client).body?.atlas_doc_format?.value as JsonObject;
}

function getEmbeddedDrawioDiagrams(result: { embeddedDiagrams: EmbeddedDiagram[] }): EmbeddedDiagram[] {
  return result.embeddedDiagrams.filter((diagram) => diagram.embeddingMode === "drawio");
}

function getEmbeddedDiagramNames(result: { embeddedDiagrams: EmbeddedDiagram[] }, embeddingMode: EmbeddedDiagram["embeddingMode"]): string[] {
  return result.embeddedDiagrams
    .filter((diagram) => diagram.embeddingMode === embeddingMode)
    .map((diagram) => diagram.diagramName)
    .filter((diagramName): diagramName is string => Boolean(diagramName));
}

class FakeConfluenceClient {
  readonly attachmentMutations: Array<{ pageId: string; remoteFileName?: string }> = [];
  readonly pageUpdateMessages: string[] = [];
  readonly pageUpdateStatuses: string[] = [];
  readonly customContentUpdates: string[] = [];
  readonly customContentCreates: string[] = [];
  readonly createdPages: string[] = [];

  constructor(
    private readonly baseUrl: string,
    private page: ConfluencePage,
    private attachments: ConfluenceAttachment[],
    private customContents: Map<string, ConfluenceCustomContent>,
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
    this.customContents = new Map();
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

  async listPageAttachments(_pageId: string, filename?: string): Promise<ConfluenceAttachment[]> {
    return clone(filename ? this.attachments.filter((attachment) => attachment.title === filename) : this.attachments);
  }

  async getCustomContent(customContentId: string): Promise<ConfluenceCustomContent> {
    const customContent = this.customContents.get(customContentId);
    if (!customContent) {
      throw new Error(`Missing custom content ${customContentId}`);
    }
    return clone(customContent);
  }

  async createCustomContent(args: {
    type: string;
    title: string;
    pageId: string;
    bodyRaw: string;
  }): Promise<ConfluenceCustomContent> {
    const id = `created-${this.customContents.size + 1}`;
    const customContent: ConfluenceCustomContent = {
      id,
      type: args.type,
      status: "current",
      title: args.title,
      pageId: args.pageId,
      version: {
        number: 1,
      },
      body: {
        raw: {
          value: args.bodyRaw,
        },
      },
    };
    this.customContents.set(id, customContent);
    this.customContentCreates.push(id);
    return clone(customContent);
  }

  async updateCustomContent(args: {
    id: string;
    type: string;
    title: string;
    pageId: string;
    bodyRaw: string;
    versionNumber: number;
  }): Promise<ConfluenceCustomContent> {
    const customContent: ConfluenceCustomContent = {
      id: args.id,
      type: args.type,
      status: "current",
      title: args.title,
      pageId: args.pageId,
      version: {
        number: args.versionNumber,
      },
      body: {
        raw: {
          value: args.bodyRaw,
        },
      },
    };
    this.customContents.set(args.id, customContent);
    this.customContentUpdates.push(args.id);
    return clone(customContent);
  }

  async upsertAttachment(args: {
    pageId: string;
    localPath: string;
    remoteFileName?: string;
  }): Promise<ConfluenceAttachment> {
    this.attachmentMutations.push({ pageId: args.pageId, remoteFileName: args.remoteFileName });
    const remoteFileName = args.remoteFileName ?? args.localPath;
    const existing = this.attachments.find((attachment) => attachment.title === remoteFileName);
    if (existing) {
      existing.version = {
        number: (existing.version?.number ?? 0) + 1,
      };
      return clone(existing);
    }
    const created: ConfluenceAttachment = {
      id: `att-${this.attachments.length + 1}`,
      title: remoteFileName,
      version: {
        number: 1,
      },
    };
    this.attachments.push(created);
    return clone(created);
  }
}

function createExistingWidgetFixture(): {
  client: FakeConfluenceClient;
  pageId: string;
  customContentId: string;
} {
  const pageId = "6255738936";
  const customContentId = "cust-1";
  const adf = {
    type: "doc",
    version: 1,
    content: [
      buildDrawioExtensionNode({
        pageId,
        spaceId: "42",
        spaceKey: "~user",
        diagramName: "existing.drawio",
        custContentId: customContentId,
        width: 320,
        height: 180,
        baseUrl: "https://example.atlassian.net/wiki",
      }),
    ],
  };
  const page: ConfluencePage = {
    id: pageId,
    status: "current",
    title: "Draw.io test",
    spaceId: "42",
    parentId: "24",
    version: {
      number: 7,
    },
    body: {
      atlas_doc_format: {
        value: adf,
      },
    },
  };
  const attachments: ConfluenceAttachment[] = [
    { id: "att-1", title: "existing.drawio", version: { number: 3 } },
    { id: "att-2", title: "existing.drawio.png", version: { number: 3 } },
  ];
  const customContents = new Map<string, ConfluenceCustomContent>([
    [customContentId, {
      id: customContentId,
      type: DRAWIO_CUSTOM_CONTENT_TYPE,
      status: "current",
      title: "existing.drawio",
      pageId,
      version: {
        number: 5,
      },
      body: {
        raw: {
          value: JSON.stringify({
            search: "API ",
            pageId,
            type: "page",
            diagramName: "existing.drawio",
            revision: 3,
            isSketch: false,
          }),
        },
      },
    }],
  ]);

  return {
    client: new FakeConfluenceClient("https://example.atlassian.net/wiki", page, attachments, customContents),
    pageId,
    customContentId,
  };
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
    client: new FakeConfluenceClient("https://example.atlassian.net/wiki", page, [], new Map()),
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
    client: new FakeConfluenceClient("https://example.atlassian.net/wiki", page, [], new Map()),
    pageId,
    localIds,
  };
}

function createMixedDiagramFixture(): {
  client: FakeConfluenceClient;
  pageId: string;
  customContentId: string;
  localId: string;
} {
  const pageId = "6255738938";
  const customContentId = "cust-1";
  const macroPackNode = buildMacroPackExtensionNode({
    pageId,
    spaceId: "42",
    spaceKey: "~user",
    mermaid: "flowchart TD\nA-->B",
  });
  const localId = ((macroPackNode.attrs as JsonObject).localId as string | undefined) ?? "missing-local-id";
  const adf = {
    type: "doc",
    version: 1,
    content: [
      buildDrawioExtensionNode({
        pageId,
        spaceId: "42",
        spaceKey: "~user",
        diagramName: "existing.drawio",
        custContentId: customContentId,
        width: 320,
        height: 180,
        baseUrl: "https://example.atlassian.net/wiki",
      }),
      macroPackNode,
    ],
  };
  const page: ConfluencePage = {
    id: pageId,
    status: "current",
    title: "Mixed diagrams",
    spaceId: "42",
    parentId: "24",
    version: {
      number: 3,
    },
    body: {
      atlas_doc_format: {
        value: adf,
      },
    },
  };
  const attachments: ConfluenceAttachment[] = [
    { id: "att-1", title: "existing.drawio", version: { number: 3 } },
    { id: "att-2", title: "existing.drawio.png", version: { number: 3 } },
  ];
  const customContents = new Map<string, ConfluenceCustomContent>([
    [customContentId, {
      id: customContentId,
      type: DRAWIO_CUSTOM_CONTENT_TYPE,
      status: "current",
      title: "existing.drawio",
      pageId,
      version: {
        number: 5,
      },
      body: {
        raw: {
          value: JSON.stringify({
            search: "API ",
            pageId,
            type: "page",
            diagramName: "existing.drawio",
            revision: 3,
            isSketch: false,
          }),
        },
      },
    }],
  ]);

  return {
    client: new FakeConfluenceClient("https://example.atlassian.net/wiki", page, attachments, customContents),
    pageId,
    customContentId,
    localId,
  };
}

describe("DrawioPublisherService", () => {
  it("inspects draw.io widgets on a page", async () => {
    const { client, pageId, customContentId } = createExistingWidgetFixture();
    const service = new DrawioPublisherService(client as never);

    const result = await service.inspectPage(pageId);

    expect(result.page.id).toBe(pageId);
    expect(getEmbeddedDrawioDiagrams(result)).toEqual([
      expect.objectContaining({
        diagramName: "existing.drawio",
        custContentId: customContentId,
        width: 320,
        height: 180,
      }),
    ]);
    expect(result.attachments).toHaveLength(2);
    expect(result.customContents[0]?.id).toBe(customContentId);
  });

  it("updates an existing widget attachments, custom content, and page metadata", async () => {
    const { client, pageId, customContentId } = createExistingWidgetFixture();
    const service = new DrawioPublisherService(client as never);
    const { dir, drawioPath, previewPath } = createTempDiagramFiles("renamed.drawio", 640, 480);

    try {
      const result = await service.updateExistingWidget({
        pageId,
        drawioPath,
        previewPath,
        diagramName: "renamed.drawio",
        widget: {
          custContentId: customContentId,
        },
      });

      expect(client.attachmentMutations).toEqual([
        { pageId, remoteFileName: "renamed.drawio" },
        { pageId, remoteFileName: "renamed.drawio.png" },
      ]);
      expect(client.customContentUpdates).toEqual([customContentId]);
      expect(client.pageUpdateMessages).toEqual(["Update draw.io widget metadata"]);
      expect(client.pageUpdateStatuses).toEqual(["current"]);
      expect(getEmbeddedDrawioDiagrams(result)).toEqual([
        expect.objectContaining({
          diagramName: "renamed.drawio",
          custContentId: customContentId,
          width: 640,
          height: 480,
        }),
      ]);
      expect(result.customContents[0]?.title).toBe("renamed.drawio");
      expect(JSON.parse(result.customContents[0]?.body?.raw?.value as string)).toEqual(
        expect.objectContaining({
          diagramName: "renamed.drawio",
          revision: 4,
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a new widget by creating attachments, custom content, and a page extension", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const service = new DrawioPublisherService(client as never);
    const { dir, drawioPath, previewPath } = createTempDiagramFiles("new-widget.drawio", 800, 600);

    try {
      const result = await service.createWidget({
        pageId,
        drawioPath,
        previewPath,
        diagramName: "new-widget.drawio",
        spaceKey: "~user",
      });

      expect(client.attachmentMutations).toEqual([
        { pageId, remoteFileName: "new-widget.drawio" },
        { pageId, remoteFileName: "new-widget.drawio.png" },
      ]);
      expect(client.customContentCreates).toEqual(["created-2"]);
      expect(client.pageUpdateMessages).toEqual(["Create draw.io widget"]);
      expect(client.pageUpdateStatuses).toEqual(["current"]);
      expect(getEmbeddedDrawioDiagrams(result)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramName: "existing.drawio",
            custContentId: "cust-1",
          }),
          expect.objectContaining({
            diagramName: "new-widget.drawio",
            custContentId: "created-2",
            width: 800,
            height: 600,
          }),
        ]),
      );
      expect(result.customContents.map((content) => content.id)).toEqual(["cust-1", "created-2"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a MacroPack diagram from Mermaid without draw.io artifacts", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const service = new DrawioPublisherService(client as never);

    const result = await service.createDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->B",
      embeddingMode: "macropack",
      spaceKey: "~user",
    });

    expect(client.attachmentMutations).toEqual([]);
    expect(client.customContentCreates).toEqual([]);
    expect(client.pageUpdateMessages).toEqual(["Create MacroPack diagram"]);
    expect(result.embeddedDiagrams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          embeddingMode: "drawio",
          diagramName: "existing.drawio",
        }),
        expect.objectContaining({
          embeddingMode: "macropack",
          localId: expect.any(String),
        }),
      ]),
    );
    const macroPackExtensions = findMacroPackExtensions(getStoredPageAdf(client));
    expect(macroPackExtensions).toHaveLength(1);
    expect(macroPackExtensions[0]?.source).toContain("flowchart TD");
  });

  it("updates an existing MacroPack diagram in place", async () => {
    const { client, pageId, localId } = createExistingMacroPackFixture();
    const service = new DrawioPublisherService(client as never);

    const result = await service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->C",
      diagram: {
        localId,
      },
    });

    expect(client.attachmentMutations).toEqual([]);
    expect(client.customContentUpdates).toEqual([]);
    expect(client.pageUpdateMessages).toEqual(["Update MacroPack diagram"]);
    expect(result.embeddedDiagrams).toEqual([
      expect.objectContaining({
        embeddingMode: "macropack",
        localId,
      }),
    ]);
    const macroPackExtensions = findMacroPackExtensions(getStoredPageAdf(client));
    expect(macroPackExtensions[0]?.source).toContain("A-->C");
  });

  it("updates the only MacroPack diagram when no selector is provided", async () => {
    const { client, pageId, localId } = createExistingMacroPackFixture();
    const service = new DrawioPublisherService(client as never);

    const result = await service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->D",
      diagram: {},
    });

    expect(client.pageUpdateMessages).toEqual(["Update MacroPack diagram"]);
    expect(result.embeddedDiagrams).toEqual([
      expect.objectContaining({
        embeddingMode: "macropack",
        localId,
      }),
    ]);
    const macroPackExtensions = findMacroPackExtensions(getStoredPageAdf(client));
    expect(macroPackExtensions[0]?.source).toContain("A-->D");
  });

  it("requires an explicit selector when multiple MacroPack diagrams exist", async () => {
    const { client, pageId } = createMultipleMacroPackFixture();
    const service = new DrawioPublisherService(client as never);

    await expect(service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->E",
      diagram: {},
      embeddingMode: "macropack",
    })).rejects.toThrow("Multiple MacroPack diagrams found; provide localId or index");
  });

  it("does not infer draw.io mode from diagramName when a MacroPack override is explicit", async () => {
    const { client, pageId } = createMixedDiagramFixture();
    const service = new DrawioPublisherService(client as never);

    await expect(service.updateDiagramFromMermaid({
      pageId,
      mermaid: "flowchart TD\nA-->F",
      embeddingMode: "macropack",
      diagram: {
        diagramName: "existing.drawio",
      },
    })).rejects.toThrow("Target diagram does not use embedding mode macropack; detected drawio instead");
  });

  it("inspects mixed draw.io and MacroPack diagrams on a page", async () => {
    const { client, pageId, customContentId, localId } = createMixedDiagramFixture();
    const service = new DrawioPublisherService(client as never);

    const result = await service.inspectPage(pageId);

    expect(result.embeddedDiagrams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          embeddingMode: "drawio",
          diagramName: "existing.drawio",
          custContentId: customContentId,
        }),
        expect.objectContaining({
          embeddingMode: "macropack",
          localId,
        }),
      ]),
    );
  });

  it("appends page text and can insert a widget at an anchor", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const service = new DrawioPublisherService(client as never);
    const paragraphResult = await service.appendPageParagraph({
      pageId,
      text: "Anchor before diagram and trailing text.",
    });

    expect(paragraphResult.page.id).toBe(pageId);
    expect(client.pageUpdateMessages).toContain("Append page paragraph");
    expect(client.pageUpdateStatuses).toContain("current");

    const { dir, drawioPath, previewPath } = createTempDiagramFiles("anchored.drawio", 700, 400);
    try {
      const result = await service.createWidget({
        pageId,
        drawioPath,
        previewPath,
        diagramName: "anchored.drawio",
        spaceKey: "~user",
        anchorText: "Anchor before diagram",
      });

      expect(client.pageUpdateMessages).toContain("Create draw.io widget");
      expect(client.pageUpdateStatuses).toEqual(["current", "current"]);
      expect(getEmbeddedDrawioDiagrams(result)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            diagramName: "anchored.drawio",
          }),
        ]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a sibling page from markdown with per-block fallback handling", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const { dir, drawioPath, previewPath } = createTempDiagramFiles("domain-context-map-01.drawio", 900, 500);
    const service = new DrawioPublisherService(
      client as never,
      async (mermaid, diagramName) => {
        if (mermaid.trimStart().startsWith("pie")) {
          throw new Error('unsupported_dialect: unsupported header "pie"');
        }
        expect(diagramName).toBe("domain-context-map-01.drawio");
        return {
          mermaidPath: `${dir}/input.mermaid`,
          drawioPath,
          previewPath,
          cleanup: async () => undefined,
        };
      },
    );

    try {
      const result = await service.createPageFromMarkdown({
        title: "Domain Context Map",
        markdown: `# Domain Context Map\n\nIntro paragraph.\n\n> Important quoted note\n\n| Team | Work stream |\n| --- | --- |\n| api-catalogue | EP1 |\n\n\`\`\`mermaid\nflowchart TD\nclassDef danger fill:#f00\nA[Start]:::danger --> B{Decision}\n\`\`\`\n\n\`\`\`mermaid\npie\n  title Release\n\`\`\`\n`,
        sourceName: "ddd-context-map.md",
        siblingPageId: pageId,
        spaceKey: "~user",
        embeddingMode: "drawio",
      });

      expect(client.createdPages).toEqual(["created-page"]);
      expect(result.page.id).toBe("created-page");
      expect(result.page.parentId).toBe("24");
      expect(result.source).toBe("ddd-context-map.md");
      expect(result.embeddingMode).toBe("drawio");
      expect(result.mermaidBlocks).toBe(2);
      expect(result.embeddedBlocks).toBe(1);
      expect(result.fallbackBlocks).toBe(1);
      expect(getEmbeddedDiagramNames(result, "drawio")).toEqual(["domain-context-map-01.drawio"]);
      expect(client.pageUpdateMessages).toContain("Publish ddd-context-map.md");
      expect(client.attachmentMutations).toEqual([
        { pageId: "created-page", remoteFileName: "domain-context-map-01.drawio" },
        { pageId: "created-page", remoteFileName: "domain-context-map-01.drawio.png" },
      ]);
      expect(client.customContentCreates).toEqual(["created-1"]);
      expect(getStoredPage(client).body?.atlas_doc_format?.value).toEqual(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({ type: "heading" }),
            expect.objectContaining({ type: "paragraph" }),
            expect.objectContaining({ type: "blockquote" }),
            expect.objectContaining({ type: "table" }),
            expect.objectContaining({ type: "extension" }),
            expect.objectContaining({
              type: "expand",
              attrs: expect.objectContaining({ title: "Original Mermaid source" }),
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: "codeBlock",
                  attrs: expect.objectContaining({ language: "mermaid" }),
                }),
              ]),
            }),
            expect.objectContaining({ type: "codeBlock" }),
          ]),
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps xychart publication fallback behavior explicit per block", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const { dir, drawioPath, previewPath } = createTempDiagramFiles("quarterly-sales-01.drawio", 900, 500);
    const service = new DrawioPublisherService(
      client as never,
      async (mermaid, diagramName) => {
        if (mermaid.includes("horizontal")) {
          expect(diagramName).toBe("quarterly-sales-02.drawio");
          throw new Error('unsupported_construct: "xychart-beta horizontal"');
        }
        expect(mermaid).toContain("xychart-beta");
        expect(diagramName).toBe("quarterly-sales-01.drawio");
        return {
          mermaidPath: `${dir}/input.mermaid`,
          drawioPath,
          previewPath,
          cleanup: async () => undefined,
        };
      },
    );

    try {
      const result = await service.createPageFromMarkdown({
        title: "Quarterly Sales",
        markdown: `# Quarterly Sales\n\n\`\`\`mermaid\nxychart-beta\ntitle "Quarterly Sales"\nx-axis [Q1, Q2, Q3, Q4]\ny-axis "Revenue" 0 --> 200\nbar [50, 80, 120, 90]\nline [40, 100, 110, 85]\n\`\`\`\n\n\`\`\`mermaid\nxychart-beta horizontal\nx-axis [Q1, Q2]\ny-axis 0 --> 100\nbar [30, 40]\n\`\`\`\n`,
        sourceName: "quarterly-sales.md",
        siblingPageId: pageId,
        spaceKey: "~user",
        embeddingMode: "drawio",
      });

      expect(result.page.id).toBe("created-page");
      expect(result.source).toBe("quarterly-sales.md");
      expect(result.embeddingMode).toBe("drawio");
      expect(result.mermaidBlocks).toBe(2);
      expect(result.embeddedBlocks).toBe(1);
      expect(result.fallbackBlocks).toBe(1);
      expect(getEmbeddedDiagramNames(result, "drawio")).toEqual(["quarterly-sales-01.drawio"]);
      expect(client.pageUpdateMessages).toContain("Publish quarterly-sales.md");
      expect(client.attachmentMutations).toEqual([
        { pageId: "created-page", remoteFileName: "quarterly-sales-01.drawio" },
        { pageId: "created-page", remoteFileName: "quarterly-sales-01.drawio.png" },
      ]);
      expect(getStoredPage(client).body?.atlas_doc_format?.value).toEqual(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({ type: "extension" }),
            expect.objectContaining({
              type: "expand",
              attrs: expect.objectContaining({ title: "Original Mermaid source" }),
            }),
            expect.objectContaining({
              type: "paragraph",
              content: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('Mermaid block 2 could not be converted automatically: unsupported_construct: "xychart-beta horizontal"'),
                }),
              ]),
            }),
            expect.objectContaining({
              type: "codeBlock",
              attrs: expect.objectContaining({ language: "mermaid" }),
            }),
          ]),
        }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a sibling page from a markdown file path", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const dir = mkdtempSync(join(tmpdir(), "drawio-markdown-"));
    const markdownFile = join(dir, "ddd-context-map.md");
    writeFileSync(markdownFile, "# Domain Context Map\n\n```mermaid\nflowchart TD\nA-->B\n```\n");
    const { dir: diagramDir, drawioPath, previewPath } = createTempDiagramFiles("ddd-context-map-01.drawio", 900, 500);
    const service = new DrawioPublisherService(
      client as never,
      async () => ({
        mermaidPath: `${diagramDir}/input.mermaid`,
        drawioPath,
        previewPath,
        cleanup: async () => undefined,
      }),
    );

    try {
      const result = await service.createPageFromMarkdownFile({
        title: "Domain Context Map",
        markdownFile,
        siblingPageId: pageId,
        spaceKey: "~user",
        embeddingMode: "drawio",
      });

      expect(result.page.id).toBe("created-page");
      expect(result.source).toBe("ddd-context-map.md");
      expect(result.mermaidBlocks).toBe(1);
      expect(result.embeddedBlocks).toBe(1);
      expect(result.fallbackBlocks).toBe(0);
      expect(client.pageUpdateMessages).toContain("Publish ddd-context-map.md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(diagramDir, { recursive: true, force: true });
    }
  });

  it("creates a sibling page from a relative markdown file path in the current workspace", async () => {
    const { client, pageId } = createExistingWidgetFixture();
    const dir = mkdtempSync(join(tmpdir(), "drawio-markdown-relative-"));
    const docsDir = join(dir, "docs");
    mkdirSync(docsDir);
    writeFileSync(join(docsDir, "ddd-context-map.md"), "# Domain Context Map\n\n```mermaid\nflowchart TD\nA-->B\n```\n");
    const { dir: diagramDir, drawioPath, previewPath } = createTempDiagramFiles("ddd-context-map-01.drawio", 900, 500);
    const service = new DrawioPublisherService(
      client as never,
      async () => ({
        mermaidPath: `${diagramDir}/input.mermaid`,
        drawioPath,
        previewPath,
        cleanup: async () => undefined,
      }),
    );
    const cwd = process.cwd();

    try {
      process.chdir(dir);

      const result = await service.createPageFromMarkdownFile({
        title: "Domain Context Map",
        markdownFile: "docs/ddd-context-map.md",
        siblingPageId: pageId,
        spaceKey: "~user",
        embeddingMode: "drawio",
      });

      expect(result.page.id).toBe("created-page");
      expect(result.source).toBe("ddd-context-map.md");
      expect(result.mermaidBlocks).toBe(1);
      expect(result.embeddedBlocks).toBe(1);
      expect(result.fallbackBlocks).toBe(0);
      expect(client.pageUpdateMessages).toContain("Publish ddd-context-map.md");
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
      rmSync(diagramDir, { recursive: true, force: true });
    }
  });
});
