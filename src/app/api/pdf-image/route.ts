import { NextRequest, NextResponse } from 'next/server'
import { clientIpKey } from '@/lib/security/rateLimit'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestSearchParams } from '@/lib/http/searchParams'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { fetchPublicPage } from '@/lib/security/safePageFetch'

// GET /api/pdf-image?u=<https address of a picture>   (owner 20/11: the plan PDF lost its pictures)
//
// The trip plan PDF is built in the browser, and the browser cannot read most photo hosts (no CORS header), so it asks this route for the bytes of the stop photos it already shows on the
// card; it then shrinks them and puts them in the file. SAFETY: https only, no credentials, the SAME public-page fetch the reader uses (every redirect hop re-checked against private and
// internal addresses, size and time bounded, no cookie or header of the visitor forwarded), pictures only (png, jpeg, webp, gif; never SVG), at most IMAGE_MAX_BYTES, a rate limit per
// visitor, and nothing but the picture goes back. Any failure is a plain 404: the PDF then simply has no picture for that stop.
export const dynamic = 'force-dynamic'

const MAX_URL = 1500
/** The largest picture read (bytes); a plan photo is a few hundred KB. */
const IMAGE_MAX_BYTES = 1_500_000
const SERVED = /^image\/(?:png|jpe?g|webp|gif)\b/i

const notFound = () => new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=120' } })

export async function GET(req: NextRequest) {
  const limited = await publicRateLimit(`pdf-image:${clientIpKey(req)}`, 60, 60_000)
  if (!limited.ok) return rateLimitedResponse(req, limited, 'pdf-image')

  const raw = requestSearchParams(req).get('u') ?? ''
  if (!raw || raw.length > MAX_URL || !isSafeHttpsUrl(raw)) return new NextResponse(null, { status: 400 })

  const page = await fetchPublicPage(raw, { maxBytes: 1_000, imageMaxBytes: IMAGE_MAX_BYTES, totalTimeoutMs: 6_000, allowHttp: false }).catch(() => null)
  if (!page || !page.ok || !page.raw || !page.raw.length || !SERVED.test(page.contentType.trim())) return notFound()

  const type = page.contentType.split(';')[0].trim().toLowerCase()
  return new NextResponse(Buffer.from(page.raw), {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(page.raw.length),
      'X-Content-Type-Options': 'nosniff',
      // the picture is only ever drawn into a canvas by the page that asked; it is never navigated to as a document
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
