import type {
  ConfluenceAttachment,
  ConfluenceAttachmentList,
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
}
