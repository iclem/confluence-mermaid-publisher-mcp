import type { JsonObject } from "./types.js";

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

export function appendExtension(adfDocument: JsonObject | undefined, extensionNode: JsonObject): JsonObject {
  const document = ensureAdfDocument(adfDocument);
  getDocumentContent(document).push(extensionNode);
  return document;
}

export function appendParagraph(adfDocument: JsonObject | undefined, text: string): JsonObject {
  const document = ensureAdfDocument(adfDocument);
  getDocumentContent(document).push(buildParagraphNode(text));
  return document;
}

export function insertExtensionAtAnchor(
  adfDocument: JsonObject | undefined,
  extensionNode: JsonObject,
  anchorText: string,
): JsonObject {
  const document = ensureAdfDocument(adfDocument);
  const content = getDocumentContent(document);
  const anchorIndex = content.findIndex((node) => getTextNodeText(node).includes(anchorText));
  if (anchorIndex === -1) {
    throw new Error(`Anchor text not found: ${anchorText}`);
  }
  content.splice(anchorIndex + 1, 0, extensionNode);
  return document;
}
