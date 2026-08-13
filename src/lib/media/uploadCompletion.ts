// Server-side completion check for client-direct uploads.
//
// A browser cannot see the result of its own upload. The PUT to a GCS resumable
// session URI answers 200 with no `Access-Control-*` headers, so the response is
// blocked and XHR reports `status 0` with no headers — indistinguishable from a
// network failure, even though the object was written. Measured in production,
// both protocols, twice.
//
// So the client stops guessing and asks us. We hold the credential, we are not
// a browser, and no CORS sits between us and Cloud Storage: we look the object
// up and answer whether it is really there. Only then may a URL be persisted.
//
// The dangerous shortcut — treating `status 0` as success — is precisely what
// this exists to avoid. It would persist URLs for uploads that never finished.
//
// BINDING: the caller sends back the key WE issued. The key policy already
// encodes `${prefix}/${ownerId}/${random}.${ext}`, so we can re-derive that the
// key belongs to the authenticated caller and to a kind this endpoint may mint.
// That is what keeps this from becoming a "read any object" oracle — no second
// identity system, no stored session state.

import {
  allowedExtensionsFor,
  MEDIA_UPLOAD_POLICIES,
  MediaUploadRejectedError,
  type MediaUploadKind,
} from './uploadPolicy'
import { isSafeKeySegment } from './key'
import { getMediaProvider } from './index'
import type { MediaProvider } from './types'

export const COMPLETE_UPLOAD_TYPE = 'media.complete-upload'

export interface CompleteUploadBody {
  type: typeof COMPLETE_UPLOAD_TYPE
  kind?: unknown
  key?: unknown
}

export function isCompleteUploadBody(body: unknown): body is CompleteUploadBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { type?: unknown }).type === COMPLETE_UPLOAD_TYPE
  )
}

/**
 * Accepts a key only if THIS server could have issued it to THIS caller for
 * THIS endpoint. Throws otherwise, before any storage call is made.
 *
 * Structural, not heuristic: exactly three segments, the prefix the kind writes
 * under, the authenticated caller's own id, and one safe filename whose
 * extension the kind's content-type allowlist can actually produce.
 */
export function assertOwnedUploadKey(
  key: unknown,
  kind: MediaUploadKind,
  ownerId: string,
  allowedKinds: readonly MediaUploadKind[]
): string {
  const policy = MEDIA_UPLOAD_POLICIES[kind]
  if (!policy || !allowedKinds.includes(kind)) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Loại tệp không được hỗ trợ ở đây')
  }
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }
  // An absolute URL is never a key. Rejecting it explicitly stops the endpoint
  // being handed someone else's bucket.
  if (/^[a-z][a-z0-9+.-]*:/i.test(key) || key.startsWith('/')) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }

  const segments = key.split('/')
  if (segments.length !== 3) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }
  const [prefix, owner, filename] = segments

  if (prefix !== policy.prefix) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }
  // The anti-oracle check: only the caller's own namespace.
  if (owner !== ownerId || !isSafeKeySegment(owner)) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }
  if (!isSafeKeySegment(filename)) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }

  const dot = filename.lastIndexOf('.')
  const ext = dot < 0 ? '' : filename.slice(dot + 1).toLowerCase()
  if (!allowedExtensionsFor(kind).includes(ext)) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Khóa tệp không hợp lệ')
  }

  return key
}

export interface CompleteUploadContext {
  ownerId: string
  allowedKinds: readonly MediaUploadKind[]
}

export interface CompleteUploadOutcome {
  status: number
  body: Record<string, unknown>
}

/**
 * Confirms an upload really landed, and returns the URL to persist.
 *
 * Fails closed at every step: a missing object, an empty object, a stored
 * content type outside the kind's allowlist, or a storage error all mean the
 * upload did not succeed. No URL is ever returned except for an object this
 * server has just seen with its own credential.
 */
export async function completeUploadResponse(
  body: unknown,
  ctx: CompleteUploadContext,
  provider: MediaProvider = getMediaProvider()
): Promise<CompleteUploadOutcome> {
  // Blob has no client-direct session, so it has nothing to complete.
  if (!provider.statObject) {
    return { status: 409, body: { error: 'Không hỗ trợ xác nhận tải lên ở chế độ này' } }
  }

  const input = (body ?? {}) as CompleteUploadBody
  let key: string
  try {
    key = assertOwnedUploadKey(input.key, input.kind as MediaUploadKind, ctx.ownerId, ctx.allowedKinds)
  } catch (e) {
    if (e instanceof MediaUploadRejectedError) return { status: e.status, body: { error: e.message } }
    throw e
  }

  let found: { size: number; contentType: string } | null
  try {
    found = await provider.statObject(key)
  } catch {
    // Ours, not the caller's: a credential or network problem. Never echo it.
    return { status: 502, body: { error: 'Không xác nhận được tệp. Vui lòng thử lại.' } }
  }

  if (!found || found.size <= 0) {
    return { status: 422, body: { error: 'Tải lên chưa hoàn tất. Vui lòng thử lại.' } }
  }

  const policy = MEDIA_UPLOAD_POLICIES[input.kind as MediaUploadKind]
  const stored = (found.contentType || '').split(';')[0].trim().toLowerCase()
  if (!policy.contentTypes.includes(stored)) {
    return { status: 422, body: { error: 'Định dạng tệp không được hỗ trợ' } }
  }

  // Derived from the verified key — never echoed from the request.
  return { status: 200, body: { ok: true, url: provider.publicUrl(key), key } }
}
