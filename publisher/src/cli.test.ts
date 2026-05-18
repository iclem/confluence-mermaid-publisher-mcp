import { describe, expect, it } from "vitest";

import { createService, CLI_USAGE } from "./cli.js";
import { DEFAULT_EMBEDDING_MODE_ENV } from "./embedding-mode.js";

describe("publisher cli", () => {
  it("keeps a stable usage string for help output", () => {
    expect(CLI_USAGE).toContain("create-page-from-markdown");
    expect(CLI_USAGE).toContain("--base-url");
  });

  it("uses the configured default embedding mode when creating the publisher service", () => {
    const original = process.env[DEFAULT_EMBEDDING_MODE_ENV];
    process.env[DEFAULT_EMBEDDING_MODE_ENV] = "drawio";

    try {
      const service = createService(new Map([["base-url", "https://example.atlassian.net/wiki"]]));
      expect((service as unknown as { defaultEmbeddingMode: string }).defaultEmbeddingMode).toBe("drawio");
    } finally {
      if (original === undefined) {
        delete process.env[DEFAULT_EMBEDDING_MODE_ENV];
      } else {
        process.env[DEFAULT_EMBEDDING_MODE_ENV] = original;
      }
    }
  });
});
