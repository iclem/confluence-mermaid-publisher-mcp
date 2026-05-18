import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  ConfluenceCustomContent,
  DiagramTarget,
  DrawioExtension,
  DrawioGuestParams,
  JsonObject,
} from "./types.js";

export const DRAWIO_EXTENSION_KEY =
  "1afdce52-d22e-4d27-84db-5be989c3c83b/92d899e8-452f-4c9b-9f60-823ab11c8253/static/drawio";
export const DRAWIO_EXTENSION_ID =
  "ari:cloud:ecosystem::extension/1afdce52-d22e-4d27-84db-5be989c3c83b/92d899e8-452f-4c9b-9f60-823ab11c8253/static/drawio";
export const DRAWIO_CUSTOM_CONTENT_TYPE =
  "ac:com.mxgraph.confluence.plugins.diagramly:drawio-diagram";

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAtlasDocFormat(value: unknown): JsonObject {
  if (typeof value === "string") {
    return JSON.parse(value) as JsonObject;
  }
  if (isJsonObject(value)) {
    return value;
  }
  throw new Error("Unsupported atlas_doc_format payload");
}

export function serializeAtlasDocFormat(value: JsonObject): string {
  return JSON.stringify(value);
}

export function findDrawioExtensions(adfDocument: JsonObject): DrawioExtension[] {
  const results: DrawioExtension[] = [];

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry);
      }
      return;
    }
    if (!isJsonObject(node)) {
      return;
    }

    if (node.type === "extension" && isJsonObject(node.attrs)) {
      const attrs = node.attrs;
      const extensionType = attrs.extensionType;
      const extensionKey = attrs.extensionKey;
      const parameters = isJsonObject(attrs.parameters) ? attrs.parameters : undefined;
      const guestParams = parameters && isJsonObject(parameters.guestParams) ? parameters.guestParams : undefined;
      if (
        extensionType === "com.atlassian.ecosystem" &&
        extensionKey === DRAWIO_EXTENSION_KEY &&
        guestParams &&
        typeof guestParams.diagramName === "string" &&
        typeof guestParams.custContentId === "string"
      ) {
        results.push({
          node,
          attrs,
          parameters: parameters ?? {},
          guestParams: guestParams as unknown as DrawioGuestParams,
          diagramName: guestParams.diagramName,
          custContentId: guestParams.custContentId,
          localId: typeof attrs.localId === "string" ? attrs.localId : undefined,
        });
      }
    }

    const content = node.content;
    if (Array.isArray(content)) {
      visit(content);
    }
  }

  visit(adfDocument);
  return results;
}

export function selectDrawioExtension(extensions: DrawioExtension[], target: DiagramTarget): DrawioExtension {
  if (target.custContentId) {
    const byId = extensions.find((extension) => extension.custContentId === target.custContentId);
    if (!byId) {
      throw new Error(`No draw.io widget found for custom content ${target.custContentId}`);
    }
    return byId;
  }
  if (target.diagramName) {
    const byName = extensions.find((extension) => extension.diagramName === target.diagramName);
    if (!byName) {
      throw new Error(`No draw.io widget found for diagram ${target.diagramName}`);
    }
    return byName;
  }

  const index = target.index ?? 0;
  const extension = extensions[index];
  if (!extension) {
    throw new Error(`No draw.io widget found at index ${index}`);
  }
  return extension;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function buildSearchText(drawioXml: string): string {
  const values = new Set<string>();
  for (const match of drawioXml.matchAll(/\b(?:label|value)="([^"]*)"/g)) {
    const decoded = stripMarkup(decodeXmlEntities(match[1])).trim();
    if (decoded.length > 0) {
      values.add(decoded);
    }
  }
  return `${Array.from(values).join(" ")} `.trimEnd() + " ";
}

export function buildCustomContentRawBody(args: {
  pageId: string;
  diagramName: string;
  revision: number;
  drawioXml: string;
  isSketch?: boolean;
}): string {
  return JSON.stringify({
    search: buildSearchText(args.drawioXml),
    pageId: args.pageId,
    type: "page",
    diagramName: args.diagramName,
    revision: args.revision,
    isSketch: args.isSketch ?? false,
  });
}

export function parseCustomContentRawBody(customContent: ConfluenceCustomContent): JsonObject {
  const rawValue = customContent.body?.raw?.value;
  if (typeof rawValue !== "string") {
    throw new Error(`Custom content ${customContent.id} has no raw body`);
  }
  return JSON.parse(rawValue) as JsonObject;
}

export function getPngDimensions(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath);
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Not a PNG file: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function ensureAdfDocument(adfDocument: JsonObject | undefined): JsonObject {
  if (adfDocument && Array.isArray(adfDocument.content)) {
    return adfDocument;
  }
  return {
    type: "doc",
    version: 1,
    content: [],
  };
}

