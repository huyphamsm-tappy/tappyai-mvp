import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { isQrEntryPath, renderQrEntrySvg } from '@/lib/growth/qrEntry'
import { searchParam } from '@/lib/http/searchParams'

// GET /api/qr/entry?path=/food&size=512 — a printable QR for a public entry.
//
// Public, cacheable, deterministic. The path is allow-listed (see qrEntry.ts)
// so this can never mint a QR into a private route or an arbitrary URL.
export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  if (!rateLimit(`qr-entry:${clientIp(req)}`, 60, 60_000).ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  const path = searchParam(req, 'path') || '/'
  if (!isQrEntryPath(path)) return apiError(req, 'invalid_request', 'validation.missingFields', 400)
  const sizeRaw = Number(searchParam(req, 'size') || 512)
  const size = Number.isFinite(sizeRaw) ? Math.min(Math.max(Math.round(sizeRaw), 128), 2048) : 512
  return new NextResponse(renderQrEntrySvg(path, size), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
    },
  })
}
