import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { ConfluenceClient } from "./confluence-client.js";
import { convertMermaidToArtifacts, type ConvertedArtifacts } from "./converter.js";
import {
  DRAWIO_CUSTOM_CONTENT_TYPE,
  appendDrawioExtension,
  appendParagraph,
  buildCustomContentRawBody,
  buildDrawioExtensionNode,
  findDrawioExtensions,
  getPngDimensions,
  inferDiagramName,
  inferPreviewPath,
  insertDrawioExtensionAtAnchor,
  parseAtlasDocFormat,
  parseCustomContentRawBody,
  selectDrawioExtension,
  updateDrawioExtensionMetadata,
} from "./drawio.js";
import { DEFAULT_EMBEDDING_MODE } from "./embedding-mode.js";
import {
  buildMacroPackExtensionNode,
  findMacroPackExtensions,
  selectMacroPackExtension,
  updateMacroPackExtensionSource,
} from "./macropack.js";
import {
  buildBlockquoteNode,
  buildBulletListNode,
  buildCodeBlockNode,
  buildExpandNode,
  buildHeadingNode,
  buildOrderedListNode,
  buildParagraphNode,
  buildTableNode,
  parseMarkdown,
} from "./markdown.js";
import type {
  ConfluenceAttachment,
  ConfluenceCustomContent,
  ConfluencePage,
  DiagramTarget,
  EmbeddedDiagram,
  EmbeddingMode,
  InspectResult,
  JsonObject,
  MarkdownPublishResult,
} from "./types.js";

function detectContentType(fileName: string): string {
  if (fileName.endsWith(".drawio")) {
    return "application/vnd.jgraph.mxfile";
  }
  if (fileName.endsWith(".png")) {
    return "image/png";
  }
  throw new Error(`Unsupported attachment type for ${fileName}`);
}

function summarizePage(page: ConfluencePage): InspectResult["page"] {
  return {
    id: page.id,
    title: page.title,
    status: page.status,
    spaceId: page.spaceId,
    parentId: page.parentId,
    version: page.version,
  };
}

function buildEmbeddedDiagrams(adf: JsonObject): EmbeddedDiagram[] {
  const drawioDiagrams = findDrawioExtensions(adf).map((extension) => ({
    embeddingMode: "drawio" as const,
    diagramName: extension.diagramName,
    custContentId: extension.custContentId,
    localId: extension.localId,
    width: extension.guestParams.width,
    height: extension.guestParams.height,
  }));
  const macroPackDiagrams = findMacroPackExtensions(adf).map((extension) => ({
    embeddingMode: "macropack" as const,
    localId: extension.localId,
    height: extension.height,
  }));
  return [...drawioDiagrams, ...macroPackDiagrams];
}

function hasDrawioOnlySelector(target: DiagramTarget): boolean {
  return Boolean(target.custContentId || target.diagramName);
}

function hasGenericSelector(target: DiagramTarget): boolean {
  return Boolean(target.localId || target.index !== undefined);
}

function assertSingleDiagramSelector(target: DiagramTarget): void {
  const selectors = [
    target.diagramName ? "diagramName" : undefined,
    target.custContentId ? "custContentId" : undefined,
    target.localId ? "localId" : undefined,
    target.index !== undefined ? "index" : undefined,
  ].filter((selector): selector is string => Boolean(selector));

  if (selectors.length > 1) {
    throw new Error(
      `Provide only one existing diagram selector; received ${selectors.join(", ")}`,
    );
  }
}

export class DrawioPublisherService {
  constructor(
    private readonly client: ConfluenceClient,
    private readonly mermaidConverter: (mermaid: string, diagramName: string) => Promise<ConvertedArtifacts> = convertMermaidToArtifacts,
    private readonly defaultEmbeddingMode: EmbeddingMode = DEFAULT_EMBEDDING_MODE,
  ) {}

