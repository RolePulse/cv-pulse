/**
 * GET /api/jd-fetch?url=https://...
 *
 * Fetches a public job posting URL and returns extracted plain text.
 * Used by JD Match so candidates can paste a URL instead of copying
 * the full job description text.
 *
 * Security: SSRF protection, HTTPS-only, 10s timeout, 1MB response cap.
 */
import { NextRequest, NextResponse } from 'next/server'

// ── SSRF protection ───────────────────────────────────────────────────────────

const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254', // AWS metadata
]

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
]

function isSafeUrl(raw: string): { ok: boolean; reason?: string; hostname?: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'Invalid URL format' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are supported' }
  }

  const hostname = url.hostname.toLowerCase()

  if (BLOCKED_HOSTS.includes(hostname)) {
    return { ok: false, reason: 'That URL is not allowed' }
  }

  for (const range of PRIVATE_RANGES) {
    if (range.test(hostname)) {
      return { ok: false, reason: 'That URL is not allowed' }
    }
  }

  return { ok: true, hostname }
}

// ── HTML → plain text ─────────────────────────────────────────────────────────

function extractText(html: string): string {
  return html
    // Decode angle-bracket entities first so encoded HTML tags are treated as real tags.
    // Greenhouse (and some other ATS APIs) return entity-encoded HTML like &lt;h2&gt;.
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // Remove non-content blocks entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    // Block-level tags → newlines for readable structure
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|section|article|main|aside|tr)[^>]*>/gi, '\n')
    // Strip all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities (named, decimal, and hex)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&bull;/g, '\u2022')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&[a-z]+;/gi, ' ')
    // Tidy whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Content quality check ─────────────────────────────────────────────────────
// Returns true only if the text looks like a real job description, not page chrome.

function looksLikeJobDescription(text: string): boolean {
  const lower = text.toLowerCase()

  // Hard-fail: unrendered template syntax or obvious page furniture
  const NOISE = [
    '{{',                       // Vue/Handlebars template literals not rendered
    'we use cookies',
    'cookie policy',
    'accept cookies',
    'share this opportunity',
    'similar opportunities',
    'privacy policy',
    'terms of service',
  ]
  if (NOISE.some((n) => lower.includes(n))) return false

  // Must be long enough to contain a real JD (nav-only pages are typically short)
  if (text.length < 400) return false

  // Must contain at least 2 real job-description signals
  const JD_SIGNALS = [
    'responsibilit',  // responsibilities / responsible
    'requirement',    // requirements / required
    'qualification',
    'experience',
    'skills',
    'about the role',
    'about the position',
    'what you',
    "you'll",
    'you will',
    'we are looking',
    "we're looking",
    'job description',
    'about us',
    'about the company',
    'compensation',
    'salary',
    'benefits',
    'full-time',
    'part-time',
    ' remote',
    ' hybrid',
    'apply now',
    'apply today',
  ]
  const signalCount = JD_SIGNALS.filter((s) => lower.includes(s)).length
  return signalCount >= 2
}

// ── ATS-specific helpers ──────────────────────────────────────────────────────

/**
 * Detect and parse a Greenhouse job URL.
 * Handles boards.greenhouse.io, job-boards.greenhouse.io, boards.eu.greenhouse.io
 * Returns { board, jobId } or null if not a Greenhouse URL.
 */
function parseGreenhouseUrl(url: URL): { board: string; jobId: string } | null {
  const host = url.hostname.toLowerCase()
  if (!host.includes('greenhouse.io')) return null

  // Pattern: /board-slug/jobs/12345  OR  /board-slug/jobs/12345/...
  const match = url.pathname.match(/^\/([^/]+)\/jobs\/(\d+)(?:\/|$)/)
  if (!match) return null

  return { board: match[1], jobId: match[2] }
}

/**
 * Fetch a Greenhouse job via the public Greenhouse API (no auth required).
 * Returns extracted plain text of the job description, or null on failure.
 */
