import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_VIDEO_BYTES = 50 * 1024 * 1024  // 50MB
const MAX_THUMB_BYTES = 10 * 1024 * 1024  // 10MB

// POST /api/upload/video
// Generates a Vercel Blob upload token for client-side upload.
// Client uploads directly to Blob (bypasses serverless body size limit).
// Pass clientPayload='thumbnail' for thumbnail uploads.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
