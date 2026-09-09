import { describe, expect, it } from "vitest";
import { markdownToAdf } from "./markdown.js";
import type { JsonObject } from "./types.js";

function flatten(node: JsonObject): JsonObject[] {
  return [node, ...(node.content as JsonObject[] ?? []).flatMap(flatten)];
}

describe("official Markdown to ADF conversion", () => {
  it("preserves inline marks and link destinations across containers", () => {
    const inline = '[**link**](https://example.com/a_(b)) ~~obsolete~~ *italic* `code`';
    const nodes = flatten(markdownToAdf(`# ${inline}\n\n${inline}\n\n> ${inline}\n\n- ${inline}\n\n| Content |\n| --- |\n| ${inline} |`));
    expect(nodes.filter((node) => node.text === "link")).toHaveLength(5);
    for (const node of nodes.filter((node) => node.text === "link")) {
      expect(node.marks).toEqual(expect.arrayContaining([{ type: "strong" }, { type: "link", attrs: { href: "https://example.com/a_(b)" } }]));
    }
    for (const [text, type] of [["obsolete", "strike"], ["italic", "em"], ["code", "code"]]) {
      const matching = nodes.filter((node) => node.text === text);
      expect(matching).toHaveLength(5);
      for (const node of matching) expect(node.marks).toContainEqual({ type });
    }
  });

  it("preserves nested lists, references, code fences and literal code content", () => {
    const adf = markdownToAdf('- Parent\n  - [child][ref]\n\n[ref]: https://example.com\n\n~~~mermaid\nflowchart LR\nA-->B\n~~~\n\n```text\n~~literal~~ [link](url)\n```');
    const nodes = flatten(adf);
    expect(nodes.filter((node) => node.type === "bulletList")).toHaveLength(2);
    expect(nodes.find((node) => node.text === "child")?.marks).toContainEqual({ type: "link", attrs: { href: "https://example.com" } });
    expect(nodes.filter((node) => node.type === "codeBlock")).toEqual([
      { type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: "flowchart LR\nA-->B" }] },
      { type: "codeBlock", attrs: { language: "text" }, content: [{ type: "text", text: "~~literal~~ [link](url)" }] },
    ]);
  });

  it("does not create active links for unsafe URI schemes or interpret HTML", () => {
    const nodes = flatten(markdownToAdf('[bad](javascript:alert%281%29)\n\n<script>alert(1)</script>'));
    expect(nodes.flatMap((node) => node.marks as JsonObject[] ?? []).filter((mark) => mark.type === "link")).toEqual([]);
    expect(nodes.some((node) => node.type === "text" && String(node.text).includes("<script>"))).toBe(true);
  });
});
