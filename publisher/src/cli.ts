#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ConfluenceClient } from "./confluence-client.js";
import { getDefaultEmbeddingMode } from "./embedding-mode.js";
import { DrawioPublisherService } from "./service.js";

interface ParsedArgs {
  command?: string;
  options: Map<string, string>;
}

export const CLI_USAGE =
  "Usage: cli.js <inspect-page|update-widget|create-widget|create-page-from-markdown|update-page-from-markdown> " +
  "--base-url <https://site.atlassian.net> " +
  "[--bearer-token <token> | --email <email> --api-token <token>] ...";

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = rest[i + 1];
    if (!value || value.startsWith("--")) {
      options.set(key, "true");
      continue;
    }
    options.set(key, value);
    i += 1;
  }
  return { command, options };
}

function requireOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
}

export function createService(options: Map<string, string>): DrawioPublisherService {
  const baseUrl = options.get("base-url") ?? process.env.CONFLUENCE_BASE_URL;
  if (!baseUrl) {
    throw new Error("Provide --base-url or CONFLUENCE_BASE_URL");
  }

  const bearerToken = options.get("bearer-token") ?? process.env.CONFLUENCE_BEARER_TOKEN;
  const email = options.get("email") ?? process.env.CONFLUENCE_EMAIL;
  const apiToken = options.get("api-token") ?? process.env.CONFLUENCE_API_TOKEN;
  return new DrawioPublisherService(
    new ConfluenceClient({
      baseUrl,
      bearerToken,
      email,
      apiToken,
    }),
    undefined,
    getDefaultEmbeddingMode(),
  );
}

function getWidgetSelector(options: Map<string, string>) {
  return {
    custContentId: options.get("cust-content-id"),
    diagramName: options.get("diagram-name"),
    index: options.has("index") ? Number(options.get("index")) : undefined,
  };
}

function isHelpRequest(command: string | undefined, options: Map<string, string>): boolean {
  return !command || command === "help" || command === "--help" || command === "-h" || options.has("help");
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (isHelpRequest(command, options)) {
    process.stdout.write(`${CLI_USAGE}\n`);
    return;
  }
  const service = createService(options);

  if (command === "inspect-page") {
    const result = await service.inspectPage(requireOption(options, "page-id"));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "update-widget") {
    const result = await service.updateExistingWidget({
      pageId: requireOption(options, "page-id"),
      drawioPath: requireOption(options, "drawio-file"),
      previewPath: options.get("preview-file"),
      diagramName: options.get("rename-to"),
      widget: getWidgetSelector(options),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "create-widget") {
    const result = await service.createWidget({
      pageId: requireOption(options, "page-id"),
      drawioPath: requireOption(options, "drawio-file"),
      previewPath: options.get("preview-file"),
      diagramName: options.get("diagram-name"),
      spaceKey: options.get("space-key"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "create-page-from-markdown") {
    const markdown =
      options.get("markdown") ??
      (options.get("markdown-file") ? readFileSync(options.get("markdown-file")!, "utf8") : undefined);
    if (!markdown) {
      throw new Error("Provide --markdown or --markdown-file");
    }
    const result = await service.createPageFromMarkdown({
      title: requireOption(options, "title"),
      markdown,
      sourceName: options.get("source-name") ?? options.get("markdown-file"),
      spaceId: options.get("space-id"),
      parentId: options.get("parent-id"),
      siblingPageId: options.get("sibling-page-id"),
      spaceKey: options.get("space-key"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "update-page-from-markdown") {
    const markdown =
      options.get("markdown") ??
      (options.get("markdown-file") ? readFileSync(options.get("markdown-file")!, "utf8") : undefined);
    if (!markdown) {
      throw new Error("Provide --markdown or --markdown-file");
    }
    const result = await service.updatePageFromMarkdown({
      pageId: requireOption(options, "page-id"),
      markdown,
      sourceName: options.get("source-name") ?? options.get("markdown-file"),
      spaceKey: options.get("space-key"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new Error(
    CLI_USAGE,
  );
}

const isDirectExecution = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
