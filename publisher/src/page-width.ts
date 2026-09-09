export const PAGE_WIDTHS = ["default", "full-width"] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];
export const DEFAULT_PAGE_WIDTH: PageWidth = "full-width";
export const DEFAULT_PAGE_WIDTH_ENV = "CONFLUENCE_DEFAULT_PAGE_WIDTH";

/** Validate an explicit width; absent configuration preserves existing pages. */
export function parsePageWidth(value: string | undefined): PageWidth | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if ((PAGE_WIDTHS as readonly string[]).includes(normalized)) return normalized as PageWidth;
  throw new Error(`Unsupported page width: ${value}. Expected default or full-width`);
}

export function getConfiguredPageWidth(env: NodeJS.ProcessEnv = process.env): PageWidth | undefined {
  return parsePageWidth(env[DEFAULT_PAGE_WIDTH_ENV]);
}
