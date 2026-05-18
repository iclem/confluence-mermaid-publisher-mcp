import { randomUUID } from "node:crypto";

import type { DiagramTarget, JsonObject } from "./types.js";

export const MACROPACK_EXTENSION_KEY =
  "1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack";
export const MACROPACK_EXTENSION_ID =
  "ari:cloud:ecosystem::extension/1ef074bf-c90d-4af8-9ea9-32d2e6ae9a90/2256cafd-362d-4b27-a796-139875a465b5/static/macro-pack";

export interface MacroPackExtension {
  node: JsonObject;
  attrs: JsonObject;
  parameters: JsonObject;
  guestParams: JsonObject;
  localId?: string;
  source: string;
  height?: number;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildEmbeddedMacroContext(args: { pageId: string; spaceId?: string; spaceKey?: string }): JsonObject | undefined {
  if (!args.spaceId) {
    return undefined;
  }

  return {
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

export function buildMacroPackExtensionNode(args: {
  pageId: string;
  spaceId?: string;
  spaceKey?: string;
  mermaid: string;
  height?: number;
}): JsonObject {
  const localId = randomUUID();
  const parameters: JsonObject = {
    layout: "extension",
    guestParams: {
      input: "mermaid",
      options: {
        mermaid: {
          enableCustomHeight: false,
          customIcons: false,
          height: args.height ?? 600,
        },
      },
      source: {
        text: args.mermaid,
        type: "text",
      },
      version: 1,
    },
    forgeEnvironment: "PRODUCTION",
    localId,
    extensionId: MACROPACK_EXTENSION_ID,
    extensionTitle: "Macro Pack",
  };

  const embeddedMacroContext = buildEmbeddedMacroContext(args);
  if (embeddedMacroContext) {
    parameters.embeddedMacroContext = embeddedMacroContext;
  }

  return {
    type: "extension",
    attrs: {
      layout: "default",
      extensionType: "com.atlassian.ecosystem",
      extensionKey: MACROPACK_EXTENSION_KEY,
      text: "Macro Pack",
      parameters,
      localId,
    },
  };
}

export function findMacroPackExtensions(adfDocument: JsonObject): MacroPackExtension[] {
  const results: MacroPackExtension[] = [];

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
      const source = guestParams && isJsonObject(guestParams.source) ? guestParams.source : undefined;
      const sourceText = source?.text;
      const mermaidOptions = guestParams && isJsonObject(guestParams.options) && isJsonObject(guestParams.options.mermaid)
        ? guestParams.options.mermaid
        : undefined;
      if (
        extensionType === "com.atlassian.ecosystem" &&
        extensionKey === MACROPACK_EXTENSION_KEY &&
        guestParams &&
        typeof sourceText === "string"
      ) {
        results.push({
          node,
          attrs,
          parameters: parameters ?? {},
          guestParams,
          localId: typeof attrs.localId === "string" ? attrs.localId : undefined,
          source: sourceText,
          height: typeof mermaidOptions?.height === "number" ? mermaidOptions.height : undefined,
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

export function selectMacroPackExtension(extensions: MacroPackExtension[], target: DiagramTarget): MacroPackExtension {
  if (target.localId) {
    const byLocalId = extensions.find((extension) => extension.localId === target.localId);
    if (!byLocalId) {
      throw new Error(`No MacroPack diagram found for localId ${target.localId}`);
    }
    return byLocalId;
  }

  if (target.index !== undefined) {
    const extension = extensions[target.index];
    if (!extension) {
      throw new Error(`No MacroPack diagram found at index ${target.index}`);
    }
    return extension;
  }

  if (target.custContentId || target.diagramName) {
    throw new Error("MacroPack diagrams can be selected only by localId or index");
  }

  if (extensions.length === 0) {
    throw new Error("No MacroPack diagrams found on page");
  }

  if (extensions.length > 1) {
    throw new Error("Multiple MacroPack diagrams found; provide localId or index");
  }

  return extensions[0]!;
}

export function updateMacroPackExtensionSource(
  extension: MacroPackExtension,
  args: { mermaid: string; height?: number },
): void {
  const guestParams = extension.guestParams;
  const source = isJsonObject(guestParams.source) ? guestParams.source : { type: "text" };
  source.text = args.mermaid;
  source.type = typeof source.type === "string" ? source.type : "text";
  guestParams.source = source;

  const options = isJsonObject(guestParams.options) ? guestParams.options : {};
  const mermaidOptions = isJsonObject(options.mermaid) ? options.mermaid : {};
  mermaidOptions.enableCustomHeight = false;
  mermaidOptions.customIcons = false;
  mermaidOptions.height = args.height ?? (typeof mermaidOptions.height === "number" ? mermaidOptions.height : 600);
  options.mermaid = mermaidOptions;
  guestParams.options = options;
  extension.parameters.guestParams = guestParams;
  extension.attrs.parameters = extension.parameters;
}
