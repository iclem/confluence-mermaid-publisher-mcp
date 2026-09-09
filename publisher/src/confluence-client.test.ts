import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

import { ConfluenceClient, getNextPageVersionNumber, getPageUpdateVersionNumber } from "./confluence-client.js";

describe("attachment HTTP contract", () => {
  it.each([
    ["image/svg+xml", true, "PUT", "/rest/api/content/123/child/attachment"],
    ["image/svg+xml", false, "POST", "/rest/api/content/123/child/attachment"],
    ["image/png", true, "POST", "/rest/api/content/123/child/attachment/att1/data"],
  ] as const)("uploads %s (existing=%s) through the correct endpoint", async (mime, existing, method, endpoint) => {
    const directory = mkdtempSync(join(tmpdir(), "attachment-test-"));
    const path = join(directory, "diagram");
    writeFileSync(path, "test-image");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ results: existing ? [{ id: "att1", title: "diagram" }] : [] }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: "att1", title: "diagram", version: { number: 2 } }] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const client = new ConfluenceClient({ baseUrl: "https://example.atlassian.net/wiki", bearerToken: "test" });
      await client.upsertAttachment({ pageId: "123", localPath: path, contentType: mime, comment: "test" });
      const [url, init] = fetchMock.mock.calls[1]! as [string, RequestInit];
      expect(url).toBe(`https://example.atlassian.net/wiki${endpoint}`);
      expect(init.method).toBe(method);
      const file = (init.body as FormData).get("file") as File;
      expect(file.type).toBe(mime);
      expect(await file.text()).toBe("test-image");
    } finally {
      vi.unstubAllGlobals();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("ConfluenceClient helpers", () => {
  it("increments current page versions", () => {
    expect(
      getNextPageVersionNumber({
        id: "1",
        status: "current",
        title: "Page",
        version: { number: 4 },
      }),
    ).toBe(5);
  });

  it("keeps draft page version unchanged", () => {
    expect(
      getNextPageVersionNumber({
        id: "1",
        status: "draft",
        title: "Page",
        version: { number: 1 },
      }),
    ).toBe(1);
  });

  it("keeps unpublished draft version when publishing for the first time", () => {
    expect(
      getPageUpdateVersionNumber({
        page: {
          id: "1",
          status: "draft",
          title: "Page",
          version: { number: 1 },
        },
        targetStatus: "current",
        currentPage: {
          id: "1",
          status: "draft",
          title: "Page",
          version: { number: 1 },
        },
      }),
    ).toBe(1);
  });

  it("uses the published page version when publishing an edited draft", () => {
    expect(
      getPageUpdateVersionNumber({
        page: {
          id: "1",
          status: "draft",
          title: "Page",
          version: { number: 1 },
        },
        targetStatus: "current",
        currentPage: {
          id: "1",
          status: "current",
          title: "Page",
          version: { number: 2 },
        },
      }),
    ).toBe(3);
  });

  it("increments a current page when updating it as current", () => {
    expect(
      getPageUpdateVersionNumber({
        page: {
          id: "1",
          status: "current",
          title: "Page",
          version: { number: 9 },
        },
        targetStatus: "current",
      }),
    ).toBe(10);
  });
});
