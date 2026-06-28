import fs from "fs-extra"
import path from "path"
import { config } from "../config"

const CONTENT_TYPE_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
}

export function ensureTempDir(): void {
  fs.ensureDirSync(config.tempDir)
}

export function resolveExtension(
  urlPath: string,
  contentType?: string | null
): string {
  const lowerPath = urlPath.toLowerCase()
  for (const ext of [".mp4", ".webm", ".mov", ".mkv"]) {
    if (lowerPath.endsWith(ext)) return ext
  }
  if (contentType) {
    const base = contentType.split(";")[0].trim().toLowerCase()
    if (CONTENT_TYPE_EXT[base]) return CONTENT_TYPE_EXT[base]
  }
  return ".mp4"
}

export function tempFilePath(id: string, ext: string): string {
  return path.join(config.tempDir, `${id}${ext}`)
}

export function streamUrl(fileName: string): string {
  const base = config.baseUrl.replace(/\/$/, "")
  return `${base}/stream/${fileName}`
}