  private resolveEmbeddingMode(override?: EmbeddingMode): EmbeddingMode {
    return override ?? this.defaultEmbeddingMode;
  }

  private detectTargetEmbeddingMode(adf: JsonObject, target: DiagramTarget): EmbeddingMode | undefined {
    if (target.custContentId) {
      return "drawio";
    }

    if (target.localId) {
      const drawioExtension = findDrawioExtensions(adf).find((extension) => extension.localId === target.localId);
      const macroPackExtension = findMacroPackExtensions(adf).find((extension) => extension.localId === target.localId);
      if (drawioExtension && macroPackExtension) {
        throw new Error(`Multiple embedded diagrams matched localId ${target.localId}`);
      }
      if (drawioExtension) {
        return "drawio";
      }
      if (macroPackExtension) {
        return "macropack";
      }
      throw new Error(`No embedded diagram found for localId ${target.localId}`);
    }

    if (target.diagramName) {
      return "drawio";
    }

    return undefined;
  }

  private resolveIndexEmbeddingMode(adf: JsonObject): EmbeddingMode {
    const drawioCount = findDrawioExtensions(adf).length;
    const macroPackCount = findMacroPackExtensions(adf).length;

    if (drawioCount > 0 && macroPackCount > 0) {
      throw new Error(
        "Index selector is ambiguous on pages with both draw.io and MacroPack diagrams; provide embeddingMode or localId",
      );
    }

    if (drawioCount > 0) {
      return "drawio";
    }

    if (macroPackCount > 0) {
      return "macropack";
    }

    return this.defaultEmbeddingMode;
  }

  private resolveUpdateEmbeddingMode(adf: JsonObject, target: DiagramTarget, override?: EmbeddingMode): EmbeddingMode {
    if (hasDrawioOnlySelector(target) && override === "macropack") {
      throw new Error(
        `Target diagram does not use embedding mode ${override}; detected drawio instead`,
      );
    }

    if (target.index !== undefined) {
      if (override) {
        return override;
      }
      return this.resolveIndexEmbeddingMode(adf);
    }

    const detected = this.detectTargetEmbeddingMode(adf, target);
    if (override && detected && override !== detected) {
      throw new Error(
        `Target diagram does not use embedding mode ${override}; detected ${detected} instead`,
      );
    }

    if (!override && !detected && hasGenericSelector(target)) {
      return this.defaultEmbeddingMode;
    }

    return override ?? detected ?? this.defaultEmbeddingMode;
  }

  private buildInspectResult(args: {
    page: ConfluencePage;
    adf: JsonObject;
    attachments: ConfluenceAttachment[];
    customContents: ConfluenceCustomContent[];
  }): InspectResult {
    return {
      page: summarizePage(args.page),
      embeddedDiagrams: buildEmbeddedDiagrams(args.adf),
      attachments: args.attachments,
      customContents: args.customContents,
    };
  }

  private async createExtensionForArtifacts(args: {
    page: ConfluencePage;
    pageId: string;
    drawioPath: string;
    previewPath: string;
    diagramName: string;
    spaceKey?: string;
  }): Promise<JsonObject> {
    const dimensions = getPngDimensions(args.previewPath);

    await this.client.upsertAttachment({
      pageId: args.pageId,
      localPath: args.drawioPath,
      remoteFileName: args.diagramName,
      contentType: detectContentType(args.diagramName),
      comment: "draw.io diagram",
    });
    await this.client.upsertAttachment({
      pageId: args.pageId,
      localPath: args.previewPath,
      remoteFileName: `${args.diagramName}.png`,
      contentType: detectContentType(`${args.diagramName}.png`),
      comment: "draw.io preview",
    });

    const createdCustomContent = await this.client.createCustomContent({
      type: DRAWIO_CUSTOM_CONTENT_TYPE,
      title: args.diagramName,
      pageId: args.pageId,
      bodyRaw: buildCustomContentRawBody({
        pageId: args.pageId,
        diagramName: args.diagramName,
        revision: 1,
        drawioXml: readFileSync(args.drawioPath, "utf8"),
      }),
    });

    return buildDrawioExtensionNode({
      pageId: args.pageId,
      spaceId: args.page.spaceId,
      spaceKey: args.spaceKey,
      diagramName: args.diagramName,
      custContentId: createdCustomContent.id,
      width: dimensions.width,
      height: dimensions.height,
      baseUrl: this.client.getBaseUrl(),
    });
  }

