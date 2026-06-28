import { execFile } from "child_process"
import fs from "fs-extra"
import path from "path"
import { nanoid } from "nanoid"
import { config } from "../config"
import { streamUrl, ensureTempDir } from "../utils/file"
import type { DownloadSuccess, FormatInfo } from "../types/download"

export class YtDlpError extends Error {}

interface YtDlpFormat {
  format_id: string
  ext: string
  filesize?: number | null
  filesize_approx?: number | null
  width?: number | null
  height?: number | null
  resolution?: string | null
  format_note?: string | null
  vcodec?: string
  acodec?: string
  tbr?: number | null
  video_ext?: string
  audio_ext?: string
}

interface YtDlpInfo {
  title?: string
  thumbnail?: string
  ext?: string
  is_live?: boolean
  live_status?: string
  duration?: number | null
  filesize?: number | null
  filesize_approx?: number | null
  formats?: YtDlpFormat[]
}

function runYtDlp(
  args: string[],
  opts: { timeoutMs: number; maxBuffer?: number } = { timeoutMs: config.ytDlpTimeoutMs }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      config.ytDlpPath,
      args,
      {
        timeout: opts.timeoutMs,
        maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { stderr?: string }
          err.stderr = stderr
          reject(err)
          return
        }
        resolve({ stdout, stderr })
      }
    )
  })
}

