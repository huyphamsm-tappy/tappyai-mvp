import { describe, it, expect } from 'vitest'
import { safeReturnTo, readReturnTo } from './returnTo'

// The strict destination check is the ONLY one: /age-check, /auth/callback, /auth/confirm and the Zalo
// flow all call it, so an open redirect has exactly one place to be fixed or reintroduced.
describe('safeReturnTo', () => {
  const HOSTILE = [
    '/\\evil.com',          // backslash form: browsers read it as "//evil.com"
    '//evil.com',           // protocol-relative
    '/%5Cevil.com',         // percent-encoded backslash
    '/%5cevil.com',
    '/%2F/evil.com',        // percent-encoded second slash
    'https://evil.com',
    'javascript:alert(1)',
    'evil.com',
    '/\t/evil.com',         // tab is stripped by URL parsers, leaving "//evil.com"
    '/a\\b',
    '/%E0%A4%A',            // malformed escape: refused, not thrown
    '',
    null,
    undefined,
  ]
  for (const raw of HOSTILE) {
    it(`refuses ${JSON.stringify(raw)}`, () => {
      expect(safeReturnTo(raw as string | null | undefined)).toBe('/')
    })
  }

  it('keeps a normal path with a query and a fragment', () => {
    expect(safeReturnTo('/chat?x=1')).toBe('/chat?x=1')
    expect(safeReturnTo('/reviews/abc#c1')).toBe('/reviews/abc#c1')
    expect(safeReturnTo('/')).toBe('/')
  })

  it('readReturnTo applies it to both parameter names', () => {
    expect(readReturnTo('?returnTo=%2F%5Cevil.com')).toBe('/')
    expect(readReturnTo('?redirect=%2Fchat%3Fx%3D1')).toBe('/chat?x=1')
  })
})
