import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { appendExtension, appendParagraph, insertExtensionAtAnchor, parseAtlasDocFormat } from "./adf.js";
import { ConfluenceClient } from "./confluence-client.js";
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
  InspectResult,
  JsonObject,
  MarkdownPublishResult,
} from "./types.js";

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
  return findMacroPackExtensions(adf).map((extension) => ({
    localId: extension.localId,
    height: extension.height,
  }));
}

export class ConfluenceMermaidPublisherService {
  constructor(private readonly client: ConfluenceClient) {}

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
      ? insertExtensionAtAnchor(adf, extensionNode, args.anchorText)
      : appendExtension(adf, extensionNode);
    const updatedPage = await this.client.updatePageAdf(args.page, nextAdf, "Create MacroPack diagram", "current");
    return this.inspectPage(updatedPage.id);
  }

  private async updateMacroPackDiagram(args: {
    page: ConfluencePage;
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
    const attachments = await this.client.listPageAttachments(pageId);
    return this.buildInspectResult({ page, adf, attachments, customContents: [] });
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

  async createDiagramFromMermaid(args: {
    pageId: string;
    mermaid: string;
    spaceKey?: string;
    anchorText?: string;
  }): Promise<InspectResult> {
    const page = await this.client.getPage(args.pageId, "atlas_doc_format");
    return this.createMacroPackDiagram({
      page,
      pageId: args.pageId,
      mermaid: args.mermaid,
      spaceKey: args.spaceKey,
      anchorText: args.anchorText,
    });
  }

  async updateDiagramFromMermaid(args: {
    pageId: string;
    mermaid: string;
    diagram: DiagramTarget;
  }): Promise<InspectResult> {
    const page = await this.client.getPage(args.pageId, "atlas_doc_format");
    return this.updateMacroPackDiagram({
      page,
      mermaid: args.mermaid,
      diagram: args.diagram,
    });
  }

  private async publishMarkdownToPage(args: {
    page: ConfluencePage;
    markdown: string;
    sourceName?: string;
    spaceKey?: string;
  }): Promise<MarkdownPublishResult> {
    const source = args.sourceName ?? "markdown.md";
    const page = args.page;
    const blocks = parseMarkdown(args.markdown);
    const adfDocument: JsonObject = { type: "doc", version: 1, content: [] };
    const content = adfDocument.content as unknown[];
    let mermaidBlocks = 0;
    let embeddedBlocks = 0;

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
      content.push(buildMacroPackExtensionNode({
        pageId: page.id,
        spaceId: page.spaceId,
        spaceKey: args.spaceKey,
        mermaid: block.text,
      }));
      embeddedBlocks += 1;
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
      mermaidBlocks,
      embeddedBlocks,
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
    });
  }

  async updatePageFromMarkdown(args: {
    pageId: string;
    markdown: string;
    sourceName?: string;
    spaceKey?: string;
  }): Promise<MarkdownPublishResult> {
    const page = await this.client.getPage(args.pageId, "atlas_doc_format", false);
    return this.publishMarkdownToPage({
      page,
      markdown: args.markdown,
      sourceName: args.sourceName,
      spaceKey: args.spaceKey,
    });
  }

  async updatePageFromMarkdownFile(args: {
    pageId: string;
    markdownFile: string;
    sourceName?: string;
    spaceKey?: string;
  }): Promise<MarkdownPublishResult> {
    const markdownFile = resolve(args.markdownFile);
    const markdown = await readFile(markdownFile, "utf8");
    return this.updatePageFromMarkdown({
      pageId: args.pageId,
      markdown,
      sourceName: args.sourceName ?? basename(markdownFile),
      spaceKey: args.spaceKey,
    });
  }
}
