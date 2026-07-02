import { chromium } from "playwright"
import type { ResolvedMedia } from "../types/download"

export async function resolveWithPlaywright(
  url: URL
): Promise<ResolvedMedia | null> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const mediaUrls = new Set<string>()

  page.on("request", (request) => {
    const reqUrl = request.url()
    if (reqUrl.includes(".m3u8") || reqUrl.includes(".mp4") || request.resourceType() === 'media') {
      mediaUrls.add(reqUrl)
    }
  })

  page.on("response", async (response) => {
      const resUrl = response.url()
      const contentType = response.headers()['content-type']
      if (contentType && (contentType.includes('video/') || contentType.includes('application/vnd.apple.mpegurl'))) {
          mediaUrls.add(resUrl)
      }
  })

    try {
      // Wait until network is mostly idle to ensure iframes are loaded
    await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)
    
    // Try clicking to bypass "Confirm you're human" or start video
    try {
      // Click center just in case
      await page.mouse.click(640, 360)
      await page.waitForTimeout(1000)
      
      // Use evaluate to play any video elements and click play buttons inside all frames
      const frames = page.frames()
      for (const frame of frames) {
        try {
          await frame.evaluate(() => {
            document.querySelectorAll('video').forEach(v => {
              v.muted = true
              v.play().catch(() => {})
            })
            document.querySelectorAll('.vjs-big-play-button, .play-button, button, [role="button"]').forEach((btn: any) => {
              const text = btn.innerText?.toLowerCase() || ""
              const cls = btn.className || ""
              if (text.includes("confirm") || text.includes("play") || text.includes("start") || cls.includes("play") || cls.includes("vjs")) {
                btn.click()
              }
            })
          })
        } catch(e) {}
      }
    } catch (e) {}

    // Wait a bit to collect streams
    await page.waitForTimeout(8000)
    
  } catch (error) {
    console.error("Playwright navigation error:", error)
  } finally {
    await browser.close()
  }

  // Filter out common ad keywords, domains, and blob URLs
  const adKeywords = ["300x250", "storagexhd", "ad.", "ads.", "banner", "blob:"]

  const validUrls = Array.from(mediaUrls).filter(u => {
      const lower = u.toLowerCase()
      return !adKeywords.some(kw => lower.includes(kw))
  })

  console.log("Playwright found valid videoUrls:", validUrls)
  
  if (validUrls.length > 0) {
    // Prefer the last found URL as it's often the main stream triggered after clicks
    const videoUrl = validUrls[validUrls.length - 1]
    console.log("Returning resolved media:", videoUrl)
    const title = url.pathname.split('/').filter(Boolean).pop() || "video"
    return {
      fileUrl: videoUrl,
      title: title,
      thumbnail: ""
    }
  }

  console.log("Playwright failed to find valid videoUrl")
  return null
}