function getDocumentContent(adfDocument: JsonObject): unknown[] {
  const existing = adfDocument.content;
  if (Array.isArray(existing)) {
    return existing;
  }
  const content: unknown[] = [];
  adfDocument.content = content;
  return content;
}

function getTextNodeText(node: unknown): string {
  if (!isJsonObject(node)) {
    return "";
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    return node.content.map(getTextNodeText).join("");
  }
  return "";
}

function buildParagraphNode(text: string): JsonObject {
  return {
    type: "paragraph",
    content: text.length
      ? [
          {
            type: "text",
            text,
          },
        ]
      : [],
  };
}

export function buildDrawioExtensionNode(args: {
  pageId: string;
  spaceId?: string;
  spaceKey?: string;
  diagramName: string;
  custContentId: string;
  width: number;
  height: number;
  baseUrl: string;
}): JsonObject {
  const localId = randomUUID();
  const guestParams: DrawioGuestParams = {
    simple: false,
    zoom: 100,
    pageId: args.pageId,
    custContentId: args.custContentId,
    diagramDisplayName: args.diagramName,
    lbox: true,
    contentVer: 1,
    revision: 1,
    baseUrl: args.baseUrl,
    diagramName: args.diagramName,
    pCenter: false,
    width: args.width,
    links: "",
    tbstyle: "",
    height: args.height,
  };

  const parameters: JsonObject = {
    layout: "extension",
    guestParams,
    localId,
    extensionId: DRAWIO_EXTENSION_ID,
    extensionTitle: "draw.io Diagram",
  };

  if (args.spaceId) {
    parameters.embeddedMacroContext = {
      extensionData: {
        type: "macro",
        content: {
          id: args.pageId,
          type: "page",
        },
        space: {
          id: args.spaceId,
          ...(args.spaceKey ? { key: args.spaceKey } : {}),
        },
      },
    };
  }

  return {
    type: "extension",
    attrs: {
      layout: "default",
      extensionType: "com.atlassian.ecosystem",
      extensionKey: DRAWIO_EXTENSION_KEY,
      text: "draw.io Diagram",
      parameters,
      localId,
    },
  };
}

export function appendDrawioExtension(adfDocument: JsonObject | undefined, extensionNode: JsonObject): JsonObject {
  const document = ensureAdfDocument(adfDocument);
  const content = getDocumentContent(document);
  content.push(extensionNode);
  return document;
}

export function appendParagraph(adfDocument: JsonObject | undefined, text: string): JsonObject {
  const document = ensureAdfDocument(adfDocument);
  const content = getDocumentContent(document);
  content.push(buildParagraphNode(text));
  return document;
}

export function insertDrawioExtensionAtAnchor(
  adfDocument: JsonObject | undefined,
  extensionNode: JsonObject,
  anchorText: string,
): JsonObject {
  const document = ensureAdfDocument(adfDocument);
  const content = getDocumentContent(document);
  for (let index = 0; index < content.length; index += 1) {
    const node = content[index];
    if (!isJsonObject(node) || node.type !== "paragraph") {
      continue;
    }

    const paragraphText = getTextNodeText(node);
    const anchorIndex = paragraphText.indexOf(anchorText);
    if (anchorIndex === -1) {
      continue;
    }

    const insertionIndex = anchorIndex + anchorText.length;
    const beforeText = paragraphText.slice(0, insertionIndex);
    const afterText = paragraphText.slice(insertionIndex);
    const replacement: JsonObject[] = [buildParagraphNode(beforeText), extensionNode];
    if (afterText.length) {
      replacement.push(buildParagraphNode(afterText));
    }
    content.splice(index, 1, ...replacement);
    return document;
  }

  throw new Error(`Could not find anchor text in page body: ${anchorText}`);
}

export function updateDrawioExtensionMetadata(
  adfDocument: JsonObject,
  extension: DrawioExtension,
  args: { diagramName: string; width: number; height: number },
): JsonObject {
  const attrs = extension.attrs;
  const parameters = extension.parameters;
  const guestParams = extension.guestParams as unknown as JsonObject;
  guestParams.diagramName = args.diagramName;
  guestParams.diagramDisplayName = args.diagramName;
  guestParams.width = args.width;
  guestParams.height = args.height;
  parameters.guestParams = guestParams;
  attrs.parameters = parameters;
  return adfDocument;
}

export function inferPreviewPath(drawioPath: string): string {
  return `${drawioPath}.png`;
}

export function inferDiagramName(drawioPath: string, override?: string): string {
  return override ?? basename(drawioPath);
}
