// /api/admin/deals/upload — authorize a client-direct upload of a deal's banner
// or logo image (admin+). The admin manager uploads the file with what this
// returns; the resulting public https URL is then saved on the deal.
//
// Two protocols share this endpoint while the storage bridge is in place — see
// the note in /api/upload/video. Authorization is unchanged: permission check,
// same-origin check, rate limit, in that order, before anything is authorized.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { requirePermission, PERMISSIONS } from '@/lib/admin/permissions'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  createUploadSessionResponse,
  isCreateUploadSessionBody,
  legacyBlobHandshakeAllowed,
} from '@/lib/media/uploadRoute'
import type { MediaUploadKind } from '@/lib/media/uploadPolicy'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB — logos/banners are small

/** The only kinds this endpoint may mint. Its authorization scope. */
const ALLOWED_KINDS: readonly MediaUploadKind[] = ['dealLogo', 'dealBanner']

export async function POST(req: NextRequest) {
  try {
    const { user } = await requirePermission(req, PERMISSIONS.COMMERCE_DEALS_UPLOAD_MEDIA)
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:deals:upload:${user.id}`, 40, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return adminError('BAD_REQUEST', 'Malformed request body', 400)
    }

    if (isCreateUploadSessionBody(body)) {
      const result = await createUploadSessionResponse(body, {
        ownerId: user.id,
        allowedKinds: ALLOWED_KINDS,
      })
      return NextResponse.json(result.body, { status: result.status })
    }

    if (!legacyBlobHandshakeAllowed()) {
      return adminError('UPLOAD_PROTOCOL_RETIRED', 'This upload protocol is no longer served', 409)
    }

    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: IMAGE_TYPES,
        maximumSizeInBytes: MAX_IMAGE_BYTES,
        tokenPayload: user.id,
      }),
      onUploadCompleted: async () => {
        /* no-op — the client saves the returned URL onto the deal via PATCH */
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (err) {
    return adminErrorResponse(err)
  }
}
