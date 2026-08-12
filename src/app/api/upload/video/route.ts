import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  createUploadSessionResponse,
  isCreateUploadSessionBody,
  legacyBlobHandshakeAllowed,
} from '@/lib/media/uploadRoute'
import { getMediaProvider } from '@/lib/media'
import type { MediaUploadKind } from '@/lib/media/uploadPolicy'

import { MAX_VIDEO_SIZE_MB } from '@/lib/config/product'

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Size limit from the shared product config — same number the composer enforces.
const MAX_VIDEO_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024
const MAX_THUMB_BYTES = 10 * 1024 * 1024  // 10MB (thumbnail — internal to this route)

/** The only kinds this endpoint may mint. Its authorization scope. */
const ALLOWED_KINDS: readonly MediaUploadKind[] = ['video', 'videoThumbnail']

// POST /api/upload/video
// Authorizes a client-direct upload for a review video or its poster thumbnail.
//
// Two protocols share this endpoint while the storage bridge is in place:
//   media.create-upload-session  -> a GCS resumable session URI (server-owned key)
//   blob.generate-client-token   -> Vercel Blob's client-token handshake
// The active provider decides which one is served; the browser never chooses.
//
// (Supersedes the earlier TODO to move video egress to Cloudflare R2 — the same
// cost problem, answered with Cloud Storage instead.)
export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  // Cap upload authorization per user (each response authorizes one direct PUT).
  if (!rateLimit(`upload-video:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'Ban tai len qua nhanh, thu lai sau giay lat.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Du lieu khong hop le' }, { status: 400 })
  }

  if (isCreateUploadSessionBody(body)) {
    const result = await createUploadSessionResponse(
      body,
      { ownerId: user.id, allowedKinds: ALLOWED_KINDS },
      // `req` carries the deployment's OIDC token in production.
      getMediaProvider(process.env, req)
    )
    return NextResponse.json(result.body, { status: result.status })
  }

  // Once Cloud Storage is the active provider this path must be closed: it is
  // the one route that would still hand out a token for a client-chosen object
  // name, bypassing the server-owned key policy entirely.
  if (!legacyBlobHandshakeAllowed()) {
    return NextResponse.json({ error: 'Giao thuc tai len khong con duoc ho tro' }, { status: 409 })
  }

  try {
    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const isThumbnail = clientPayload === 'thumbnail'
        return {
          allowedContentTypes: isThumbnail ? IMAGE_TYPES : [...VIDEO_TYPES, ...IMAGE_TYPES],
          maximumSizeInBytes: isThumbnail ? MAX_THUMB_BYTES : MAX_VIDEO_BYTES,
          tokenPayload: user.id,
        }
      },
      onUploadCompleted: async () => {
        // No-op for MVP — could update DB here in future
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error('[upload/video]', e)
    return NextResponse.json({ error: 'Loi tao upload token' }, { status: 500 })
  }
}
