import { EMBEDDING_MODES, type EmbeddingMode } from "./types.js";

export const DEFAULT_EMBEDDING_MODE: EmbeddingMode = "macropack";
export const DEFAULT_EMBEDDING_MODE_ENV = "CONFLUENCE_DEFAULT_EMBEDDING_MODE";

export function parseEmbeddingMode(value: string | undefined): EmbeddingMode | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if ((EMBEDDING_MODES as readonly string[]).includes(normalized)) {
    return normalized as EmbeddingMode;
  }

  throw new Error(
    `Unsupported ${DEFAULT_EMBEDDING_MODE_ENV} value: ${value}. Expected one of: ${EMBEDDING_MODES.join(", ")}`,
  );
}

export function getDefaultEmbeddingMode(env: NodeJS.ProcessEnv = process.env): EmbeddingMode {
  return parseEmbeddingMode(env[DEFAULT_EMBEDDING_MODE_ENV]) ?? DEFAULT_EMBEDDING_MODE;
}
