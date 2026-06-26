import { describe, expect, it } from "vitest";

import { appendExtension, appendParagraph, insertExtensionAtAnchor, parseAtlasDocFormat } from "./adf.js";
import { buildMacroPackExtensionNode, findMacroPackExtensions, updateMacroPackExtensionSource } from "./macropack.js";

describe("ADF and MacroPack helpers", () => {
  it("parses atlas_doc_format values that are already objects", () => {
    const parsed = parseAtlasDocFormat({ type: "doc", version: 1, content: [] });
    expect(parsed.type).toBe("doc");
  });

  it("appends and finds MacroPack extensions in ADF", () => {
    const document = appendExtension(
      { type: "doc", version: 1, content: [] },
      buildMacroPackExtensionNode({
        pageId: "123",
        spaceId: "999",
        spaceKey: "~user",
        mermaid: "flowchart TD\nA-->B",
      }),
    );

    const [extension] = findMacroPackExtensions(document);
    expect(extension?.source).toContain("flowchart TD");
    expect(extension?.localId).toEqual(expect.any(String));
  });

  it("updates MacroPack Mermaid source in place", () => {
    const document = appendExtension(
      { type: "doc", version: 1, content: [] },
      buildMacroPackExtensionNode({
        pageId: "123",
        mermaid: "flowchart TD\nA-->B",
      }),
    );
    const [extension] = findMacroPackExtensions(document);

    updateMacroPackExtensionSource(extension!, { mermaid: "flowchart TD\nA-->C" });

    expect(findMacroPackExtensions(document)[0]?.source).toContain("A-->C");
  });

  it("inserts an extension at an anchor inside a paragraph", () => {
    const base = appendParagraph(
      {
        type: "doc",
        version: 1,
        content: [],
      },
      "Before anchor and after text.",
    );

    const extensionNode = buildMacroPackExtensionNode({
      pageId: "123",
      mermaid: "flowchart TD\nA-->B",
    });
    const updated = insertExtensionAtAnchor(base, extensionNode, "Before anchor");

    expect(updated.content).toHaveLength(2);
    expect((updated.content as Array<{ type: string }>)[1]?.type).toBe("extension");
  });
});
