import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_WIDTH, getConfiguredPageWidth, parsePageWidth } from "./page-width.js";

describe("page width configuration", () => {
  it("keeps an absent environment override distinct from the new-page default", () => {
    expect(DEFAULT_PAGE_WIDTH).toBe("full-width");
    expect(getConfiguredPageWidth({})).toBeUndefined();
    expect(getConfiguredPageWidth({ CONFLUENCE_DEFAULT_PAGE_WIDTH: " " })).toBeUndefined();
    expect(getConfiguredPageWidth({ CONFLUENCE_DEFAULT_PAGE_WIDTH: "default" })).toBe("default");
    expect(parsePageWidth(" FULL-WIDTH ")).toBe("full-width");
  });
  it("rejects invalid configuration", () => {
    expect(() => getConfiguredPageWidth({ CONFLUENCE_DEFAULT_PAGE_WIDTH: "wide" })).toThrow("Unsupported page width");
  });
});
