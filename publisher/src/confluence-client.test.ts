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

describe("page width HTTP contract", () => {
  it("creates missing draft and published properties", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ id: "draft" }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(Response.json({ id: "published" }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const client = new ConfluenceClient({ baseUrl: "https://example.atlassian.net/wiki", bearerToken: "test" });
      await client.setPageWidth("123", "full-width");
      for (const [offset, key] of [[0, "content-appearance-draft"], [2, "content-appearance-published"]] as const) {
        expect(fetchMock.mock.calls[offset]![0]).toBe(`https://example.atlassian.net/wiki/api/v2/pages/123/properties?key=${key}`);
        const [url, init] = fetchMock.mock.calls[offset + 1]! as [string, RequestInit];
        expect(url).toBe("https://example.atlassian.net/wiki/api/v2/pages/123/properties");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ key, value: "full-width" });
      }
    } finally { vi.unstubAllGlobals(); }
  });

  it("updates a changed property with its next version and skips an unchanged one", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [{ id: "d1", value: "full-width", version: { number: 7 } }] }))
      .mockResolvedValueOnce(Response.json({ id: "d1" }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: "p1", value: "default", version: { number: 3 } }] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const client = new ConfluenceClient({ baseUrl: "https://example.atlassian.net/wiki", bearerToken: "test" });
      await client.setPageWidth("123", "default");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const [url, init] = fetchMock.mock.calls[1]! as [string, RequestInit];
      expect(url).toBe("https://example.atlassian.net/wiki/api/v2/pages/123/properties/d1");
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({ key: "content-appearance-draft", value: "default", version: { number: 8 } });
    } finally { vi.unstubAllGlobals(); }
  });

  it("surfaces property conflicts without retrying mutations", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(new Response("conflict", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const client = new ConfluenceClient({ baseUrl: "https://example.atlassian.net/wiki", bearerToken: "test" });
      await expect(client.setPageWidth("123", "full-width")).rejects.toThrow("409");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});
