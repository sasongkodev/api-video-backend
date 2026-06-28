import type { Request, Response } from "express"
import fs from "fs-extra"
import path from "path"
import { validateUrl } from "../utils/validate-url"
import { sendError, sendSuccess, sendInfoSuccess } from "../utils/response"
import { processDownload, processInfo, DownloadError } from "../services/downloader.service"
import { cleanupOldFiles } from "../services/cleanup.service"
import { config } from "../config"
import type { DownloadRequestBody } from "../types/download"

export function healthCheck(_req: Request, res: Response): void {
  res.status(200).json({ success: true, message: "Backend is running" })
}

export async function getFormats(
  req: Request<unknown, unknown, DownloadRequestBody>,
  res: Response
): Promise<void> {
  const validation = validateUrl(req.body?.url)
  if (!validation.valid || !validation.url) {
    sendError(res, validation.error ?? "URL tidak valid", 400)
    return
  }

  try {
    const result = await processInfo(validation.url)
    sendInfoSuccess(res, result)
  } catch (err) {
    if (err instanceof DownloadError) {
      sendError(res, err.message, 422)
      return
    }
    console.error("Unexpected info error:", err)
    sendError(res, "Server sedang sibuk", 500)
  }
}

export async function downloadVideo(
  req: Request<unknown, unknown, DownloadRequestBody>,
  res: Response
): Promise<void> {
  const validation = validateUrl(req.body?.url)
  if (!validation.valid || !validation.url) {
    sendError(res, validation.error ?? "URL tidak valid", 400)
    return
  }

  const formatId = typeof req.body.formatId === "string" ? req.body.formatId : undefined

  try {
    const result = await processDownload(validation.url, formatId)
    sendSuccess(res, result)
  } catch (err) {
    if (err instanceof DownloadError) {
      sendError(res, err.message, 422)
      return
    }
    console.error("Unexpected download error:", err)
    sendError(res, "Server sedang sibuk", 500)
  } finally {
    void cleanupOldFiles()
  }
}

export async function streamFile(req: Request, res: Response): Promise<void> {
  const fileName = req.params.filename

  if (!fileName || fileName.includes("..") || fileName.includes("/")) {
    sendError(res, "Invalid file", 400)
    return
  }

  const filePath = path.join(config.tempDir, fileName)

  try {
    await fs.access(filePath)
  } catch {
    sendError(res, "File tidak ditemukan", 404)
    return
  }

  const stat = await fs.stat(filePath)
  const ext = path.extname(fileName).toLowerCase()
  const mimeMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
  }
  const contentType = mimeMap[ext] || "video/mp4"

  // When the client asks to download (?download=1) we send an "attachment"
  // disposition so the browser opens a save dialog and the user can pick a
  // folder on their device. Otherwise serve inline for in-browser preview.
  const wantsDownload =
    req.query.download === "1" || req.query.download === "true"
  const disposition = wantsDownload ? "attachment" : "inline"
  const downloadName = buildDownloadName(req.query.filename, ext, fileName)

  res.setHeader("Content-Type", contentType)
  res.setHeader("Accept-Ranges", "bytes")
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${downloadName}"`
  )

  // Files live only in the temp dir and are removed by the scheduled cleanup,
  // so nothing is persisted permanently. We intentionally do NOT delete on
  // stream end, otherwise the in-browser preview (which uses range requests)
  // would remove the file before the user can download it.
  const range = req.headers.range

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    const chunkSize = end - start + 1

    res.status(206)
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`)
    res.setHeader("Content-Length", chunkSize)

    fs.createReadStream(filePath, { start, end }).pipe(res)
    return
  }

  res.setHeader("Content-Length", stat.size)
  fs.createReadStream(filePath).pipe(res)
}

// Build a safe, human-friendly download filename from an optional client-
// provided name, falling back to the stored file name.
function buildDownloadName(
  raw: unknown,
  ext: string,
  fallback: string
): string {
  if (typeof raw !== "string" || raw.trim() === "") return fallback

  // Strip path separators and characters that are invalid in filenames.
  const cleaned = raw
    .replace(/[\\/]/g, " ")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 150)

  if (!cleaned) return fallback

  return cleaned.toLowerCase().endsWith(ext) ? cleaned : `${cleaned}${ext}`
}
