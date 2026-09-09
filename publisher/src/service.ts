import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

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
import { buildSvgMedia, findSvgDiagrams, renderAdaptiveSvg, selectSvgDiagram, svgFileName, SVG_ATTACHMENT_COMMENT } from "./svg.js";
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

function buildEmbeddedDiagrams(adf: JsonObject, attachments: ConfluenceAttachment[]): EmbeddedDiagram[] {
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
  const svgDiagrams = findSvgDiagrams(adf, attachments).map(({ localId, diagramName, width, height }) => ({
    embeddingMode: "svg" as const, localId, diagramName, width, height,
  }));
  return [...drawioDiagrams, ...macroPackDiagrams, ...svgDiagrams];
}

function hasDrawioOnlySelector(target: DiagramTarget): boolean {
  return Boolean(target.custContentId);
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

  private detectTargetEmbeddingMode(adf: JsonObject, target: DiagramTarget, attachments: ConfluenceAttachment[]): EmbeddingMode | undefined {
    if (target.custContentId) {
      return "drawio";
    }

    if (target.localId) {
      const drawioExtension = findDrawioExtensions(adf).find((extension) => extension.localId === target.localId);
      const macroPackExtension = findMacroPackExtensions(adf).find((extension) => extension.localId === target.localId);
      const svgDiagram = findSvgDiagrams(adf, attachments).find((diagram) => diagram.localId === target.localId);
      if ([drawioExtension, macroPackExtension, svgDiagram].filter(Boolean).length > 1) {
        throw new Error(`Multiple embedded diagrams matched localId ${target.localId}`);
      }
      if (drawioExtension) {
        return "drawio";
      }
      if (macroPackExtension) {
        return "macropack";
      }
      if (svgDiagram) return "svg";
      throw new Error(`No embedded diagram found for localId ${target.localId}`);
    }

    if (target.diagramName) {
      const svg = findSvgDiagrams(adf, attachments).some((diagram) => diagram.diagramName === target.diagramName);
      const drawio = findDrawioExtensions(adf).some((diagram) => diagram.diagramName === target.diagramName);
      if (svg && drawio) throw new Error("Diagram name is ambiguous; use localId");
      if (svg) return "svg";
      return "drawio";
    }

    return undefined;
  }

  private resolveIndexEmbeddingMode(adf: JsonObject, attachments: ConfluenceAttachment[]): EmbeddingMode {
    const drawioCount = findDrawioExtensions(adf).length;
    const macroPackCount = findMacroPackExtensions(adf).length;
    const svgCount = findSvgDiagrams(adf, attachments).length;

    if ([drawioCount, macroPackCount, svgCount].filter((count) => count > 0).length > 1) {
      throw new Error(
        "Index selector is ambiguous on pages with multiple embedding modes; provide embeddingMode or localId",
      );
    }

    if (drawioCount > 0) {
      return "drawio";
    }

    if (macroPackCount > 0) {
      return "macropack";
    }
    if (svgCount > 0) return "svg";

    return this.defaultEmbeddingMode;
  }

  private resolveUpdateEmbeddingMode(adf: JsonObject, target: DiagramTarget, override: EmbeddingMode | undefined, attachments: ConfluenceAttachment[]): EmbeddingMode {
    if (hasDrawioOnlySelector(target) && override && override !== "drawio") {
      throw new Error(
        `Target diagram does not use embedding mode ${override}; detected drawio instead`,
      );
    }

    if (target.index !== undefined) {
      if (override) {
        return override;
      }
      return this.resolveIndexEmbeddingMode(adf, attachments);
    }
    const detected = this.detectTargetEmbeddingMode(adf, target, attachments);
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
      embeddedDiagrams: buildEmbeddedDiagrams(args.adf, args.attachments),
      attachments: args.attachments,
      customContents: args.customContents,
    };
  }

  private async createSvgImage(pageId: string, mermaid: string, name: string): Promise<JsonObject> {
    const filename = svgFileName(name);
    const rendered = renderAdaptiveSvg(mermaid);
    const directory = await mkdtemp(join(tmpdir(), "mermaid-svg-"));
    try {
      const localPath = join(directory, filename);
      await writeFile(localPath, rendered.svg, "utf8");
      const uploaded = await this.client.upsertAttachment({
        pageId, localPath, remoteFileName: filename, contentType: "image/svg+xml", comment: SVG_ATTACHMENT_COMMENT,
      });
      // REST v1 uploads omit fileId; v2 supplies the current media identity, including after replacement.
      const attachment = (await this.client.listPageAttachments(pageId, filename)).find((item) => item.id === uploaded.id);
      if (!attachment) throw new Error(`Cannot resolve uploaded SVG attachment ${filename}`);
      return buildSvgMedia(pageId, attachment, rendered);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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

    // The draw.io app renders the attachment version pinned by contentVer, so
    // the macro must track the attachment version produced by this upload —
    // otherwise republishing keeps showing the first version forever.
    const diagramAttachment = await this.client.upsertAttachment({
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
      contentVer: diagramAttachment.version?.number ?? 1,
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

    // The draw.io app renders the attachment version pinned by contentVer, so
    // the macro must track the new attachment version — otherwise the page
    // keeps rendering the previously pinned version.
    const diagramAttachment = await this.client.upsertAttachment({
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

    const newRevision = currentRevision + 1;
    await this.client.updateCustomContent({
      id: customContent.id,
      type: DRAWIO_CUSTOM_CONTENT_TYPE,
      title: resolvedDiagramName,
      pageId: args.pageId,
      bodyRaw: buildCustomContentRawBody({
        pageId: args.pageId,
        diagramName: resolvedDiagramName,
        revision: newRevision,
        drawioXml: readFileSync(args.drawioPath, "utf8"),
      }),
      versionNumber: customContent.version.number + 1,
    });

    const newContentVer = diagramAttachment.version?.number ?? targetExtension.guestParams.contentVer;
    if (
      resolvedDiagramName !== targetExtension.diagramName ||
      dimensions.width !== targetExtension.guestParams.width ||
      dimensions.height !== targetExtension.guestParams.height ||
      newContentVer !== targetExtension.guestParams.contentVer
    ) {
      updateDrawioExtensionMetadata(adf, targetExtension, {
        diagramName: resolvedDiagramName,
        width: dimensions.width,
        height: dimensions.height,
        contentVer: newContentVer,
        revision: newRevision,
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

    if (embeddingMode === "svg") {
      const page = await this.client.getPage(args.pageId, "atlas_doc_format");
      const adf = parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] });
      const filename = svgFileName(args.diagramName);
      if ((await this.client.listPageAttachments(args.pageId, filename)).length) {
        throw new Error(`An attachment named ${filename} already exists; choose another name or update the diagram`);
      }
      // Validate an anchor before uploading anything.
      if (args.anchorText) insertDrawioExtensionAtAnchor(structuredClone(adf), {}, args.anchorText);
      const image = await this.createSvgImage(args.pageId, args.mermaid, filename);
      const nextAdf = args.anchorText ? insertDrawioExtensionAtAnchor(adf, image, args.anchorText) : appendDrawioExtension(adf, image);
      await this.client.updatePageAdf(page, nextAdf, "Create Mermaid SVG", "current");
      return this.inspectPage(args.pageId);
    }

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
    const attachments = await this.client.listPageAttachments(args.pageId);
    const embeddingMode = this.resolveUpdateEmbeddingMode(adf, args.diagram, args.embeddingMode, attachments);

    if (embeddingMode === "svg") {
      const target = selectSvgDiagram(findSvgDiagrams(adf, attachments), args.diagram);
      const filename = svgFileName(args.diagramName ?? target.diagramName);
      if (filename !== target.diagramName) throw new Error("Renaming an SVG on update is not supported; keep its diagramName or create a new diagram");
      const image = await this.createSvgImage(args.pageId, args.mermaid, filename);
      Object.assign(target.node, image);
      if (target.sourceBlock) Object.assign(target.sourceBlock, buildCodeBlockNode(args.mermaid, "mermaid"));
      await this.client.updatePageAdf(page, adf, "Update Mermaid SVG", "current");
      return this.inspectPage(args.pageId);
    }

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
    const existingSvgNames = embeddingMode === "svg"
      ? new Set(findSvgDiagrams(
        parseAtlasDocFormat(page.body?.atlas_doc_format?.value ?? { type: "doc", version: 1, content: [] }),
        await this.client.listPageAttachments(page.id),
      ).map((diagram) => diagram.diagramName))
      : new Set<string>();
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
        if (embeddingMode === "svg") {
          const filename = `${baseDiagramName}-${String(mermaidBlocks).padStart(2, "0")}.svg`;
          if (!existingSvgNames.has(filename) && (await this.client.listPageAttachments(page.id, filename)).length) {
            throw new Error(`Attachment ${filename} already exists and is not a managed Mermaid SVG`);
          }
          content.push(await this.createSvgImage(page.id, block.text, filename));
          content.push(buildExpandNode("Original Mermaid source", [buildCodeBlockNode(block.text, "mermaid")]));
          embeddedBlocks += 1;
          continue;
        }
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

        const draftName = `${baseDiagramName}-${String(mermaidBlocks).padStart(2, "0")}.drawio`;
        const artifacts = await this.mermaidConverter(block.text, draftName);
        try {
          // Include a content hash in the diagram name: the draw.io app caches
          // rendered content per page+name, so unchanged diagrams keep their
          // name (and caches) while edited diagrams get fresh names that every
          // cache layer picks up.
          const contentHash = createHash("sha1")
            .update(readFileSync(artifacts.drawioPath))
            .digest("hex")
            .slice(0, 8);
          const diagramName = draftName.replace(/\.drawio$/, `-${contentHash}.drawio`);
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
