import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { isValidSlug } from '@/lib/share/slug'
import { getPublicSharedResult, withdrawSharedResult } from '@/lib/share/sharedResultStore'

// /api/shared-results/[slug]
//
//   GET     the public payload as JSON — the SAME frozen snapshot /r/<slug>
//           renders, for clients that cannot render HTML (Zalo Mini App).
//           Public, cacheable, no LLM, no identity, no private column.
//   DELETE  owner withdraws the share (status → 'removed'). Page 404s after.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!rateLimit(`share-get:${clientIp(req)}`, 120, 60_000).ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  if (!isValidSlug(params.slug)) return apiError(req, 'not_found', 'server.notFound', 404)
  const row = await getPublicSharedResult(params.slug)
  if (!row) return apiError(req, 'not_found', 'server.notFound', 404)
  return NextResponse.json(
    { slug: row.slug, payload: row.payload, og_version: row.og_version, created_at: row.created_at },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  if (!rateLimit(`share-delete:${clientIp(req)}`, 30, 60_000).ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  const { user } = await getRequestUser(req)
  if (!user) return apiError(req, 'unauthorized', 'auth.required', 401)
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  if (!isValidSlug(params.slug)) return apiError(req, 'not_found', 'server.notFound', 404)
  const ok = await withdrawSharedResult(params.slug, user.id)
  if (!ok) return apiError(req, 'not_found', 'server.notFound', 404)
  return NextResponse.json({ ok: true })
}
