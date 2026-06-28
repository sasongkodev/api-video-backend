import type { ResolvedMedia } from "../types/download"

// Playwright is intentionally NOT used for every request. It is reserved for
// pages that require JavaScript rendering to expose a direct media URL, and
// only for sites we explicitly support.
//
// It must never be used to bypass login, DRM, paywalls, or to scrape content
// in bulk without permission.
//
// This is a placeholder for the MVP. When a supported site needs rendering,
// implement the logic here to launch chromium, load the page, and extract a
// direct, publicly accessible media URL.
export async function resolveWithPlaywright(
  _url: URL
): Promise<ResolvedMedia | null> {
  // Not implemented for the MVP — direct media URLs are handled by the
  // downloader service without a browser.
  return null
}
