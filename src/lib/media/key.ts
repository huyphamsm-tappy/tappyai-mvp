// Key validation. The old `put()` calls passed template strings straight to
// Vercel Blob; on GCS an object name is a *path* inside a bucket we also serve
// publicly, so an unvalidated key is an arbitrary-write primitive. Every write
// goes through here.

/** The only prefixes any producer is allowed to write under. */
export const ALLOWED_MEDIA_PREFIXES = [
  'avatars',
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

/** True when the value is already an absolute http(s) URL rather than a key. */
export function isAbsoluteMediaUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
