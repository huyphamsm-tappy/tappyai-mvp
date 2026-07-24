// /api/admin/deals/upload — mint a Vercel Blob upload token for a deal's banner
// or logo image (admin+). The admin manager uploads the file directly to Blob
// with this token; the resulting public https URL is then saved on the deal.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireAdminRole, adminErrorResponse, adminError, isSameOrigin } from '@/lib/admin/rbac'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB — logos/banners are small

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAdminRole(req, 'admin')
    if (!isSameOrigin(req)) return adminError('FORBIDDEN', 'Cross-origin request denied', 403)
    if (!rateLimit(`admin:deals:upload:${user.id}`, 40, 60_000).ok) {
      return adminError('RATE_LIMITED', 'Too many requests', 429)
    }

    const body = (await req.json()) as HandleUploadBody
    const jsonResponse = await handleUpload({
      body,
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
