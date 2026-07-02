import fs from "fs-extra"
import { nanoid } from "nanoid"
import { config } from "../config"
import { streamUrl, tempFilePath, ensureTempDir, resolveExtension } from "../utils/file"
import { isDirectMediaUrl } from "../utils/validate-url"
import { processWithYtDlp, YtDlpError, fetchFormats } from "./ytdlp.service"
import { resolveWithPlaywright } from "./playwright.service"
import { extractGenericHtml } from "./generic-extractor.service"
import type { DownloadSuccess, FormatInfo } from "../types/download"

export class DownloadError extends Error {}

interface DownloadFileResult {
  fileName: string
  filePath: string
}

async function streamToDisk(
  fileUrl: string
): Promise<DownloadFileResult> {
  ensureTempDir()

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    config.downloadTimeoutMs
  )

  let res: Response
  try {
    res = await fetch(fileUrl, { signal: controller.signal, redirect: "follow" })
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === "AbortError") {
      throw new DownloadError("Download timeout")
    }
    throw new DownloadError("Video tidak bisa diproses")
  }

  if (!res.ok || !res.body) {
    clearTimeout(timeout)
    throw new DownloadError("Video tidak bisa diproses")
  }

  const contentType = res.headers.get("content-type")

  const ext = resolveExtension(new URL(fileUrl).pathname, contentType)
  const id = nanoid(12)
  const fileName = `${id}${ext}`
  const filePath = tempFilePath(id, ext)

  const fileStream = fs.createWriteStream(filePath)

  try {
    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!fileStream.write(value)) {
        await new Promise<void>((resolve) => fileStream.once("drain", resolve))
      }
    }
    await new Promise<void>((resolve, reject) => {
      fileStream.end(() => resolve())
      fileStream.on("error", reject)
    })
  } catch (err) {
    fileStream.destroy()
    await fs.remove(filePath).catch(() => undefined)
    if (err instanceof DownloadError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new DownloadError("Download timeout")
    }
    throw new DownloadError("Video tidak bisa diproses")
  } finally {
    clearTimeout(timeout)
  }

  return { fileName, filePath }
}

function titleFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop()
  if (!last) return "video"
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

export async function processInfo(url: URL): Promise<{
  title: string
  thumbnail: string
  formats: FormatInfo[]
  duration: number | null
}> {
  if (isDirectMediaUrl(url)) {
    return {
      title: titleFromUrl(url),
      thumbnail: "",
      formats: [
        {
          formatId: "direct",
          resolution: "Original",
          quality: "Direct",
          ext: resolveExtension(url.pathname),
          filesize: null,
          hasVideo: true,
          hasAudio: true,
        },
      ],
      duration: null,
    }
  }

  try {
    return await fetchFormats(url.toString())
  } catch (err) {
    if (err instanceof YtDlpError && (err.message === "URL tidak didukung" || err.message === "Video tidak bisa diproses" || err.message.includes("Video tidak bisa diproses"))) {
      let resolved = await extractGenericHtml(url)
      if (!resolved) {
        resolved = await resolveWithPlaywright(url)
      }
      
      if (resolved) {
        return {
          title: resolved.title,
          thumbnail: resolved.thumbnail,
          formats: [
            {
              formatId: "direct",
              resolution: "Original",
              quality: "Direct",
              ext: resolveExtension(new URL(resolved.fileUrl).pathname),
              filesize: null,
              hasVideo: true,
              hasAudio: true,
            },
          ],
          duration: null,
        }
      }
    }

    if (err instanceof YtDlpError) {
      throw new DownloadError(err.message)
    }
    throw err
  }
}

export async function processDownload(
  url: URL,
  formatId?: string
): Promise<Omit<DownloadSuccess, "success">> {
  if (isDirectMediaUrl(url)) {
    const { fileName } = await streamToDisk(url.toString())
    return {
      title: titleFromUrl(url),
      thumbnail: "",
      streamUrl: streamUrl(fileName),
    }
  }

  try {
    return await processWithYtDlp(url, formatId)
  } catch (err) {
    if (err instanceof YtDlpError && (err.message === "URL tidak didukung" || err.message === "Video tidak bisa diproses" || err.message.includes("Video tidak bisa diproses"))) {
      let resolved = await extractGenericHtml(url)
      if (!resolved) {
        resolved = await resolveWithPlaywright(url)
      }
      if (resolved) {
        const { fileName } = await streamToDisk(resolved.fileUrl)
        return {
          title: resolved.title,
          thumbnail: resolved.thumbnail,
          streamUrl: streamUrl(fileName),
        }
      }
    }

    if (err instanceof YtDlpError) {
      throw new DownloadError(err.message)
    }
    throw err
  }
}