function mapYtDlpError(stderr: string): string {
  const s = stderr.toLowerCase()
  if (s.includes("timed out") || s.includes("timeout")) {
    return "Download timeout"
  }
  if (
    s.includes("private") ||
    s.includes("login required") ||
    s.includes("sign in") ||
    s.includes("members-only") ||
    (s.includes("not available") && s.includes("country"))
  ) {
    return "Video bersifat privat atau memerlukan login"
  }
  if (s.includes("is not a valid url") || s.includes("unsupported url")) {
    return "URL tidak didukung"
  }
  if (s.includes("file is larger") || s.includes("max-filesize")) {
    return "File terlalu besar"
  }
  if (s.includes("live event") || s.includes("is live")) {
    return "Live stream belum didukung"
  }
  return "Video tidak bisa diproses: " + stderr

async function fetchFullInfo(url: string): Promise<YtDlpInfo> {
  let stdout: string
  try {
    const res = await runYtDlp(
      ["-J", "--no-playlist", "--no-warnings", "--force-ipv4", url],
      { timeoutMs: 45_000 }
    )
    stdout = res.stdout
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    if (e.killed) throw new YtDlpError("Download timeout")
    throw new YtDlpError(mapYtDlpError(e.stderr ?? ""))
  }

  try {
    return JSON.parse(stdout) as YtDlpInfo
  } catch {
    throw new YtDlpError("Video tidak bisa diproses")
  }
}

// Resolution tiers we expose to the user, highest first.
const TARGET_RESOLUTIONS = [2160, 1440, 1080, 720, 480, 360, 240, 144] as const

export const RESOLUTION_FORMAT_PREFIX = "res-"

function hasVideo(f: YtDlpFormat): boolean {
  if (f.vcodec && f.vcodec !== "none") return true
  if (f.video_ext && f.video_ext !== "none") return true
  // Fallback for unknown formats
  if (f.vcodec === null && f.video_ext === undefined && f.ext !== "none") return true
  return false
}

function hasAudio(f: YtDlpFormat): boolean {
  if (f.acodec && f.acodec !== "none") return true
  if (f.audio_ext && f.audio_ext !== "none") return true
  // If we have no codecs but it's a standard container, assume it has audio
  if (!f.vcodec && !f.acodec && (f.ext === "mp4" || f.ext === "mkv" || f.ext === "webm")) return true
  return false
}

function rawSize(f: YtDlpFormat): number | null {
  return f.filesize ?? f.filesize_approx ?? null
}

/**
 * Estimate a format's size in bytes. Falls back to bitrate * duration when
 * yt-dlp does not report an explicit filesize.
 */
function estimateSize(
  f: YtDlpFormat,
  duration: number | null
): number | null {
  const explicit = rawSize(f)
  if (explicit) return explicit
  if (f.tbr && duration) {
    // tbr is in kbit/s -> bytes = kbit/s * 1000 / 8 * seconds
    return Math.round((f.tbr * 1000 * duration) / 8)
  }
  return null
}

/**
 * Build the curated resolution options (1080p / 720p / 480p) that are actually
 * available for this video. Each option carries an estimated combined
 * (video + audio) file size so the user can see how resolution affects size.
 */
function buildResolutionFormats(
  videoFormats: YtDlpFormat[],
  bestAudioSize: number | null,
  duration: number | null
): FormatInfo[] {
  const maxHeight = videoFormats.reduce(
    (max, f) => Math.max(max, f.height ?? 0),
    0
  )

  const formats: FormatInfo[] = []

  for (const target of TARGET_RESOLUTIONS) {
    // Only offer a resolution the source can actually provide.
    if (maxHeight < target) continue

    // Pick the best video stream at or below the target height.
    const candidates = videoFormats.filter((f) => (f.height ?? 0) <= target)
    if (candidates.length === 0) continue

    const best = candidates.reduce((a, b) => {
      const ha = a.height ?? 0
      const hb = b.height ?? 0
      if (hb !== ha) return hb > ha ? b : a
      return (b.tbr ?? 0) > (a.tbr ?? 0) ? b : a
    })

    const videoSize = estimateSize(best, duration)
    let filesize: number | null = videoSize
    // Add the audio track size unless this is a progressive (muxed) stream.
    if (videoSize !== null && !hasAudio(best) && bestAudioSize !== null) {
      filesize = videoSize + bestAudioSize
    }

    formats.push({
      formatId: `${RESOLUTION_FORMAT_PREFIX}${target}`,
      resolution: `${target}p`,
      quality: `${target}p`,
      ext: "mp4",
      filesize,
      hasVideo: true,
      hasAudio: true,
    })
  }

  return formats
}

export async function fetchFormats(url: string): Promise<{
  title: string
  thumbnail: string
  formats: FormatInfo[]
  duration: number | null
}> {
  const info = await fetchFullInfo(url)

  if (info.is_live || info.live_status === "is_live") {
    throw new YtDlpError("Live stream belum didukung")
  }

  const allFormats = info.formats ?? []
  const videoFormats = allFormats.filter(hasVideo)
  const duration = info.duration ?? null

  // Largest audio-only stream, used to estimate combined size.
  const audioFormats = allFormats.filter((f) => hasAudio(f) && !hasVideo(f))
  const bestAudioSize = audioFormats.reduce<number | null>((max, f) => {
    const size = estimateSize(f, duration)
    if (size === null) return max
    return max === null ? size : Math.max(max, size)
  }, null)

  const formats = buildResolutionFormats(videoFormats, bestAudioSize, duration)

  if (formats.length === 0) {
    // Source has video below 480p (or no height metadata): offer a single
    // best-quality option rather than failing.
    if (videoFormats.length > 0) {
      const best = videoFormats.reduce((a, b) =>
        (b.height ?? 0) > (a.height ?? 0) ? b : a
      )
      const height = best.height ?? 0
      const videoSize = estimateSize(best, duration)
      let filesize: number | null = videoSize
      if (videoSize !== null && !hasAudio(best) && bestAudioSize !== null) {
        filesize = videoSize + bestAudioSize
      }
      return {
        title: info.title?.trim() || "video",
        thumbnail: info.thumbnail ?? "",
        formats: [
          {
            formatId: "best",
            resolution: height ? `${height}p` : "Original",
            quality: height ? `${height}p` : "Best",
            ext: "mp4",
            filesize,
            hasVideo: true,
            hasAudio: true,
          },
        ],
        duration,
      }
    }
    throw new YtDlpError("Tidak ada format video yang tersedia")
  }

  return {
    title: info.title?.trim() || "video",
    thumbnail: info.thumbnail ?? "",
    formats,
    duration,
  }
}

async function findOutputFile(id: string): Promise<string | null> {
  const entries = await fs.readdir(config.tempDir)
  const match = entries.find((e) => e.startsWith(id + "."))
  return match ? path.join(config.tempDir, match) : null
}

/**
 * Translate the requested format into a yt-dlp format selector. Resolution
 * tiers (e.g. "res-720") cap the video height so the resulting file size
 * matches the chosen quality; everything falls back to best available.
 */
function buildFormatSelector(formatId?: string): string {
  if (formatId && formatId.startsWith(RESOLUTION_FORMAT_PREFIX)) {
    const height = Number(formatId.slice(RESOLUTION_FORMAT_PREFIX.length))
    if (Number.isFinite(height) && height > 0) {
      return [
        `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]`,
        `bv*[height<=${height}]+ba`,
        `b[height<=${height}][ext=mp4]`,
        `b[height<=${height}]`,
        "b",
      ].join("/")
    }
  }

  if (formatId && formatId !== "best" && formatId !== "direct") {
    // Explicit yt-dlp format id.
    return `${formatId}+bestaudio[ext=m4a]/best[ext=mp4]/best`
  }

  return "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b"
}

export async function processWithYtDlp(
  url: URL,
  formatId?: string
): Promise<Omit<DownloadSuccess, "success">> {
  ensureTempDir()

  const info = await fetchFullInfo(url.toString())

  if (info.is_live || info.live_status === "is_live") {
    throw new YtDlpError("Live stream belum didukung")
  }

  const id = nanoid(12)
  const outputTemplate = path.join(config.tempDir, `${id}.%(ext)s`)

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-part",
    "--force-ipv4",
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    "-o",
    outputTemplate,
  ]

  args.push("-f", buildFormatSelector(formatId))

  args.push(url.toString())

  try {
    await runYtDlp(args, { timeoutMs: config.ytDlpTimeoutMs })
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    const partial = await findOutputFile(id)
    if (partial) await fs.remove(partial).catch(() => undefined)
    if (e.killed) throw new YtDlpError("Download timeout")
    throw new YtDlpError(mapYtDlpError(e.stderr ?? ""))
  }

  const filePath = await findOutputFile(id)
  if (!filePath) {
    throw new YtDlpError("Video tidak bisa diproses")
  }

  const fileName = path.basename(filePath)

  return {
    title: info.title?.trim() || "video",
    thumbnail: info.thumbnail ?? "",
    streamUrl: streamUrl(fileName),
  }
}
