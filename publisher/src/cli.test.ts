import { describe, expect, it } from "vitest";

import { createService, CLI_USAGE } from "./cli.js";

describe("publisher cli", () => {
  it("keeps a stable usage string for help output", () => {
    expect(CLI_USAGE).toContain("create-page-from-markdown");
    expect(CLI_USAGE).toContain("--base-url");
  });

  it("creates a publisher service from CLI connection options", () => {
    expect(() => createService(new Map([
      ["base-url", "https://example.atlassian.net/wiki"],
      ["bearer-token", "token"],
    ]))).not.toThrow();
  });
});
