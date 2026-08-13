// Server-side policy for client-direct uploads.
//
// Under Vercel Blob the browser chose the object name (`videos/${Date.now()}.mp4`)
// and the server only constrained content type and size. On GCS the bucket is
// publicly readable, so a client-chosen name is both an overwrite primitive and
// an enumeration surface. This module is the single place that decides what an
// upload may be and what it will be called; the client contributes nothing to
// the key.
//
// Every constraint here reproduces one that Vercel Blob was enforcing against
// the client token, so switching providers changes where the rule lives, not
// what it permits.

import { MAX_VIDEO_SIZE_MB } from '@/lib/config/product'
import { assertSafeMediaKey, isSafeKeySegment, randomMediaSuffix, type MediaPrefix } from './key'

export type MediaUploadKind =
  | 'video'
  | 'videoThumbnail'
  | 'audio'
  | 'audioCover'
  | 'dealLogo'
  | 'dealBanner'

export interface UploadKindPolicy {
  prefix: MediaPrefix
  /** The only content types this kind accepts, lowercase and parameter-free. */
  contentTypes: readonly string[]
  maxBytes: number
}

const MB = 1024 * 1024

const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
] as const

export const MEDIA_UPLOAD_POLICIES: Record<MediaUploadKind, UploadKindPolicy> = {
  // The composer enforces the same number client-side; both read the shared config.
  video: { prefix: 'videos', contentTypes: [...VIDEO_TYPES, ...IMAGE_TYPES], maxBytes: MAX_VIDEO_SIZE_MB * MB },
  videoThumbnail: { prefix: 'thumbnails', contentTypes: IMAGE_TYPES, maxBytes: 10 * MB },
  audio: { prefix: 'music', contentTypes: AUDIO_TYPES, maxBytes: 20 * MB },
  audioCover: { prefix: 'music', contentTypes: IMAGE_TYPES, maxBytes: 5 * MB },
  // Parity with the Blob route: admins could upload SVG logos. An SVG served
  // from storage.googleapis.com scripts in that origin, not in tappyai.com's,
  // exactly as it did from the Blob host.
  dealLogo: { prefix: 'deals', contentTypes: [...IMAGE_TYPES, 'image/svg+xml'], maxBytes: 5 * MB },
  dealBanner: { prefix: 'deals', contentTypes: [...IMAGE_TYPES, 'image/svg+xml'], maxBytes: 5 * MB },
}

/** Extension is derived from the *allowlisted* content type, never a filename. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
}

/**
 * The file extensions a kind can legitimately produce.
 *
 * Derived from the SAME content-type allowlist that names an object in the
 * first place, so a key can be checked against the policy that minted it
 * without a second, drift-prone list.
 */
export function allowedExtensionsFor(kind: MediaUploadKind): string[] {
  const policy = MEDIA_UPLOAD_POLICIES[kind]
  if (!policy) return []
  return [...new Set(policy.contentTypes.map((ct) => EXTENSIONS[ct]).filter(Boolean))]
}

export type UploadRejectionCode = 'BAD_REQUEST' | 'CONTENT_TYPE' | 'TOO_LARGE'

/**
 * A request that policy refuses. `status` is the HTTP code the route returns;
 * `message` is safe to show a user and names no internal detail.
 */
export class MediaUploadRejectedError extends Error {
  readonly code: UploadRejectionCode
  readonly status: number
  constructor(code: UploadRejectionCode, message: string) {
    super(message)
    this.name = 'MediaUploadRejectedError'
    this.code = code
    this.status = code === 'CONTENT_TYPE' ? 415 : code === 'TOO_LARGE' ? 413 : 400
  }
}

export interface ResolveUploadInput {
  kind: MediaUploadKind
  contentType: string
  sizeBytes: number
  /** The authenticated caller. Becomes a path segment, so it is validated. */
  ownerId: string
}

export interface UploadTarget {
  key: string
  contentType: string
  sizeBytes: number
}

/** Lowercase and drop any `; charset=…` parameter a browser may attach. */
function normaliseContentType(value: unknown): string {
  return typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : ''
}

/**
 * Turns an authorized request into the exact object the server will accept.
 *
 * `allowedKinds` is the endpoint's own scope: it is what stops the video
 * endpoint from minting a deals key for a user who is not an admin. Passing it
 * is not optional.
 */
export function resolveUploadTarget(
  input: ResolveUploadInput,
  allowedKinds: readonly MediaUploadKind[]
): UploadTarget {
  const policy = MEDIA_UPLOAD_POLICIES[input.kind]
  if (!policy || !allowedKinds.includes(input.kind)) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Loại tệp không được hỗ trợ ở đây')
  }

  const contentType = normaliseContentType(input.contentType)
  if (!policy.contentTypes.includes(contentType)) {
    throw new MediaUploadRejectedError('CONTENT_TYPE', 'Định dạng tệp không được hỗ trợ')
  }

  const size = input.sizeBytes
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Kích thước tệp không hợp lệ')
  }
  if (size > policy.maxBytes) {
    throw new MediaUploadRejectedError(
      'TOO_LARGE',
      `Tệp vượt quá giới hạn ${Math.floor(policy.maxBytes / MB)}MB`
    )
  }

  const ext = EXTENSIONS[contentType]
  // Unreachable while every allowlisted type has an entry; the suite pins that.
  if (!ext) throw new MediaUploadRejectedError('CONTENT_TYPE', 'Định dạng tệp không được hỗ trợ')

  // The owner id is a database uuid, but it is about to become a path segment.
  // It must be vetted as ONE segment: `assertSafeMediaKey` alone would happily
  // accept an id of `a/b` as two perfectly valid segments.
  if (!isSafeKeySegment(input.ownerId)) {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Không thể tạo phiên tải lên')
  }

  const key = `${policy.prefix}/${input.ownerId}/${randomMediaSuffix(24)}.${ext}`
  // Belt and braces: the assembled key still goes through the same validator
  // every other write in the system uses.
  try {
    assertSafeMediaKey(key)
  } catch {
    throw new MediaUploadRejectedError('BAD_REQUEST', 'Không thể tạo phiên tải lên')
  }

  return { key, contentType, sizeBytes: size }
}
