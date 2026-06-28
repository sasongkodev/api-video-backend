import type { Response } from "express"
import type { DownloadError, DownloadSuccess, InfoSuccess } from "../types/download"

export function sendSuccess(
  res: Response,
  data: Omit<DownloadSuccess, "success">
): void {
  const body: DownloadSuccess = { success: true, ...data }
  res.status(200).json(body)
}

export function sendInfoSuccess(
  res: Response,
  data: Omit<InfoSuccess, "success">
): void {
  const body: InfoSuccess = { success: true, ...data }
  res.status(200).json(body)
}

export function sendError(
  res: Response,
  message: string,
  status = 400
): void {
  const body: DownloadError = { success: false, error: message }
  res.status(status).json(body)
}
