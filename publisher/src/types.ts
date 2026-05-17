export type JsonObject = Record<string, unknown>;

export const EMBEDDING_MODES = ["macropack", "drawio"] as const;

export type EmbeddingMode = (typeof EMBEDDING_MODES)[number];

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

export interface DrawioGuestParams {
  simple?: boolean;
  zoom?: number;
  pageId: string;
  custContentId: string;
  diagramDisplayName: string;
  lbox?: boolean;
  contentVer?: number;
  revision?: number;
  baseUrl: string;
  diagramName: string;
  pCenter?: boolean;
  width: number;
  links?: string;
  tbstyle?: string;
  height: number;
}

export interface DrawioExtension {
  node: JsonObject;
  attrs: JsonObject;
  parameters: JsonObject;
  guestParams: DrawioGuestParams;
  diagramName: string;
  custContentId: string;
  localId?: string;
}

export interface DiagramTarget {
  diagramName?: string;
  custContentId?: string;
  localId?: string;
  index?: number;
}

export interface EmbeddedDiagram {
  embeddingMode: EmbeddingMode;
  diagramName?: string;
  custContentId?: string;
  localId?: string;
  width?: number;
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
  embeddingMode: EmbeddingMode;
  mermaidBlocks: number;
  embeddedBlocks: number;
  fallbackBlocks: number;
  embeddedDiagrams: EmbeddedDiagram[];
}
