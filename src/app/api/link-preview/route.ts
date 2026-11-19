import { NextRequest, NextResponse } from 'next/server'
import { clientIpKey } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestSearchParams } from '@/lib/http/searchParams'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { fetchPublicPage } from '@/lib/security/safePageFetch'
import { extractPage } from '@/lib/ai/agent/runtime/pageExtract'

// GET /api/link-preview?u=<https address>   (owner 15/11: a tap on a link in an answer opens a reader beside the chat instead of a new tab)
//
// What the reader shows of a page a person tapped: its title, its site, its date, its own description and its first few passages, from the page's own text (the research reader's extractor:
// bounded, scripts and instruction-like sentences removed). Never the whole article: the reader ends with a button to open the original page, which stays the source.
// SAFETY: https only, no credentials in the address, the SAME public-page fetch the research uses (every redirect hop re-checked against private and internal addresses, size and time
// bounded, no cookie or header of the visitor forwarded), a rate limit per visitor, and nothing but plain text goes back. A failure is a 200 with `{ ok: false }`: the reader then
// shows the address and the button to the original page.
export const dynamic = 'force-dynamic'

const MAX_URL = 1500
/** The most characters of body text sent back (the passages together). */
const MAX_EXCERPT = 700 // not exported: a Next route file may export only its HTTP methods and config
const SCRIPT_LIKE = /^\s*(?:window\.|var\s|let\s|const\s|function\b|\(function|\{\s*"|\[\s*\{)|"\s*:\s*[\["{]|^\s*(?:xin chờ một lát|please wait|loading\b)/i

export async function GET(req: NextRequest) {
  const limited = await publicRateLimit(`link-preview:${clientIpKey(req)}`, 30, 60_000)
  if (!limited.ok) return rateLimitedResponse(req, limited, 'link-preview')

  const raw = requestSearchParams(req).get('u') ?? ''
  if (!raw || raw.length > MAX_URL || !isSafeHttpsUrl(raw)) return NextResponse.json({ ok: false, reason: 'invalid_url' }, { status: 400 })

  let host = ''
  try { host = new URL(raw).hostname.replace(/^www\./, '') } catch { /* validated above */ }

  const page = await fetchPublicPage(raw, { maxBytes: 400_000, totalTimeoutMs: 6_000, allowHttp: false, decodeCompressed: true }).catch(() => null)
  if (!page || !page.ok) return NextResponse.json({ ok: false, host, reason: page && !page.ok ? page.reason : 'network_error' }, { headers: { 'Cache-Control': 'public, max-age=120' } })

  const doc = extractPage(page.body, { url: page.finalUrl, contentType: page.contentType })
  const passages: string[] = []
  let used = 0
  for (const p of doc.passages) {
    if (used >= MAX_EXCERPT) break
    // 19/11 (a page drawn by script left "window.params = {...}" as a passage): a passage that is code or JSON, or a "please wait" placeholder, is not what the page says
    if (SCRIPT_LIKE.test(p)) continue
    const room = MAX_EXCERPT - used
    passages.push(p.length > room ? `${p.slice(0, room).replace(/\s+\S*$/, '')}…` : p)
    used += p.length
  }
  return NextResponse.json({
    ok: true,
    url: page.finalUrl,
    host: doc.host || host,
    title: doc.title,
    siteName: doc.siteName,
    description: doc.description,
    publishedAt: doc.publishedAt,
    passages,
  }, { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' } })
}
