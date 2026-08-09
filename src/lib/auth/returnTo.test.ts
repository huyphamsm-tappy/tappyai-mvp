import { describe, it, expect } from 'vitest'
import {
  RETURN_TO_PARAM,
  LEGACY_RETURN_TO_PARAM,
  DEFAULT_RETURN_DEST,
  isSafeReturnTo,
  readReturnTo,
  loginSearchFor,
  loginUrlFor,
} from './returnTo'

// The bug these tests exist for: the Controller guards produced
// `/login?redirect=/admin` while /login consumed `returnTo`, so the destination
// was dropped and every unauthenticated /admin visit ended on the consumer home
// page. A string-presence assertion would NOT have caught it — both halves were
// individually "correct". Only feeding a producer's real output into the real
// consumer catches a disagreement, so that is what these tests do.

describe('producer → consumer contract', () => {
  // If anyone changes the parameter name on one side only, this fails.
  it('a destination produced for login is read back unchanged', () => {
    const dest = readReturnTo(new URL(`https://x${loginUrlFor('/admin')}`).search)
    expect(dest).toBe('/admin')
  })

  it('the middleware search string round-trips too', () => {
    expect(readReturnTo(loginSearchFor('/admin/audit'))).toBe('/admin/audit')
  })

  it('round-trips destinations that need encoding', () => {
    const dest = '/service/abc?tab=reviews&q=a b'
    expect(readReturnTo(loginSearchFor(dest))).toBe(dest)
  })

  it('producers emit the canonical parameter, never the legacy one', () => {
    const search = new URLSearchParams(loginSearchFor('/admin'))
    expect(search.get(RETURN_TO_PARAM)).toBe('/admin')
    expect(search.get(LEGACY_RETURN_TO_PARAM)).toBeNull()
  })
})

describe('readReturnTo', () => {
  it('reads the canonical parameter', () => {
    expect(readReturnTo('?returnTo=%2Fadmin')).toBe('/admin')
  })

  // Backwards compatibility: links already in the wild still work.
  it('still accepts the legacy `redirect` parameter', () => {
    expect(readReturnTo('?redirect=%2Fadmin')).toBe('/admin')
  })

  it('prefers the canonical parameter when both are present', () => {
    expect(readReturnTo('?redirect=%2Fold&returnTo=%2Fadmin')).toBe('/admin')
  })

  it('falls back to the home page when absent or empty', () => {
    expect(readReturnTo('')).toBe(DEFAULT_RETURN_DEST)
    expect(readReturnTo('?foo=bar')).toBe(DEFAULT_RETURN_DEST)
    expect(readReturnTo('?returnTo=')).toBe(DEFAULT_RETURN_DEST)
  })

  it('accepts a URLSearchParams as well as a raw string', () => {
    expect(readReturnTo(new URLSearchParams({ returnTo: '/admin' }))).toBe('/admin')
  })
})

describe('open-redirect protection', () => {
  // Every one of these must leave the user on this site.
  const hostile = [
    'https://evil.example',
    'http://evil.example',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',          // browsers normalise "\" to "/" ⇒ protocol-relative
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'mailto:a@b.c',
    'admin',                     // not path-absolute
  ]

  it.each(hostile)('rejects %s and falls back to the home page', (value) => {
    expect(isSafeReturnTo(value)).toBe(false)
    expect(readReturnTo(`?returnTo=${encodeURIComponent(value)}`)).toBe(DEFAULT_RETURN_DEST)
  })

  it.each(hostile)('rejects %s via the legacy parameter too', (value) => {
    expect(readReturnTo(`?redirect=${encodeURIComponent(value)}`)).toBe(DEFAULT_RETURN_DEST)
  })

  it('a hostile value can never be smuggled through a producer', () => {
    expect(readReturnTo(loginSearchFor('https://evil.example'))).toBe(DEFAULT_RETURN_DEST)
  })

  const safe = ['/', '/admin', '/admin/audit', '/reviews?tab=all', '/users/123#top']
  it.each(safe)('allows the internal path %s', (value) => {
    expect(isSafeReturnTo(value)).toBe(true)
    expect(readReturnTo(`?returnTo=${encodeURIComponent(value)}`)).toBe(value)
  })

  it('rejects non-string input', () => {
    expect(isSafeReturnTo(null)).toBe(false)
    expect(isSafeReturnTo(undefined)).toBe(false)
  })
})
