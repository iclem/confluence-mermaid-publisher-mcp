import { MarkdownTransformer } from "@atlaskit/editor-markdown-transformer";
import { JSONTransformer } from "@atlaskit/editor-json-transformer";

import type { JsonObject } from "./types.js";

/** Convert a complete Markdown document using Atlassian's schema and transformers. */
export function markdownToAdf(markdown: string): JsonObject {
  return new JSONTransformer().encode(new MarkdownTransformer().parse(markdown)) as JsonObject;
}

/** Build plain diagnostic text without interpreting it as Markdown. */
export function buildParagraphNode(text: string): JsonObject {
  return { type: "paragraph", content: text ? [{ type: "text", text }] : [] };
}

export function buildExpandNode(title: string, content: JsonObject[]): JsonObject {
  return { type: "expand", attrs: { title }, content };
}

export function buildCodeBlockNode(text: string, language?: string): JsonObject {
  return {
    type: "codeBlock",
    attrs: language ? { language } : {},
    content: text ? [{ type: "text", text }] : [],
  };
}
