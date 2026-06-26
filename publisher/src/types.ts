export type JsonObject = Record<string, unknown>;

export interface AtlasDocFormatBody {
  value?: string | JsonObject;
}

export interface ConfluencePage {
  id: string;
  status: string;
  title: string;
  spaceId?: string;
  parentId?: string;
  version: {
    number: number;
  };
  body?: {
    atlas_doc_format?: AtlasDocFormatBody;
    storage?: {
      value?: string;
    };
  };
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  mediaType?: string;
  fileId?: string;
  version?: {
    number?: number;
  };
}

export interface ConfluenceAttachmentList {
  results: ConfluenceAttachment[];
}

export interface ConfluenceCustomContent {
  id: string;
  type: string;
  status: string;
  title: string;
  pageId?: string;
  spaceId?: string;
  version: {
    number: number;
  };
  body?: {
    raw?: AtlasDocFormatBody;
  };
}

export interface DiagramTarget {
  localId?: string;
  index?: number;
}

export interface EmbeddedDiagram {
  localId?: string;
  height?: number;
}

export interface InspectResult {
  page: Pick<ConfluencePage, "id" | "title" | "status" | "spaceId" | "parentId" | "version">;
  embeddedDiagrams: EmbeddedDiagram[];
  attachments: ConfluenceAttachment[];
  customContents: ConfluenceCustomContent[];
}

export interface MarkdownPublishResult {
  page: Pick<ConfluencePage, "id" | "title" | "status" | "spaceId" | "parentId" | "version">;
  source: string;
  mermaidBlocks: number;
  embeddedBlocks: number;
  embeddedDiagrams: EmbeddedDiagram[];
}
