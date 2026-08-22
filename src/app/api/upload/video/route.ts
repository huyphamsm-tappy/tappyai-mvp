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

import { MAX_VIDEO_SIZE_MB } from '@/lib/config/product'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

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
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  // Cap upload authorization per user (each response authorizes one direct PUT).
  if (!rateLimit(`upload-video:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  // The browser cannot read its own PUT response to Cloud Storage, so it asks
  // us whether the object actually landed before any URL is persisted.
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

  // Anything else is the retired Vercel Blob client-token handshake. It handed
  // out a token for a CLIENT-CHOSEN object name, bypassing the server-owned key
  // policy, so it is refused outright rather than gated behind a flag.
  return NextResponse.json({ error: 'unsupported_protocol', message: serverMessage('media.uploadProtocol', requestLocale(req)) }, { status: 409 })
}
