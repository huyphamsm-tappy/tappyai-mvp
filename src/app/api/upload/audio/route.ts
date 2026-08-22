import { getRequestUser } from '@/lib/auth/getRequestUser'
import { rateLimit } from '@/lib/security/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  createUploadSessionResponse,
  isCreateUploadSessionBody,
} from '@/lib/media/uploadRoute'
import { completeUploadResponse, isCompleteUploadBody } from '@/lib/media/uploadCompletion'
import { getMediaProvider } from '@/lib/media'
import type { MediaUploadKind } from '@/lib/media/uploadPolicy'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

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
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  // Cap upload authorization per user (each response authorizes one direct PUT).
  if (!rateLimit(`upload-audio:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
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

  // The retired Blob client-token handshake — see the note in /api/upload/video.
  return NextResponse.json({ error: 'unsupported_protocol', message: serverMessage('media.uploadProtocol', requestLocale(req)) }, { status: 409 })
}