async function fetchGreenhouseJob(board: string, jobId: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.greenhouse.io/v1/boards/${board}/jobs/${jobId}?content=true`
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null

    const data = await res.json() as { title?: string; content?: string; location?: { name?: string } }
    if (!data.content) return null

    // Build clean text: title + location + stripped HTML body
    const titleLine = [data.title, data.location?.name].filter(Boolean).join(' — ')
    const body = extractText(data.content)

    return [titleLine, body].filter(Boolean).join('\n\n')
  } catch {
    return null
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')?.trim() ?? ''

  if (!raw) {
    return NextResponse.json({ ok: false, error: 'Missing url parameter' }, { status: 400 })
  }

  const safety = isSafeUrl(raw)
  if (!safety.ok) {
    return NextResponse.json({ ok: false, error: safety.reason }, { status: 400 })
  }

  // ── LinkedIn check — friendly error before we even try ────────────────────
  if (safety.hostname?.includes('linkedin.com')) {
    return NextResponse.json({
      ok: false,
      error: 'LinkedIn job pages require you to be signed in — paste the job description text instead.',
    }, { status: 422 })
  }

  // ── Attempt 1: Greenhouse public API (reliable, no CAPTCHA) ─────────────
  // Greenhouse exposes a public jobs API — much more reliable than scraping.
  let text = ''

  const urlObj = new URL(raw)
  const ghJob = parseGreenhouseUrl(urlObj)
  if (ghJob) {
    const ghText = await fetchGreenhouseJob(ghJob.board, ghJob.jobId)
    if (ghText && ghText.length >= 100) {
      return NextResponse.json({
        ok: true,
        text: ghText.slice(0, 15_000),
        domain: safety.hostname,
        charCount: Math.min(ghText.length, 15_000),
      })
    }
  }

  // ── Attempt 2: direct fetch (fast, works for SSR pages) ──────────────────

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8_000)

    const res = await fetch(raw, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const buffer = await res.arrayBuffer()
      const html = new TextDecoder().decode(
        buffer.byteLength > 1_000_000 ? buffer.slice(0, 1_000_000) : buffer
      )
      text = extractText(html)
    } else if (res.status === 403 || res.status === 401) {
      return NextResponse.json({
        ok: false,
        error: 'That job page requires you to be signed in — paste the job description text instead.',
      }, { status: 422 })
    }
  } catch {
    // Direct fetch failed — will try Jina below
  }

  // ── Attempt 3: Jina AI Reader (handles JS-rendered pages, fallback for non-Greenhouse ATS) ──
  // r.jina.ai is a free service that fetches and renders pages, returning clean text.
  // We use it as a fallback when direct fetch returns too little content.
  if (text.length < 200) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20_000)

      const jinaUrl = `https://r.jina.ai/${raw}`
      const jinaRes = await fetch(jinaUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/plain',
          'X-No-Cache': 'true',
        },
      })

      clearTimeout(timeoutId)

      if (jinaRes.ok) {
        const jinaRaw = await jinaRes.text()

        // Jina prepends metadata (Title / URL Source / Warning) before "Markdown Content:".
        // Extract only what comes after the marker so the textarea shows the actual JD body.
        const marker = 'Markdown Content:'
        const markerIdx = jinaRaw.indexOf(marker)
        const contentRaw = markerIdx >= 0
          ? jinaRaw.slice(markerIdx + marker.length)
          : jinaRaw

        const cleaned = contentRaw
          .replace(/^#{1,6}\s+/gm, '')                      // strip heading markers
          .replace(/\*\*(.*?)\*\*/g, '$1')                  // bold → plain
          .replace(/\*(.*?)\*/g, '$1')                      // italic → plain
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')          // links → link text only
          .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')           // images → remove
          .replace(/`{1,3}[^`]*`{1,3}/g, '')               // code spans → remove
          .replace(/^[-*+]\s+/gm, '• ')                    // list bullets → •
          .replace(/^\s*\|\s.*$/gm, '')                     // strip markdown table rows
          // Decode HTML entities that Jina sometimes outputs in Markdown
          .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()

        if (cleaned.length >= 200) {
          text = cleaned
        }
      }
    } catch {
      // Jina also failed — fall through to error below
    }
  }

  // ── Return result ─────────────────────────────────────────────────────────
  if (!looksLikeJobDescription(text)) {
    // Either too short, contains page-chrome noise (cookie banners, nav, share buttons),
    // or lacks the signals that identify real job description content.
    return NextResponse.json({
      ok: false,
      error: "Couldn't extract the job description from that page — it may be built with JavaScript or require a sign-in. Paste the job description text instead.",
    }, { status: 422 })
  }

  // Cap returned text at 15,000 chars — more than enough for any JD
  return NextResponse.json({
    ok: true,
    text: text.slice(0, 15_000),
    domain: safety.hostname,
    charCount: Math.min(text.length, 15_000),
  })
}
