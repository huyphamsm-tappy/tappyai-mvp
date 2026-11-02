/**
 * Owner C1 = (b), 29 Oct 2026: a visitor may WRITE a review before signing in; login is asked at the first upload or at Post,
 * and what was typed survives the trip to /login. Structural checks, like the other composer suites: each pins a control-flow
 * relationship and was mutation-checked by removing or reordering the guarded call.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SRC = readFileSync('src/app/(app)/reviews/new/page.tsx', 'utf8')
const between = (from: string, to: string) => { const a = SRC.indexOf(from); return SRC.slice(a, SRC.indexOf(to, a + from.length)) }

describe('a visitor writes first, signs in at the first upload or at Post', () => {
  it('ensureSession: an anonymous chat session is not a signed-in author; the draft is saved BEFORE the redirect', () => {
    const fn = between('const ensureSession = async', '\n  }\n')
    expect(fn).toMatch(/if\s*\(\s*user\s*&&\s*!isAnonymousUser\(user\)\s*\)\s*return true/)
    const save = fn.indexOf('saveDraft()'), go = fn.indexOf('router.replace(loginHref())')
    expect(save).toBeGreaterThan(-1)
    expect(save).toBeLessThan(go)
  })

  it('Post: a visitor (no session or the anonymous one) saves the draft, then goes to login with the deep link', () => {
    const fn = between('const handleSubmit = async', 'const placeId')
    expect(fn).toMatch(/if\s*\(\s*!user\s*\|\|\s*isAnonymousUser\(user\)\s*\)\s*\{\s*saveDraft\(\);\s*router\.push\(loginHref\(\)\);\s*return\s*\}/)
  })

  it('the draft is cleared only once the server stored the review', () => {
    const fn = between('const handleSubmit = async', 'catch (err)')
    const ok = fn.indexOf("if (!res.ok)"), clear = fn.indexOf('localStorage.removeItem(REVIEW_DRAFT_KEY)')
    expect(clear).toBeGreaterThan(ok)
  })

  it('the draft is restored on mount (text fields only), and one older than its TTL is dropped', () => {
    const fx = between('/* ─── Draft (owner C1', '/* ─── Photo upload')
    expect(fx).toMatch(/localStorage\.getItem\(REVIEW_DRAFT_KEY\)/)
    expect(fx).toMatch(/Date\.now\(\)\s*-\s*d\.at\s*>\s*REVIEW_DRAFT_TTL_MS\)\s*\{\s*localStorage\.removeItem\(REVIEW_DRAFT_KEY\)/)
    for (const setter of ['setBody(', 'setPlaceName(', 'setPlaceArea(', 'setRating(', 'setMediaMode(', 'handleUrlChange(']) expect(fx).toContain(setter)
    expect(fx).not.toMatch(/setPhotos\(|setMedia_url\(/) // no media without a signed-in upload
  })
})
