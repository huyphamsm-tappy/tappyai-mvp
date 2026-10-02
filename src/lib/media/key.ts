// Key validation. The old `put()` calls passed template strings straight to
// Vercel Blob; on GCS an object name is a *path* inside a bucket we also serve
// publicly, so an unvalidated key is an arbitrary-write primitive. Every write
// goes through here.

/** The only prefixes any producer is allowed to write under. */
export const ALLOWED_MEDIA_PREFIXES = [
  'avatars',
  // Profile cover images — same public bucket and the same server-only writer
  // (POST /api/profile) as avatars; a prefix of its own so the two never collide.
  'covers',
  'reviews',
  'videos',
  'thumbnails',
  'music',
  'deals',
] as const

export type MediaPrefix = (typeof ALLOWED_MEDIA_PREFIXES)[number]

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// Built from escapes so no literal control byte ever appears in this source.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]')
const MAX_KEY_LENGTH = 512

/**
 * True when a value is safe to use as ONE path segment.
 *
 * `assertSafeMediaKey` accepts nested segments by design, so it cannot be used
 * to vet a value that is about to be interpolated into a key: an id of `a/b`
 * would pass as two valid segments. Anything substituted into a key template
 * goes through here first.
 */
export function isSafeKeySegment(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && SEGMENT.test(value)
}

export class InvalidMediaKeyError extends Error {
  constructor(reason: string) {
    super(`Invalid media key: ${reason}`)
    this.name = 'InvalidMediaKeyError'
  }
}

/**
 * Returns the key unchanged when it is safe; throws otherwise.
 *
 * Rejects: absolute paths, `..` traversal, backslashes, empty or duplicated
 * segments, control characters, unknown prefixes, and over-long keys.
 */
export function assertSafeMediaKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) throw new InvalidMediaKeyError('empty')
  if (key.length > MAX_KEY_LENGTH) throw new InvalidMediaKeyError('too long')
  if (CONTROL_CHARS.test(key)) throw new InvalidMediaKeyError('control character')
  if (key.includes('\\')) throw new InvalidMediaKeyError('backslash')
  if (key.startsWith('/')) throw new InvalidMediaKeyError('absolute path')
  if (key.includes('//')) throw new InvalidMediaKeyError('empty segment')

  const segments = key.split('/')
  if (segments.length < 2) throw new InvalidMediaKeyError('missing prefix')

  const [prefix, ...rest] = segments
  if (!(ALLOWED_MEDIA_PREFIXES as readonly string[]).includes(prefix)) {
    throw new InvalidMediaKeyError(`prefix "${prefix}" is not allowed`)
  }
  for (const s of rest) {
    if (s === '.' || s === '..') throw new InvalidMediaKeyError('path traversal')
    if (!SEGMENT.test(s)) throw new InvalidMediaKeyError(`bad segment "${s}"`)
  }
  return key
}

/**
 * Cache-busting suffix, replacing Vercel Blob's `addRandomSuffix`. Only
 * characters the key validator accepts in a segment.
 */
export function randomMediaSuffix(length = 24): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += alphabet[b % alphabet.length]
  return out
}

/**
 * F-096 · the per-user prefixes account deletion may list and delete, and nothing wider.
 *
 * Every user upload is keyed by the uploader's id (measured 2026-09-25 on every writer):
 *   avatars/<uid>-…  covers/<uid>-…                       (POST /api/profile)
 *   reviews/<uid>/…                                        (POST /api/reviews/upload)
 *   videos/<uid>/…  thumbnails/<uid>/…  music/<uid>/…     (uploadPolicy: `${prefix}/${ownerId}/…`)
 *   avatars/group-<groupId>-…                              (POST /api/group/[id]/avatar)
 * `deals/<uid>/…` is excluded on purpose: deal artwork belongs to the deal, not to the admin who
 * uploaded it.
 */
const UUID_RE_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OWNER_PREFIX_RE = new RegExp(
  `^(?:(?:avatars|covers)/${UUID_RE_SRC}-|(?:reviews|videos|thumbnails|music)/${UUID_RE_SRC}/|avatars/group-${UUID_RE_SRC}-)$`,
)

/** Throws unless `prefix` names exactly ONE owner — never '', never a bare top-level prefix. */
export function assertOwnerScopedPrefix(prefix: string): string {
  if (typeof prefix !== 'string' || !OWNER_PREFIX_RE.test(prefix)) {
    throw new InvalidMediaKeyError('not an owner-scoped prefix')
  }
  return prefix
}

/** The prefixes holding a deleted user's uploads, and the avatars of the groups they created. */
export function accountMediaPrefixes(userId: string, groupIds: readonly string[] = []): string[] {
  const out = [
    `avatars/${userId}-`, `covers/${userId}-`,
    `reviews/${userId}/`, `videos/${userId}/`, `thumbnails/${userId}/`, `music/${userId}/`,
    ...groupIds.map(g => `avatars/group-${g}-`),
  ]
  // Every prefix is re-validated: a malformed id must fail here, not widen a listing.
  return out.map(assertOwnerScopedPrefix)
}

/** True when the value is already an absolute http(s) URL rather than a key. */
export function isAbsoluteMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
