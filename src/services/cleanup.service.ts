import fs from "fs-extra"
import path from "path"
import { config } from "../config"
import { ensureTempDir } from "../utils/file"

export async function cleanupOldFiles(): Promise<void> {
  ensureTempDir()

  const maxAgeMs = config.fileExpireMinutes * 60 * 1000
  const now = Date.now()

  let entries: string[]
  try {
    entries = await fs.readdir(config.tempDir)
  } catch {
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(config.tempDir, entry)
      try {
        const stat = await fs.stat(filePath)
        if (!stat.isFile()) return
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.remove(filePath)
        }
      } catch {
        // Ignore individual file errors; cleanup is best-effort.
      }
    })
  )
}

let timer: NodeJS.Timeout | null = null

export function startCleanupSchedule(): void {
  if (timer) return
  void cleanupOldFiles()
  const intervalMs = Math.min(config.fileExpireMinutes, 10) * 60 * 1000
  timer = setInterval(() => void cleanupOldFiles(), intervalMs)
  timer.unref()
}
