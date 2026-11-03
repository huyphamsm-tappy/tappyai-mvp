import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { requireMerchant } from '@/lib/business/routeGuard'
import { createUploadSessionResponse, isCreateUploadSessionBody } from '@/lib/media/uploadRoute'
import type { MediaUploadKind } from '@/lib/media/uploadPolicy'

// POST /api/business/media/upload-intent — authorize one client-direct product
// image upload.
//
// Reuses the platform media pipeline unchanged: this route contributes
// authorization and nothing else. It does not choose the object name, does not
// touch storage, and does not process the image.
//
// 🔑 THE OWNER ID IS THE MERCHANT'S PUBLIC ID, AND THAT IS THE OWNERSHIP MODEL.
//
// `resolveUploadTarget` builds every key as `{prefix}/{ownerId}/{random}.{ext}`,
// so passing the merchant's public id stamps the shop into the path. Product
// create and update then refuse any `image_asset_key` whose second segment is
// not the caller's own id, which is what stops one merchant pointing a product
// at another merchant's image — or at `avatars/…`, which is somebody's face.
//
// The PUBLIC id is used rather than the internal UUID for a second reason: the
// bucket is publicly readable, so the key ends up in a URL. An internal primary
// key has no business being there.
//
// The bucket being public also means this is an INTEGRITY control, not a
// confidentiality one: a shared image leaks nothing a product page would not
// already show. What it prevents is a product displaying an arbitrary object
// from the store.
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
// AUTHORIZATION Active merchant only. A suspended shop uploads nothing.
// PII           None.
// ERRORS        401 · 403 · 400 bad_request · 429 rate_limited · 4xx/502 from
//               the media policy (content type, size, provider)

const ALLOWED_KINDS: readonly MediaUploadKind[] = ['productImage']

// 🔑 A SHOP BELONGS TO A REAL ACCOUNT. A Supabase anonymous session is still a
// `user`, so `getRequestUser` returning one does not mean the caller has an
// account — `refuseAnonymousSocialWrite` is what draws that line. U02's
// whole-surface guard is what made this explicit rather than assumed.

export async function POST(req: Request) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const anonRefusal = refuseAnonymousSocialWrite(req, gate.user)
    if (anonRefusal) return anonRefusal

    const rl = await distributedRateLimit(
      `business:media:intent:${gate.ctx.merchantId}`,
      60,
      60_000
    )
    if (!rl.ok) return apiError(req, 'rate_limited', 'rate.retryShortly', 429)

    const body = await req.json().catch(() => null)
    if (!isCreateUploadSessionBody(body)) {
      return apiError(req, 'bad_request', 'validation.badBody', 400)
    }

    const outcome = await createUploadSessionResponse(body, {
      ownerId: gate.ctx.merchantPublicId,
      allowedKinds: ALLOWED_KINDS,
    })
    return NextResponse.json(outcome.body, { status: outcome.status })
  } catch (e) {
    logBusinessError('media.upload', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
