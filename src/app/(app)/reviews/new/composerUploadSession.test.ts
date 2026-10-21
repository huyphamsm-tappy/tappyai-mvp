/**
 * Video upload and session: an anonymous or expired session must reach login, never read as an
 * upload failure ("Lỗi tải video"). Source commit 45969f7c1, upload path only.
 *
 * Structural checks, like the other composer suites: each one pins a control-flow relationship
 * (the check runs BEFORE the side effect, and the error is only shown after the check). Each was
 * mutation-checked by removing the guarded call.
 *
 * Deliberately NOT asserted here: an auth gate on mount. Whether anonymous visitors may see the
 * composer is a product decision (owner); the form stays visible to them.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SRC = readFileSync('src/app/(app)/reviews/new/page.tsx', 'utf8')

/** Source text of the handleVideoSelect function (from its declaration to the next top-level section). */
function videoHandler(): string {
  const start = SRC.indexOf('const handleVideoSelect = async')
  const end = SRC.indexOf('/* ─── ', start + 1)
  return SRC.slice(start, end)
}

describe('video upload — session check', () => {
  it('re-checks the session BEFORE any upload work, and returns if it is gone', () => {
    const body = videoHandler()
    expect(body).toMatch(/if\s*\(\s*!\s*\(\s*await\s+ensureSession\(\)\s*\)\s*\)\s*return\b/)
    const check = body.search(/await\s+ensureSession\(\)/)
    const reset = body.indexOf('resetVideoState()')
    const thumb = body.indexOf('generateVideoThumbnail(')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(reset)
    expect(check).toBeLessThan(thumb)
  })

  it('the generic upload-failure message is shown only when the session is still valid', () => {
    const body = videoHandler()
    expect(body).toMatch(/if\s*\(\s*await\s+ensureSession\(\)\s*\)\s*setError\(\s*t\(\s*['"]reviewNew\.videoUploadError['"]\s*\)\s*\)/)
    // The bare message, unguarded, must not exist anywhere in the handler.
    expect(body.match(/setError\(\s*t\(\s*['"]reviewNew\.videoUploadError['"]\s*\)\s*\)/g)?.length ?? 0).toBe(1)
  })

  it('ensureSession sends an unauthenticated user to login with the deep link preserved', () => {
    expect(SRC).toMatch(/const\s+ensureSession\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]{0,260}?supabase\.auth\.getUser\(\)[\s\S]{0,200}?router\.replace\(loginHref\(\)\)/)
    expect(SRC).toMatch(/loginHref\s*=\s*\(\)\s*=>\s*`\/login\?returnTo=\$\{encodeURIComponent\(['"]\/reviews\/new['"]\s*\+\s*window\.location\.search\)\}`/)
  })

  it('does not gate the composer on mount: the form stays visible to anonymous visitors', () => {
    expect(SRC).not.toMatch(/if\s*\(\s*!authed\s*\)/)
    expect(SRC).not.toMatch(/const\s+\[\s*authed\s*,\s*setAuthed\s*\]/)
  })
})
