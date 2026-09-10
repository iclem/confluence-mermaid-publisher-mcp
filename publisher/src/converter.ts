import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";

const execFileAsync = promisify(execFile);

const DIST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(DIST_DIR, "..", "..");
const CONVERT_SCRIPT = join(PROJECT_ROOT, "scripts", "convert.sh");

export interface ConvertedArtifacts {
  mermaidPath: string;
  drawioPath: string;
  previewPath: string;
  cleanup: () => Promise<void>;
}

function ensureDrawioName(diagramName: string): string {
  return diagramName.endsWith(".drawio") ? diagramName : `${diagramName}.drawio`;
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createPlaceholderPreviewBuffer(width: number, height: number, color: [number, number, number]): Buffer {
  const row = Buffer.alloc(width * 3);
  for (let offset = 0; offset < row.length; offset += 3) {
    row[offset] = color[0];
    row[offset + 1] = color[1];
    row[offset + 2] = color[2];
  }

  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), row])));
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    header,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function getPreviewConfig(mermaid: string): { width: number; height: number; color: [number, number, number] } {
  const firstLine = mermaid.trimStart().split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.startsWith("sequenceDiagram")) {
    return {
      width: 1200,
      height: 720,
      color: [255, 241, 224],
    };
  }

  return {
    width: 1000,
    height: 700,
    color: [224, 243, 255],
  };
}

export async function convertMermaidToArtifacts(mermaid: string, diagramName: string): Promise<ConvertedArtifacts> {
  const tempDir = await mkdtemp(join(tmpdir(), "drawio-mcp-"));
  const normalizedDiagramName = ensureDrawioName(diagramName);
  const mermaidPath = join(tempDir, `${normalizedDiagramName.replace(/\.drawio$/, "")}.mermaid`);
  const drawioPath = join(tempDir, normalizedDiagramName);
  const previewPath = `${drawioPath}.png`;
  const previewConfig = getPreviewConfig(mermaid);

  await writeFile(mermaidPath, mermaid, "utf8");
  await execFileAsync("bash", [CONVERT_SCRIPT, mermaidPath, drawioPath], {
    cwd: PROJECT_ROOT,
    env: process.env,
  });
  if (!existsSync(previewPath)) {
    await writeFile(previewPath, createPlaceholderPreviewBuffer(previewConfig.width, previewConfig.height, previewConfig.color));
  }

  return {
    mermaidPath,
    drawioPath,
    previewPath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
