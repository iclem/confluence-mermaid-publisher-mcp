import { describe, expect, it } from "vitest";
import { getDefaultEmbeddingMode } from "./embedding-mode.js";

describe("default embedding mode", () => {
  it.each([undefined, "", "  "])("uses SVG when configuration is unset or blank (%s)", (value) => {
    expect(getDefaultEmbeddingMode({ CONFLUENCE_DEFAULT_EMBEDDING_MODE: value })).toBe("svg");
  });

  it.each(["drawio", "svg", "macropack"])("preserves the configured %s override", (mode) => {
    expect(getDefaultEmbeddingMode({ CONFLUENCE_DEFAULT_EMBEDDING_MODE: ` ${mode.toUpperCase()} ` })).toBe(mode);
  });
});
