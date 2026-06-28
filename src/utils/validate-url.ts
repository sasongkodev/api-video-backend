// Strict URL validation to prevent SSRF and unsupported inputs.

export interface ValidationResult {
  valid: boolean
  error?: string
  url?: URL
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"])

// Hostnames that always point back at the local machine.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
])

// Returns true if an IPv4 address falls inside a private / reserved range.
function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".")
  if (parts.length !== 4) return false

  const octets = parts.map((p) => Number(p))
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false

  const [a, b] = octets

  // 10.0.0.0/8
  if (a === 10) return true
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // 127.0.0.0/8 loopback
  if (a === 127) return true
  // 169.254.0.0/16 link-local (includes cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true
  // 0.0.0.0/8
  if (a === 0) return true

  return false
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase()
  if (h === "::1" || h === "::") return true
  // Unique local addresses fc00::/7
  if (h.startsWith("fc") || h.startsWith("fd")) return true
  // Link-local fe80::/10
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true
  }
  return false
}

export function validateUrl(input: unknown): ValidationResult {
  if (typeof input !== "string" || input.trim() === "") {
    return { valid: false, error: "URL tidak valid" }
  }

  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { valid: false, error: "URL tidak valid" }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { valid: false, error: "URL tidak valid" }
  }

  const hostname = url.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: "URL tidak valid" }
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { valid: false, error: "URL tidak valid" }
  }

  // Block obvious internal-only hostnames (no dot, e.g. "intranet").
  if (!hostname.includes(".") && !hostname.startsWith("[")) {
    return { valid: false, error: "URL tidak valid" }
  }

  return { valid: true, url }
}

const SUPPORTED_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv"]

// True when the URL path points directly at a supported media file.
export function isDirectMediaUrl(url: URL): boolean {
  const pathname = url.pathname.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((ext) => pathname.endsWith(ext))
}