  private async createMacroPackDiagram(args: {
    page: ConfluencePage;
    pageId: string;
    mermaid: string;
    spaceKey?: string;
    anchorText?: string;
  }): Promise<InspectResult> {
    const adf = parseAtlasDocFormat(args.page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const extensionNode = buildMacroPackExtensionNode({
      pageId: args.pageId,
      spaceId: args.page.spaceId,
      spaceKey: args.spaceKey,
      mermaid: args.mermaid,
    });
    const nextAdf = args.anchorText
      ? insertDrawioExtensionAtAnchor(adf as JsonObject, extensionNode, args.anchorText)
      : appendDrawioExtension(adf as JsonObject, extensionNode);
    const updatedPage = await this.client.updatePageAdf(args.page, nextAdf, "Create MacroPack diagram", "current");
    return this.inspectPage(updatedPage.id);
  }

  private async updateMacroPackDiagram(args: {
    page: ConfluencePage;
    pageId: string;
    mermaid: string;
    diagram: DiagramTarget;
  }): Promise<InspectResult> {
    const adf = parseAtlasDocFormat(args.page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const extensions = findMacroPackExtensions(adf);
    const targetExtension = selectMacroPackExtension(extensions, args.diagram);
    updateMacroPackExtensionSource(targetExtension, { mermaid: args.mermaid });
    const updatedPage = await this.client.updatePageAdf(args.page, adf, "Update MacroPack diagram", "current");
    return this.inspectPage(updatedPage.id);
  }

  async inspectPage(pageId: string): Promise<InspectResult> {
    const page = await this.client.getPage(pageId, "atlas_doc_format", false);
    const adf = parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const drawioExtensions = findDrawioExtensions(adf);
    const attachments = await this.client.listPageAttachments(pageId);
    const customContents = await Promise.all(
      drawioExtensions.map((extension) => this.client.getCustomContent(extension.custContentId)),
    );

    return this.buildInspectResult({ page, adf, attachments, customContents });
  }

  async updateExistingWidget(args: {
    pageId: string;
    drawioPath: string;
    previewPath?: string;
    diagramName?: string;
    widget: DiagramTarget;
  }): Promise<InspectResult> {
    assertSingleDiagramSelector(args.widget);
    const page = await this.client.getPage(args.pageId, "atlas_doc_format");
    const adf = parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const extensions = findDrawioExtensions(adf);
    const targetExtension = selectDrawioExtension(extensions, args.widget);
    const resolvedDiagramName = args.diagramName ?? targetExtension.diagramName;
    const previewPath = args.previewPath ?? inferPreviewPath(args.drawioPath);
    const dimensions = getPngDimensions(previewPath);

    await this.client.upsertAttachment({
      pageId: args.pageId,
      localPath: args.drawioPath,
      remoteFileName: resolvedDiagramName,
      contentType: detectContentType(resolvedDiagramName),
      comment: "draw.io diagram",
    });
    await this.client.upsertAttachment({
      pageId: args.pageId,
      localPath: previewPath,
      remoteFileName: `${resolvedDiagramName}.png`,
      contentType: detectContentType(`${resolvedDiagramName}.png`),
      comment: "draw.io preview",
    });

    const customContent = await this.client.getCustomContent(targetExtension.custContentId);
    const rawBody = parseCustomContentRawBody(customContent);
    const currentRevision = typeof rawBody.revision === "number" ? rawBody.revision : 1;

    await this.client.updateCustomContent({
      id: customContent.id,
      type: DRAWIO_CUSTOM_CONTENT_TYPE,
      title: resolvedDiagramName,
      pageId: args.pageId,
      bodyRaw: buildCustomContentRawBody({
        pageId: args.pageId,
        diagramName: resolvedDiagramName,
        revision: currentRevision + 1,
        drawioXml: readFileSync(args.drawioPath, "utf8"),
      }),
      versionNumber: customContent.version.number + 1,
    });

    if (
      resolvedDiagramName !== targetExtension.diagramName ||
      dimensions.width !== targetExtension.guestParams.width ||
      dimensions.height !== targetExtension.guestParams.height
    ) {
      updateDrawioExtensionMetadata(adf, targetExtension, {
        diagramName: resolvedDiagramName,
        width: dimensions.width,
        height: dimensions.height,
      });
      await this.client.updatePageAdf(page, adf, "Update draw.io widget metadata", "current");
    }

    return this.inspectPage(args.pageId);
  }

  async appendPageParagraph(args: {
    pageId: string;
    text: string;
  }): Promise<InspectResult> {
    const page = await this.client.getPage(args.pageId, "atlas_doc_format");
    const adf = parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const nextAdf = appendParagraph(adf, args.text);
    await this.client.updatePageAdf(page, nextAdf, "Append page paragraph", "current");
    return this.inspectPage(args.pageId);
  }

  async createWidget(args: {
    pageId: string;
    drawioPath: string;
    previewPath?: string;
    diagramName?: string;
    spaceKey?: string;
    anchorText?: string;
  }): Promise<InspectResult> {
    const page = await this.client.getPage(args.pageId, "atlas_doc_format");
    const adf = parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const existingExtensions = findDrawioExtensions(adf);
    const diagramName = inferDiagramName(args.drawioPath, args.diagramName);
    if (existingExtensions.some((extension) => extension.diagramName === diagramName)) {
      throw new Error(`A draw.io widget for ${diagramName} already exists on page ${args.pageId}`);
    }

    const previewPath = args.previewPath ?? inferPreviewPath(args.drawioPath);
    const extensionNode = await this.createExtensionForArtifacts({
      page,
      pageId: args.pageId,
      drawioPath: args.drawioPath,
      previewPath,
      diagramName,
      spaceKey: args.spaceKey,
    });
    const nextAdf = args.anchorText
      ? insertDrawioExtensionAtAnchor(adf as JsonObject, extensionNode, args.anchorText)
      : appendDrawioExtension(adf as JsonObject, extensionNode);
    await this.client.updatePageAdf(page, nextAdf, "Create draw.io widget", "current");

    return this.inspectPage(args.pageId);
  }

  async createDiagramFromMermaid(args: {
    pageId: string;
    mermaid: string;
    diagramName?: string;
    spaceKey?: string;
    anchorText?: string;
    embeddingMode?: EmbeddingMode;
  }): Promise<InspectResult> {
    const embeddingMode = this.resolveEmbeddingMode(args.embeddingMode);

    if (embeddingMode === "macropack") {
      const page = await this.client.getPage(args.pageId, "atlas_doc_format");
      return this.createMacroPackDiagram({
        page,
        pageId: args.pageId,
        mermaid: args.mermaid,
        spaceKey: args.spaceKey,
        anchorText: args.anchorText,
      });
    }

    const diagramName = args.diagramName ?? "diagram.drawio";
    const artifacts = await this.mermaidConverter(args.mermaid, diagramName);
    try {
      return this.createWidget({
        pageId: args.pageId,
        drawioPath: artifacts.drawioPath,
        previewPath: artifacts.previewPath,
        diagramName,
        spaceKey: args.spaceKey,
        anchorText: args.anchorText,
      });
    } finally {
      await artifacts.cleanup();
    }
  }

  async updateDiagramFromMermaid(args: {
    pageId: string;
    mermaid: string;
    diagramName?: string;
    diagram: DiagramTarget;
    embeddingMode?: EmbeddingMode;
  }): Promise<InspectResult> {
    assertSingleDiagramSelector(args.diagram);
    const page = await this.client.getPage(args.pageId, "atlas_doc_format");
    const adf = parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
    const embeddingMode = this.resolveUpdateEmbeddingMode(adf, args.diagram, args.embeddingMode);

    if (embeddingMode === "macropack") {
      return this.updateMacroPackDiagram({
        page,
        pageId: args.pageId,
        mermaid: args.mermaid,
        diagram: args.diagram,
      });
    }

    const targetDiagramName = args.diagramName ?? args.diagram.diagramName ?? "diagram.drawio";
    const artifacts = await this.mermaidConverter(args.mermaid, targetDiagramName);
    try {
      return this.updateExistingWidget({
        pageId: args.pageId,
        drawioPath: artifacts.drawioPath,
        previewPath: artifacts.previewPath,
        diagramName: args.diagramName,
        widget: args.diagram,
      });
    } finally {
      await artifacts.cleanup();
    }
  }

  private async publishMarkdownToPage(args: {
    page: ConfluencePage;
    markdown: string;
    sourceName?: string;
    spaceKey?: string;
    embeddingMode?: EmbeddingMode;
  }): Promise<MarkdownPublishResult> {
    const source = args.sourceName ?? "markdown.md";
    const page = args.page;
    const embeddingMode = this.resolveEmbeddingMode(args.embeddingMode);
    const blocks = parseMarkdown(args.markdown);
    const adfDocument: JsonObject = { type: "doc", version: 1, content: [] };
    const content = adfDocument.content as unknown[];
    const baseDiagramName = page.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "diagram";
    let mermaidBlocks = 0;
    let embeddedBlocks = 0;
    let fallbackBlocks = 0;

    for (const block of blocks) {
      if (block.type === "heading") {
        content.push(buildHeadingNode(block.level, block.text));
        continue;
      }
      if (block.type === "paragraph") {
        content.push(buildParagraphNode(block.text));
        continue;
      }
      if (block.type === "blockquote") {
        content.push(buildBlockquoteNode(block.text));
        continue;
      }
      if (block.type === "bulletList") {
        content.push(buildBulletListNode(block.items));
        continue;
      }
      if (block.type === "orderedList") {
        content.push(buildOrderedListNode(block.items, block.start));
        continue;
      }
      if (block.type === "table") {
        content.push(buildTableNode(block.header, block.rows));
        continue;
      }
      if (block.type === "rule") {
        content.push({ type: "rule" });
        continue;
      }
      if (block.type === "code") {
        content.push(buildCodeBlockNode(block.text, block.language));
        continue;
      }

      mermaidBlocks += 1;
      try {
        if (embeddingMode === "macropack") {
          content.push(buildMacroPackExtensionNode({
            pageId: page.id,
            spaceId: page.spaceId,
            spaceKey: args.spaceKey,
            mermaid: block.text,
          }));
          embeddedBlocks += 1;
          continue;
        }

        const diagramName = `${baseDiagramName}-${String(mermaidBlocks).padStart(2, "0")}.drawio`;
        const artifacts = await this.mermaidConverter(block.text, diagramName);
        try {
          const extensionNode = await this.createExtensionForArtifacts({
            page,
            pageId: page.id,
            drawioPath: artifacts.drawioPath,
            previewPath: artifacts.previewPath,
            diagramName,
            spaceKey: args.spaceKey,
          });
          content.push(extensionNode);
          content.push(buildExpandNode("Original Mermaid source", [buildCodeBlockNode(block.text, "mermaid")]));
          embeddedBlocks += 1;
        } finally {
          await artifacts.cleanup();
        }
      } catch (error) {
        fallbackBlocks += 1;
        const message = error instanceof Error ? error.message : String(error);
        content.push(
          buildParagraphNode(
            `Mermaid block ${mermaidBlocks} could not be converted automatically: ${message}`,
          ),
        );
        content.push(buildCodeBlockNode(block.text, "mermaid"));
      }
    }

    const latestPage = await this.client.getPage(page.id, "atlas_doc_format", false);
    const updatedPage = await this.client.updatePageAdf(
      latestPage,
      adfDocument,
      `Publish ${source}`,
      "current",
    );
    const inspect = await this.inspectPage(page.id);

    return {
      page: summarizePage(updatedPage),
      source,
      embeddingMode,
      mermaidBlocks,
      embeddedBlocks,
      fallbackBlocks,
      embeddedDiagrams: inspect.embeddedDiagrams,
    };
  }

  async createPageFromMarkdown(args: {
    title: string;
    markdown: string;
    sourceName?: string;
    spaceId?: string;
    parentId?: string;
    siblingPageId?: string;
    spaceKey?: string;
    embeddingMode?: EmbeddingMode;
  }): Promise<MarkdownPublishResult> {
    const source = args.sourceName ?? "markdown.md";
    const siblingPage =
      args.siblingPageId ? await this.client.getPage(args.siblingPageId, "atlas_doc_format", false) : undefined;
    const spaceId = args.spaceId ?? siblingPage?.spaceId;
    if (!spaceId) {
      throw new Error("Provide spaceId or siblingPageId");
    }

    const page = await this.client.createPage({
      spaceId,
      parentId: args.parentId ?? siblingPage?.parentId,
      title: args.title,
      status: "current",
      adfDocument: { type: "doc", version: 1, content: [] },
    });
    return this.publishMarkdownToPage({
      page,
      markdown: args.markdown,
      sourceName: source,
      spaceKey: args.spaceKey,
      embeddingMode: args.embeddingMode,
    });
  }

  async createPageFromMarkdownFile(args: {
    title: string;
    markdownFile: string;
    sourceName?: string;
    spaceId?: string;
    parentId?: string;
    siblingPageId?: string;
    spaceKey?: string;
    embeddingMode?: EmbeddingMode;
  }): Promise<MarkdownPublishResult> {
    const markdownFile = resolve(args.markdownFile);
    const markdown = await readFile(markdownFile, "utf8");
    return this.createPageFromMarkdown({
      title: args.title,
      markdown,
      sourceName: args.sourceName ?? basename(markdownFile),
      spaceId: args.spaceId,
      parentId: args.parentId,
      siblingPageId: args.siblingPageId,
      spaceKey: args.spaceKey,
      embeddingMode: args.embeddingMode,
    });
  }

  async updatePageFromMarkdown(args: {
    pageId: string;
    markdown: string;
    sourceName?: string;
    spaceKey?: string;
    embeddingMode?: EmbeddingMode;
  }): Promise<MarkdownPublishResult> {
    const page = await this.client.getPage(args.pageId, "atlas_doc_format", false);
    return this.publishMarkdownToPage({
      page,
      markdown: args.markdown,
      sourceName: args.sourceName,
      spaceKey: args.spaceKey,
      embeddingMode: args.embeddingMode,
    });
  }

  async updatePageFromMarkdownFile(args: {
    pageId: string;
    markdownFile: string;
    sourceName?: string;
    spaceKey?: string;
    embeddingMode?: EmbeddingMode;
  }): Promise<MarkdownPublishResult> {
    const markdownFile = resolve(args.markdownFile);
    const markdown = await readFile(markdownFile, "utf8");
    return this.updatePageFromMarkdown({
      pageId: args.pageId,
      markdown,
      sourceName: args.sourceName ?? basename(markdownFile),
      spaceKey: args.spaceKey,
      embeddingMode: args.embeddingMode,
    });
  }
}
