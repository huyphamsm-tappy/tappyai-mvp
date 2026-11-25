// The checks every overlay / download route makes before doing anything, in one place and one order (Explore video VID-02 / VID-04):
//   flag off -> 404 | no session -> 401 | over the per-user limit -> 429 | id not a uuid -> 404 | asset is not the caller's (or does not exist) -> the SAME 404.
// The routes themselves then only do their own work. Nothing in a refusal reveals whether an asset exists.

import { NextResponse, type NextRequest } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { exploreVideoPipelineEnabled } from '../flags'
import { supabaseVideoAssetStore } from '../assetStore'
import type { VideoAssetRow, VideoAssetStore } from '../uploadFlow'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface GuardedVideoRequest {
  user: { id: string; is_anonymous?: boolean | null }
  asset: VideoAssetRow
  store: VideoAssetStore
  admin: ReturnType<typeof createAdminClient>
  locale: ReturnType<typeof requestLocale>
}

export async function guardVideoRoute(
  req: NextRequest,
  assetId: string,
  limit: { key: string; max: number; windowMs?: number },
): Promise<GuardedVideoRequest | NextResponse> {
  const locale = requestLocale(req)
  const notFound = () => NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  if (!exploreVideoPipelineEnabled()) return notFound()

  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })

  const rl = await publicRateLimit(`${limit.key}:${user.id}`, limit.max, limit.windowMs ?? 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'upload_video') as NextResponse

  if (!UUID.test(assetId)) return notFound()

  const admin = createAdminClient()
  const store = supabaseVideoAssetStore(admin)
  const asset = await store.get(assetId)
  if (!asset || asset.owner_id !== user.id) return notFound()
  return { user, asset, store, admin, locale }
}

export const isGuarded = (g: GuardedVideoRequest | NextResponse): g is GuardedVideoRequest => !(g instanceof Response)
