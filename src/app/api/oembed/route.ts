import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { searchParam } from '@/lib/http/searchParams'
import { getPublicSharedResult } from '@/lib/share/sharedResultStore'
import { buildOembed, oembedTargetSlug } from '@/lib/share/oembed'

// GET /api/oembed?url=<public result URL>&format=json&maxwidth=600
//
// The oEmbed provider endpoint (see lib/share/oembed.ts). Public, read-only,
// cacheable; answers only for /r/<slug> URLs on this host; one indexed read;
// no model. `format=xml` is not offered (501 per the spec).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!rateLimit(`oembed:${clientIp(req)}`, 120, 60_000).ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  const format = (searchParam(req, 'format') || 'json').toLowerCase()
  if (format !== 'json') return apiError(req, 'invalid_request', 'validation.missingFields', 501)
  const slug = oembedTargetSlug(searchParam(req, 'url'))
  if (!slug) return apiError(req, 'invalid_request', 'validation.missingFields', 404)
  const row = await getPublicSharedResult(slug)
  if (!row) return apiError(req, 'not_found', 'server.notFound', 404)
  const maxRaw = Number(searchParam(req, 'maxwidth') || '')
  const body = buildOembed(row, { maxwidth: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : undefined })
  return NextResponse.json(body, {
    headers: {
      'Content-Type': 'application/json+oembed; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
