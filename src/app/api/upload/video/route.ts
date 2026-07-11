import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

import { MAX_VIDEO_SIZE_MB } from '@/lib/config/product'

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Size limit from the shared product config — same number the composer enforces.
const MAX_VIDEO_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024
const MAX_THUMB_BYTES = 10 * 1024 * 1024  // 10MB (thumbnail — internal to this route)

// POST /api/upload/video
// Generates a Vercel Blob upload token for client-side upload.
// Client uploads directly to Blob (bypasses serverless body size limit).
// Pass clientPayload='thumbnail' for thumbnail uploads.
//
// TODO(cost): Migrate video storage to Cloudflare R2 + CDN to reduce egress cost at scale.
// Keep Vercel Blob for avatars and small images (infrequent access, low egress).
// Thumbnails can stay on Blob since they are small. Videos are the egress bottleneck.
export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
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
