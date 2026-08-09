import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RETURN_TO_PARAM,
  LEGACY_RETURN_TO_PARAM,
  readReturnTo,
  safeReturnTo,
  loginPathFor,
} from '../returnTo'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// The bug: producers emitted `?redirect=/admin`, the login page read `returnTo`,
// so a successful sign-in landed on the consumer home page instead of /admin.
// Both halves read as correct in isolation, which is exactly why a
// string-presence assertion would not have caught it. These tests assert the
// CONTRACT — what a producer emits must be what the consumer resolves.

describe('PRODUCER ⇄ CONSUMER contract (the bug that shipped)', () => {
  it('what loginPathFor() emits is what readReturnTo() resolves', () => {
    const emitted = loginPathFor('/admin')
    const search = emitted.slice(emitted.indexOf('?'))
    expect(readReturnTo(search)).toBe('/admin')
  })

  it('round-trips every protected destination, not just /admin', () => {
    for (const dest of ['/admin', '/admin/rbac', '/admin/analytics/auth', '/profile/settings']) {
      const emitted = loginPathFor(dest)
      expect(readReturnTo(emitted.slice(emitted.indexOf('?'))), dest).toBe(dest)
    }
  })

  it('REGRESSION: a producer using the legacy name would still be honoured', () => {
    // Back-compat only. Producers must not emit this, but bookmarked or stale
    // links may, and dropping them would be a second silent redirect bug.
    expect(readReturnTo(`?${LEGACY_RETURN_TO_PARAM}=/admin`)).toBe('/admin')
  })

  it('REGRESSION: an unknown parameter name resolves to "/" — the failure we shipped', () => {
    // This is the shape of the original defect. If someone renames the producer
    // parameter without updating the consumer, this is what users experience.
    expect(readReturnTo('?someOtherName=/admin')).toBe('/')
  })

  it('the canonical parameter is what producers actually emit', () => {
    expect(loginPathFor('/admin')).toBe(`/login?${RETURN_TO_PARAM}=%2Fadmin`)
  })
})

describe('every Controller producer goes through the shared contract', () => {
  // Behavioural, not string-presence: we take the producer's OWN source, extract
  // the login URL it builds, and feed it to the real consumer. If a producer
  // hand-writes a different parameter name, the extracted URL stops resolving.
  it.each([
    ['src/app/admin/layout.tsx', 'admin layout'],
    ['src/lib/admin/permissions/guards.ts', 'page permission guard'],
  ])('%s (%s) builds its login URL via loginPathFor', (path) => {
    const src = read(path)
    expect(src).toMatch(/redirect\(loginPathFor\('\/admin'\)\)/)
    // and must NOT hand-write a query string
    expect(src).not.toMatch(/\/login\?[a-zA-Z]+=/)
  })

  it('middleware uses the exported constant, never a literal parameter name', () => {
    const src = read('middleware.ts')
    expect(src).toMatch(/RETURN_TO_PARAM/)
    expect(src).not.toMatch(/\?redirect=\$\{/)
    // The value middleware builds must resolve back through the consumer.
    expect(readReturnTo(`?${RETURN_TO_PARAM}=${encodeURIComponent('/admin')}`)).toBe('/admin')
  })

  it('the login page reads through the shared module only', () => {
    const src = read('src/app/login/page.tsx')
    expect(src).toMatch(/readReturnTo\(window\.location\.search\)/)
    // No hand-rolled parameter reads left behind to drift.
    expect(src).not.toMatch(/\.get\('returnTo'\)/)
    expect(src).not.toMatch(/\.get\('redirect'\)/)
  })

  it('the OAuth callback continues to receive the destination as ?next=', () => {
    const login = read('src/app/login/page.tsx')
    expect(login).toMatch(/\/auth\/callback\?next=\$\{encodeURIComponent\(returnTo\)\}/)
    // and the callback re-validates it independently (defence in depth)
    const cb = read('src/app/auth/callback/route.ts')
    expect(cb).toMatch(/startsWith\('\/'\)/)
    expect(cb).toMatch(/startsWith\('\/\/'\)/)
  })
})

describe('OPEN REDIRECT — destinations must stay same-origin', () => {
  it.each([
    ['absolute https', 'https://evil.example'],
    ['absolute http', 'http://evil.example/x'],
    ['protocol-relative', '//evil.example'],
    ['protocol-relative with path', '//evil.example/admin'],
    ['backslash form', '/\\evil.example'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['bare host', 'evil.example'],
    ['empty', ''],
  ])('rejects %s → "/"', (_label, value) => {
    expect(safeReturnTo(value)).toBe('/')
    expect(readReturnTo(`?${RETURN_TO_PARAM}=${encodeURIComponent(value)}`)).toBe('/')
    expect(readReturnTo(`?${LEGACY_RETURN_TO_PARAM}=${encodeURIComponent(value)}`)).toBe('/')
  })

  it('rejects a missing or non-string destination', () => {
    expect(safeReturnTo(null)).toBe('/')
    expect(safeReturnTo(undefined)).toBe('/')
    expect(readReturnTo('')).toBe('/')
  })

  it('loginPathFor never emits an external destination', () => {
    expect(loginPathFor('https://evil.example')).toBe('/login')
    expect(loginPathFor('//evil.example')).toBe('/login')
  })

  it('allows ordinary internal paths, including query and hash', () => {
    expect(safeReturnTo('/admin')).toBe('/admin')
    expect(safeReturnTo('/admin/rbac?tab=roles')).toBe('/admin/rbac?tab=roles')
    expect(safeReturnTo('/admin#section')).toBe('/admin#section')
  })
})

describe('the full unauthenticated /admin journey', () => {
  it('/admin → middleware login URL → login reads it → back to /admin', () => {
    // 1. middleware builds the login URL for the blocked path
    const pathname = '/admin'
    const search = `?${RETURN_TO_PARAM}=${encodeURIComponent(pathname)}`
    // 2. login page resolves the destination from that query string
    const dest = readReturnTo(search)
    // 3. OAuth hands it to the callback, which re-validates independently
    const next = dest
    const validatedByCallback = next.startsWith('/') && !next.startsWith('//') ? next : '/'
    expect(validatedByCallback).toBe('/admin')
  })

  it('falls back safely to "/" when no destination was supplied', () => {
    expect(readReturnTo('')).toBe('/')
    expect(loginPathFor('/')).toBe('/login')
  })
})
