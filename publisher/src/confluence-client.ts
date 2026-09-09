import { readFileSync } from "node:fs";
import { basename } from "node:path";

import type {
  ConfluenceAttachment,
  ConfluenceAttachmentList,
  ConfluenceCustomContent,
  ConfluencePage,
  JsonObject,
} from "./types.js";

interface ClientOptions {
  baseUrl: string;
  bearerToken?: string;
  email?: string;
  apiToken?: string;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = trimTrailingSlash(baseUrl);
  return trimmed.endsWith("/wiki") ? trimmed : `${trimmed}/wiki`;
}

function assertJsonObject(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a JSON object response");
  }
  return value as JsonObject;
}

export function getNextPageVersionNumber(page: ConfluencePage): number {
  return page.status === "draft" ? page.version.number : page.version.number + 1;
}

function normalizePageStatus(value: string | undefined): "current" | "draft" {
  return value === "current" ? "current" : "draft";
}

export function getPageUpdateVersionNumber(args: {
  page: ConfluencePage;
  targetStatus?: "current" | "draft";
  currentPage?: ConfluencePage;
}): number {
  const targetStatus = args.targetStatus ?? normalizePageStatus(args.page.status);
  if (targetStatus === "draft") {
    return getNextPageVersionNumber(args.page);
  }

  if (args.page.status === "current") {
    return args.page.version.number + 1;
  }

  const currentPageStatus = normalizePageStatus(args.currentPage?.status);
  if (args.page.status === "draft" && currentPageStatus === "current") {
    return args.currentPage!.version.number + 1;
  }

  return args.page.version.number;
}

