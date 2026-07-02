import { resolveExtension } from "../utils/file"

export interface GenericExtractorResult {
  fileUrl: string
  title: string
  thumbnail: string
}

const SUPPORTED_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m3u8"]

function isDirectMedia(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const pathname = url.pathname.toLowerCase()
    return SUPPORTED_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  } catch {
    return false
  }
}

export async function extractGenericHtml(url: URL): Promise<GenericExtractorResult | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      },
      signal: controller.signal
    })
    clearTimeout(timeout)
    
    if (!res.ok) return null
    
    const html = await res.text()
    
    let fileUrl: string | null = null
    let title = url.pathname.split('/').filter(Boolean).pop() || "video"
    let thumbnail = ""

    // 1. Check og:video
    const ogMatch = html.match(/<meta[^>]*property="og:video"[^>]*content="([^"]+)"/i) || 
                    html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:video"/i)
    if (ogMatch && ogMatch[1] && isDirectMedia(ogMatch[1])) {
      fileUrl = ogMatch[1]
    }
    
    // 2. Check twitter:player:stream
    if (!fileUrl) {
      const twMatch = html.match(/<meta[^>]*name="twitter:player:stream"[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*content="([^"]+)"[^>]*name="twitter:player:stream"/i)
      if (twMatch && twMatch[1] && isDirectMedia(twMatch[1])) {
        fileUrl = twMatch[1]
      }
    }
    
    // 3. Check <video src="...">
    if (!fileUrl) {
      const videoMatch = html.match(/<video[^>]*src="([^"]+)"/i)
      if (videoMatch && videoMatch[1]) {
        try {
          const absoluteUrl = new URL(videoMatch[1], url.toString()).toString()
          if (isDirectMedia(absoluteUrl)) fileUrl = absoluteUrl
        } catch {}
      }
    }
    
    // 4. Check <source src="...">
    if (!fileUrl) {
      const sourceMatch = html.match(/<source[^>]*src="([^"]+)"/i)
      if (sourceMatch && sourceMatch[1]) {
        try {
          const absoluteUrl = new URL(sourceMatch[1], url.toString()).toString()
          if (isDirectMedia(absoluteUrl)) fileUrl = absoluteUrl
        } catch {}
      }
    }

    if (fileUrl) {
      // Try to get title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim()
      }
      
      // Try to get thumbnail
      const thumbMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) || 
                         html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i)
      if (thumbMatch && thumbMatch[1]) {
        thumbnail = thumbMatch[1]
      }

      return { fileUrl, title, thumbnail }
    }
  } catch (err) {
    console.error("Generic extractor error:", err)
  }
  
  return null
}
