// The shared body of the three client-direct upload endpoints.
//
// Each route keeps its own authorization — video and audio use `getRequestUser`,
// deals uses `requirePermission` + `isSameOrigin` — and calls in here only once
// the caller has already passed every guard it had before. Nothing in this file
// authorizes anything; it decides what an already-authorized caller may upload.
//
// The response is a discriminated union so the flag stays server-side:
//
//   { provider: 'gcs', uploadUrl, url, key }   -> PUT the bytes to uploadUrl
//   { provider: 'blob' }                       -> use the legacy Blob handshake
//
// Returning `blob` rather than exposing MEDIA_PROVIDER to the browser means
// there is exactly one source of truth for which provider is live, and flipping
// it back is still a server-only change.

import { getMediaProvider } from './index'
import {
  MediaUploadRejectedError,
  resolveUploadTarget,
  type MediaUploadKind,
} from './uploadPolicy'
import type { MediaProvider } from './types'

export const CREATE_UPLOAD_SESSION_TYPE = 'media.create-upload-session'

export interface CreateUploadSessionBody {
  type: typeof CREATE_UPLOAD_SESSION_TYPE
  kind?: unknown
  contentType?: unknown
  size?: unknown
}

/**
 * True for our request shape, false for Vercel Blob's `blob.generate-client-token`
 * handshake. The two protocols share an endpoint, so they must be told apart
 * before either is acted on.
 */
export function isCreateUploadSessionBody(body: unknown): body is CreateUploadSessionBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { type?: unknown }).type === CREATE_UPLOAD_SESSION_TYPE
  )
}

export interface UploadSessionContext {
  /** The authenticated caller; becomes part of the object key. */
  ownerId: string
  /** The kinds THIS endpoint may mint. Its own authorization scope. */
  allowedKinds: readonly MediaUploadKind[]
}

export interface UploadSessionOutcome {
  status: number
  body: Record<string, unknown>
}

/**
 * Resolves an authorized session request. Returns a status and body rather than
 * a Response so it stays trivially testable and each route keeps control of its
 * own error envelope.
 */
export async function createUploadSessionResponse(
  body: unknown,
  ctx: UploadSessionContext,
  provider: MediaProvider = getMediaProvider()
): Promise<UploadSessionOutcome> {
  // Blob has no session concept. Say so and let the client take the old path;
  // no key is derived and no provider call is made.
  if (!provider.createUploadSession) return { status: 200, body: { provider: 'blob' } }

  const input = (body ?? {}) as CreateUploadSessionBody

  let target
  try {
    target = resolveUploadTarget(
      {
        kind: input.kind as MediaUploadKind,
        contentType: String(input.contentType ?? ''),
        sizeBytes: typeof input.size === 'number' ? input.size : Number.NaN,
        ownerId: ctx.ownerId,
      },
      ctx.allowedKinds
    )
  } catch (e) {
    if (e instanceof MediaUploadRejectedError) return { status: e.status, body: { error: e.message } }
    throw e
  }

  try {
    const opened = await provider.createUploadSession(target)
    return {
      status: 200,
      body: {
        provider: provider.id,
        uploadUrl: opened.uploadUrl,
        url: opened.url,
        key: opened.key,
        contentType: target.contentType,
      },
    }
  } catch {
    // Every failure past this point is ours, not the caller's: a rejected
    // credential exchange, a timeout, a refusal from Cloud Storage. The caller
    // learns only that it failed — never the provider's status text, never the
    // token, never a partially built session URI. It must not degrade into a
    // Blob upload either: that would silently defeat server-owned keys.
    return { status: 502, body: { error: 'Không thể tạo phiên tải lên. Vui lòng thử lại.' } }
  }
}

/**
 * Whether the endpoint may still serve Vercel Blob's client-token handshake.
 *
 * Once GCS is the active provider this must be false: leaving the handshake
 * reachable would leave a live path that mints a client-chosen object name,
 * bypassing every rule in `uploadPolicy`.
 */
export function legacyBlobHandshakeAllowed(provider: MediaProvider = getMediaProvider()): boolean {
  return provider.id === 'blob'
}