export class ConfluenceClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(options: ClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    if (options.bearerToken) {
      this.authorization = `Bearer ${options.bearerToken}`;
      return;
    }
    if (options.email && options.apiToken) {
      this.authorization = `Basic ${Buffer.from(`${options.email}:${options.apiToken}`).toString("base64")}`;
      return;
    }
    throw new Error("Provide either bearerToken or email/apiToken credentials");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set("Authorization", this.authorization);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Confluence request failed (${response.status} ${response.statusText}) for ${path}: ${body}`);
    }
    return response;
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request(path, init);
    return (await response.json()) as T;
  }

  async getPage(
    pageId: string,
    bodyFormat: "atlas_doc_format" | "storage" = "atlas_doc_format",
    getDraft = true,
  ): Promise<ConfluencePage> {
    const draftQuery = getDraft ? "&get-draft=true" : "";
    return this.requestJson<ConfluencePage>(`/api/v2/pages/${pageId}?body-format=${bodyFormat}${draftQuery}`);
  }

  async createPage(args: {
    spaceId: string;
    title: string;
    parentId?: string;
    status?: "current" | "draft";
    adfDocument?: JsonObject;
  }): Promise<ConfluencePage> {
    const adfDocument = args.adfDocument ?? { type: "doc", version: 1, content: [] };
    return this.requestJson<ConfluencePage>("/api/v2/pages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        spaceId: args.spaceId,
        status: args.status ?? "draft",
        title: args.title,
        parentId: args.parentId,
        body: {
          representation: "atlas_doc_format",
          value: JSON.stringify(adfDocument),
        },
      }),
    });
  }

  async updatePageAdf(
    page: ConfluencePage,
    adfDocument: JsonObject,
    message?: string,
    targetStatus: "current" | "draft" = normalizePageStatus(page.status),
  ): Promise<ConfluencePage> {
    const currentPage =
      page.status === "draft" && targetStatus === "current"
        ? await this.getPage(page.id, "atlas_doc_format", false)
        : undefined;

    return this.requestJson<ConfluencePage>(`/api/v2/pages/${page.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: page.id,
        status: targetStatus,
        title: page.title,
        spaceId: page.spaceId,
        parentId: page.parentId,
        body: {
          representation: "atlas_doc_format",
          value: JSON.stringify(adfDocument),
        },
        version: {
          number: getPageUpdateVersionNumber({
            page,
            targetStatus,
            currentPage,
          }),
          ...(message ? { message } : {}),
        },
      }),
    });
  }

  async listPageAttachments(pageId: string, filename?: string): Promise<ConfluenceAttachment[]> {
    const search = filename ? `?filename=${encodeURIComponent(filename)}` : "?limit=250";
    const result = await this.requestJson<ConfluenceAttachmentList>(`/api/v2/pages/${pageId}/attachments${search}`);
    return result.results ?? [];
  }

  async getCustomContent(customContentId: string): Promise<ConfluenceCustomContent> {
    return this.requestJson<ConfluenceCustomContent>(`/api/v2/custom-content/${customContentId}?body-format=raw`);
  }

  async createCustomContent(args: {
    type: string;
    title: string;
    pageId: string;
    bodyRaw: string;
  }): Promise<ConfluenceCustomContent> {
    return this.requestJson<ConfluenceCustomContent>("/api/v2/custom-content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: args.type,
        status: "current",
        pageId: args.pageId,
        title: args.title,
        body: {
          representation: "raw",
          value: args.bodyRaw,
        },
      }),
    });
  }

  async updateCustomContent(args: {
    id: string;
    type: string;
    title: string;
    pageId: string;
    bodyRaw: string;
    versionNumber: number;
  }): Promise<ConfluenceCustomContent> {
    return this.requestJson<ConfluenceCustomContent>(`/api/v2/custom-content/${args.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: args.id,
        type: args.type,
        status: "current",
        pageId: args.pageId,
        title: args.title,
        body: {
          representation: "raw",
          value: args.bodyRaw,
        },
        version: {
          number: args.versionNumber,
        },
      }),
    });
  }

  async upsertAttachment(args: {
    pageId: string;
    localPath: string;
    remoteFileName?: string;
    contentType: string;
    comment: string;
    minorEdit?: boolean;
  }): Promise<ConfluenceAttachment> {
    const remoteFileName = args.remoteFileName ?? basename(args.localPath);
    const existing = (await this.listPageAttachments(args.pageId, remoteFileName))[0];
    if (existing) {
      return this.updateAttachment({
        ...args,
        attachmentId: existing.id,
        remoteFileName,
      });
    }
    return this.createAttachment({
      ...args,
      remoteFileName,
    });
  }

  private async createAttachment(args: {
    pageId: string;
    localPath: string;
    remoteFileName: string;
    contentType: string;
    comment: string;
    minorEdit?: boolean;
  }): Promise<ConfluenceAttachment> {
    return this.attachmentMutation(
      `/rest/api/content/${args.pageId}/child/attachment`,
      args.localPath,
      args.remoteFileName,
      args.contentType,
      args.comment,
      args.minorEdit ?? true,
    );
  }

  private async updateAttachment(args: {
    pageId: string;
    attachmentId: string;
    localPath: string;
    remoteFileName: string;
    contentType: string;
    comment: string;
    minorEdit?: boolean;
  }): Promise<ConfluenceAttachment> {
    return this.attachmentMutation(
      args.contentType === "image/svg+xml"
        ? `/rest/api/content/${args.pageId}/child/attachment`
        : `/rest/api/content/${args.pageId}/child/attachment/${args.attachmentId}/data`,
      args.localPath,
      args.remoteFileName,
      args.contentType,
      args.comment,
      args.minorEdit ?? true,
      args.contentType === "image/svg+xml" ? "PUT" : "POST",
    );
  }

  private async attachmentMutation(
    path: string,
    localPath: string,
    remoteFileName: string,
    contentType: string,
    comment: string,
    minorEdit: boolean,
    method: "POST" | "PUT" = "POST",
  ): Promise<ConfluenceAttachment> {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(localPath)], { type: contentType }), remoteFileName);
    form.append("minorEdit", String(minorEdit));
    form.append("comment", comment);

    const response = await this.request(path, {
      method,
      headers: {
        "X-Atlassian-Token": "no-check",
      },
      body: form,
    });
    const payload = assertJsonObject(await response.json());
    const results = Array.isArray(payload.results) ? payload.results : undefined;
    if (results && results[0] && typeof results[0] === "object") {
      const first = results[0] as JsonObject;
      return {
        id: String(first.id),
        title: String(first.title),
        version: isFinite(Number((first.version as JsonObject | undefined)?.number))
          ? { number: Number((first.version as JsonObject).number) }
          : undefined,
      };
    }
    return {
      id: String(payload.id),
      title: String(payload.title),
      version: isFinite(Number((payload.version as JsonObject | undefined)?.number))
        ? { number: Number((payload.version as JsonObject).number) }
        : undefined,
    };
  }
}
