import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  createUploadSessionResponse,
  isCreateUploadSessionBody,
  legacyBlobHandshakeAllowed,
} from '@/lib/media/uploadRoute'
import { completeUploadResponse, isCompleteUploadBody } from '@/lib/media/uploadCompletion'
import { getMediaProvider } from '@/lib/media'
import type { MediaUploadKind } from '@/lib/media/uploadPolicy'

// Client-direct upload authorization for Original Sound audio. The browser
// uploads straight to storage (bypassing the serverless body-size limit); the
// content type and size limits are enforced here before anything is authorized.
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AUDIO_BYTES = 20 * 1024 * 1024 // 20MB
const MAX_COVER_BYTES = 5 * 1024 * 1024  // 5MB

/** The only kinds this endpoint may mint. Its authorization scope. */
const ALLOWED_KINDS: readonly MediaUploadKind[] = ['audio', 'audioCover']

// POST /api/upload/audio — pass clientPayload='cover' for the cover image on
// the legacy Blob path, or kind='audioCover' on the session path.
export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  // Cap upload authorization per user (each response authorizes one direct PUT).
  if (!rateLimit(`upload-audio:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'Bạn tải lên quá nhanh, thử lại sau giây lát.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  // See /api/upload/video — the browser cannot read its own PUT response.
  if (isCompleteUploadBody(body)) {
    const done = await completeUploadResponse(
      body,
      { ownerId: user.id, allowedKinds: ALLOWED_KINDS },
      getMediaProvider(process.env, req)
    )
    return NextResponse.json(done.body, { status: done.status })
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

  // Closed once Cloud Storage is live — see the note in /api/upload/video.
  if (!legacyBlobHandshakeAllowed()) {
    return NextResponse.json({ error: 'Giao thức tải lên không còn được hỗ trợ' }, { status: 409 })
  }

  try {
    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
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
