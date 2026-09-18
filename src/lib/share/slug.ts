// Public share slugs: short, URL-safe, unguessable enough.
//
// 10 base62 characters ≈ 59 bits. Not a secret (the page is public) but not
// enumerable either: a crawler cannot walk /r/aaaaaaaaaa … and find every
// share. Generated from crypto, never from content — a slug derived from the
// query would leak it into the URL.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export const SLUG_LENGTH = 10
export const SLUG_RE = /^[A-Za-z0-9]{10}$/

export function newSlug(length: number = SLUG_LENGTH): string {
  // Web Crypto: available in Node ≥ 19 and on the edge runtime, so the OG image
  // route (edge) can import this module without pulling in `node:crypto`.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/** Strict: the public route must 404 on anything that is not exactly a slug. */
export function isValidSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value)
}
