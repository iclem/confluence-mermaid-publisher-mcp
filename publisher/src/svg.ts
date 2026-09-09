import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { renderMermaidSVG } from "agentic-mermaid/agent";

import type { ConfluenceAttachment, DiagramTarget, JsonObject } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ALT_PREFIX = "Mermaid diagram: ";
export const SVG_ATTACHMENT_COMMENT = "Adaptive Mermaid SVG";

export interface RenderedSvg {
  svg: string;
  width: number;
  height: number;
}

/** Render unchanged Mermaid with a light fallback and browser-selected dark palette. */
export function renderAdaptiveSvg(mermaid: string): RenderedSvg {
  const parse = (style: string) => new DOMParser({
    onError: (_level, message) => { throw new Error(message); },
  }).parseFromString(renderMermaidSVG(mermaid, { security: "strict", style }), "image/svg+xml");
  const light = parse("github-light");
  const dark = parse("github-dark");
  const lightNodes = Array.from(light.getElementsByTagName("*"));
  const darkNodes = Array.from(dark.getElementsByTagName("*"));
  const rules: string[] = [];
  const mismatch = () => { throw new Error("Adaptive SVG themes produced different geometry or content"); };
  if (lightNodes.length !== darkNodes.length) mismatch();
  for (const [index, node] of lightNodes.entries()) {
    const counterpart = darkNodes[index]!;
    if (node.tagName !== counterpart.tagName) mismatch();
    if (node.tagName === "style") {
      if (node.textContent !== counterpart.textContent) rules.push(counterpart.textContent ?? "");
    } else if (node.childNodes.length === 1 && node.firstChild?.nodeType === 3 && node.textContent !== counterpart.textContent) {
      mismatch();
    }
    const names = new Set([...Array.from(node.attributes), ...Array.from(counterpart.attributes)].map((attribute) => attribute.name));
    const declarations: string[] = [];
    for (const name of names) {
      const value = counterpart.getAttribute(name);
      if (node.getAttribute(name) === value) continue;
      if (!value || !["fill", "stroke", "style"].includes(name)) mismatch();
      if (name === "style") {
        declarations.push(...value!.split(";").filter(Boolean).map((entry) => `${entry} !important;`));
      } else {
        declarations.push(`${name}:${value} !important;`);
      }
    }
    if (declarations.length) {
      const className = `adaptive-node-${index}`;
      node.setAttribute("class", `${node.getAttribute("class") ?? ""} ${className}`.trim());
      rules.push(`.${className} {${declarations.join("")}}`);
    }
  }
  const root = light.documentElement;
  if (!root) throw new Error("Renderer returned an empty SVG");
  const viewBox = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2]! <= 0 || viewBox[3]! <= 0) {
    throw new Error("Renderer returned invalid SVG dimensions");
  }
  const css = light.createElementNS(SVG_NS, "style");
  css.appendChild(light.createTextNode(`@media (prefers-color-scheme: dark) {\n${rules.join("\n")}\n}`));
  root.appendChild(css);
  const metadata = light.createElementNS(SVG_NS, "metadata");
  metadata.setAttribute("id", "mermaid-source");
  metadata.appendChild(light.createTextNode(mermaid));
  root.appendChild(metadata);
  return { svg: new XMLSerializer().serializeToString(light), width: viewBox[2]!, height: viewBox[3]! };
}

/** Restrict attachment names to file names, never filesystem paths. */
export function svgFileName(name = "diagram.svg"): string {
  const normalized = name.trim();
  if (!normalized || /[\\/\x00-\x1f]/.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error("SVG diagramName must be a file name without path separators");
  }
  return normalized.endsWith(".svg") ? normalized : `${normalized}.svg`;
}

/** Build a native Confluence media image using the latest attachment fileId. */
export function buildSvgMedia(pageId: string, attachment: ConfluenceAttachment, dimensions: Pick<RenderedSvg, "width" | "height">): JsonObject {
  if (!attachment.fileId) throw new Error(`No media fileId returned for SVG attachment ${attachment.title}`);
  return {
    type: "mediaSingle",
    attrs: { layout: "align-start", width: Math.min(760, dimensions.width), widthType: "pixel" },
    content: [{ type: "media", attrs: {
      id: attachment.fileId, type: "file", collection: `contentId-${pageId}`,
      width: dimensions.width, height: dimensions.height, alt: `${ALT_PREFIX}${attachment.title}`,
    } }],
  };
}

export interface SvgDiagram {
  node: JsonObject;
  attachment: ConfluenceAttachment;
  localId: string;
  diagramName: string;
  width?: number;
  height?: number;
  sourceBlock?: JsonObject;
}

/** Identify publisher-owned SVG images; unrelated page images are excluded. */
export function findSvgDiagrams(adf: JsonObject, attachments: ConfluenceAttachment[]): SvgDiagram[] {
  const results: SvgDiagram[] = [];
  const visit = (node: JsonObject, nextSibling?: JsonObject) => {
    const content = Array.isArray(node.content) ? node.content as JsonObject[] : [];
    if (node.type === "mediaSingle") {
      const media = content.find((child) => child.type === "media");
      const attrs = media?.attrs as JsonObject | undefined;
      const attachment = attachments.find((item) => item.fileId && item.fileId === attrs?.id && item.title.endsWith(".svg"));
      if (attachment?.comment === SVG_ATTACHMENT_COMMENT && attrs) {
        const expandAttrs = nextSibling?.attrs as JsonObject | undefined;
        const sourceBlock = nextSibling?.type === "expand" && expandAttrs?.title === "Original Mermaid source" && Array.isArray(nextSibling.content)
          ? (nextSibling.content as JsonObject[]).find((item) => item.type === "codeBlock" && (item.attrs as JsonObject | undefined)?.language === "mermaid")
          : undefined;
        results.push({ node, attachment, localId: attachment.id, diagramName: attachment.title,
          sourceBlock,
          width: typeof attrs.width === "number" ? attrs.width : undefined,
          height: typeof attrs.height === "number" ? attrs.height : undefined });
      }
    }
    content.forEach((child, index) => visit(child, content[index + 1]));
  };
  visit(adf);
  return results;
}

/** Select an SVG using its stable attachment ID, name, or mode-local index. */
export function selectSvgDiagram(diagrams: SvgDiagram[], target: DiagramTarget): SvgDiagram {
  const matches = target.localId ? diagrams.filter((item) => item.localId === target.localId)
    : target.diagramName ? diagrams.filter((item) => item.diagramName === target.diagramName)
    : target.index !== undefined ? diagrams.slice(target.index, target.index + 1) : diagrams;
  if (target.custContentId || matches.length !== 1) throw new Error("Select exactly one SVG diagram by localId, diagramName, or index");
  return matches[0]!;
}
