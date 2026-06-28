import dotenv from "dotenv"
import path from "path"
import os from "os"

dotenv.config()

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseOrigins(value: string): string[] {
  return value
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean)
}

const frontendUrlRaw = required("FRONTEND_URL", "http://localhost:3000")

export const config = {
  port: Number(process.env.PORT ?? 5000),
  frontendUrl: frontendUrlRaw,
  allowedOrigins: parseOrigins(frontendUrlRaw),
  baseUrl: required("BASE_URL", "http://localhost:5000"),
  tempDir: process.env.TEMP_DIR
    ? path.resolve(process.cwd(), process.env.TEMP_DIR)
    : path.join(os.tmpdir(), "vidotools-temp"),
  fileExpireMinutes: Number(process.env.FILE_EXPIRE_MINUTES ?? 60),
  downloadTimeoutMs: 600_000,
  ytDlpPath:
    process.env.YT_DLP_PATH ?? path.resolve(__dirname, "..", "bin", "yt-dlp"),
  ytDlpTimeoutMs: Number(process.env.YT_DLP_TIMEOUT_MS ?? 600_000),
} as const
