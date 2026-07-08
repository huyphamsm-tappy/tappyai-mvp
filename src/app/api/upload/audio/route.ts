import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

// Client-direct Blob upload token for Original Sound audio. The browser uploads
// straight to Blob (bypassing the serverless body-size limit); Vercel Blob
// enforces the allowed content types + max size against the token.
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20MB
const MAX_COVER_BYTES = 5 * 1024 * 1024  // 5MB

// POST /api/upload/audio — pass clientPayload='cover' for the cover image.
export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const isCover = clientPayload === 'cover'
        return {
          allowedContentTypes: isCover ? IMAGE_TYPES : AUDIO_TYPES,
          maximumSizeInBytes: isCover ? MAX_COVER_BYTES : MAX_AUDIO_BYTES,
          tokenPayload: user.id,
        }
      },
      onUploadCompleted: async () => {
        // No-op for MVP.
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (e) {
    console.error('[upload/audio]', e)
    return NextResponse.json({ error: 'Lỗi tạo upload token' }, { status: 500 })
  }
}
