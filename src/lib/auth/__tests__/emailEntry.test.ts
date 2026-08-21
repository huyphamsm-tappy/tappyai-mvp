import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emailEntryRequested, EMAIL_ENTRY_PARAM } from '../emailEntry'
import { readReturnTo, safeReturnTo } from '../returnTo'

// Login email-entry parameter (`/login?email=1`).
//
// The email sign-in block already existed and was already reachable from any
// in-app browser; this parameter only makes the SAME block reachable from a
// normal browser. These tests pin: the default card is unchanged, the parameter
// is strict, redirect handling is untouched, and the parameter reaches nothing
// but presentation.

const ROOT = process.cwd()
const LOGIN_PAGE = readFileSync(join(ROOT, 'src/app/login/page.tsx'), 'utf8')

// ── The parameter itself ─────────────────────────────────────────────────────
describe('emailEntryRequested', () => {
  it('is false when the parameter is absent (a) — default card unchanged', () => {
    expect(emailEntryRequested('')).toBe(false)
    expect(emailEntryRequested('?')).toBe(false)
    expect(emailEntryRequested('?returnTo=/admin')).toBe(false)
    expect(emailEntryRequested(null)).toBe(false)
    expect(emailEntryRequested(undefined)).toBe(false)
  })

  it('is true for exactly ?email=1 (b)', () => {
    expect(emailEntryRequested('?email=1')).toBe(true)
    expect(emailEntryRequested('email=1')).toBe(true)
    expect(emailEntryRequested('?returnTo=%2Fadmin&email=1')).toBe(true)
    expect(emailEntryRequested('?email=1&returnTo=%2Fadmin')).toBe(true)
  })

  it('is strict — any other value leaves the card unchanged', () => {
    for (const s of ['?email=0', '?email=true', '?email=', '?email=2', '?email=yes', '?email=1x', '?emails=1']) {
      expect(emailEntryRequested(s), s).toBe(false)
    }
  })

  it('does not treat an email ADDRESS as a request to open the block', () => {
    expect(emailEntryRequested('?email=support@tappyai.com')).toBe(false)
  })

  it('exposes the parameter name it reads', () => {
    expect(EMAIL_ENTRY_PARAM).toBe('email')
  })
})

// ── Redirect behaviour is untouched (d, e) ───────────────────────────────────
describe('redirect handling is unaffected by the parameter', () => {
  it('returnTo=/admin survives alongside email=1 (d)', () => {
    expect(readReturnTo('?returnTo=%2Fadmin')).toBe('/admin')
    expect(readReturnTo('?returnTo=%2Fadmin&email=1')).toBe('/admin')
    expect(readReturnTo('?email=1&returnTo=%2Fadmin')).toBe('/admin')
  })

  it('the legacy ?redirect= parameter still works alongside email=1 (d)', () => {
    expect(readReturnTo('?redirect=%2Fadmin&email=1')).toBe('/admin')
  })

  it('open redirects are still rejected when email=1 is present (e)', () => {
    for (const evil of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'http://evil.example/admin',
      'javascript:alert(1)',
    ]) {
      expect(safeReturnTo(evil), evil).toBe('/')
      expect(readReturnTo(`?email=1&returnTo=${encodeURIComponent(evil)}`), evil).toBe('/')
    }
  })

  it('the parameter itself can never become a redirect destination', () => {
    // `readReturnTo` reads only returnTo/redirect; `email` is not a destination.
    expect(readReturnTo('?email=1')).toBe('/')
  })
})

// ── The login page wires it as presentation only (a, b, c, f) ────────────────
describe('login page wiring', () => {
  it('the V1 default constant is still false (a)', () => {
    expect(LOGIN_PAGE).toMatch(/const SHOW_EMAIL_OTP_IN_CARD = false/)
  })

  it('the card gate is the constant OR the requested parameter (b)', () => {
    expect(LOGIN_PAGE).toContain('{(SHOW_EMAIL_OTP_IN_CARD || showEmailEntry) && (')
  })

  it('the flag is derived from the URL, not from user input or a body (f)', () => {
    expect(LOGIN_PAGE).toContain('setShowEmailEntry(emailEntryRequested(window.location.search))')
  })

  it('it renders the EXISTING block — no second auth mechanism was added (f)', () => {
    // Exactly one EmailOtpBlock component definition, and the OTP calls are the
    // pre-existing ones.
    expect(LOGIN_PAGE.match(/function EmailOtpBlock\(/g)).toHaveLength(1)
    expect(LOGIN_PAGE.match(/signInWithOtp\(/g)).toHaveLength(1)
    expect(LOGIN_PAGE.match(/verifyOtp\(/g)).toHaveLength(1)
  })

  it('Google / Zalo / Facebook / Guest handlers are untouched (c)', () => {
    for (const handler of ['handleGoogleLogin', 'handleZaloLogin', 'handleFacebookLogin', 'handleGuest']) {
      expect(LOGIN_PAGE, handler).toContain(`const ${handler} = `)
    }
    // Google still goes through Supabase OAuth with the shared returnTo reader.
    expect(LOGIN_PAGE).toContain('signInWithOAuth')
    expect(LOGIN_PAGE.match(/readReturnTo\(window\.location\.search\)/g)!.length).toBeGreaterThanOrEqual(4)
  })

  it('every sign-in path still resolves its destination through readReturnTo (d)', () => {
    expect(LOGIN_PAGE).toContain('const getReturnDest = () => readReturnTo(window.location.search)')
    expect(LOGIN_PAGE).not.toMatch(/window\.location\.href\s*=\s*params\.get/)
  })
})

// ── The parameter cannot reach authorization (f) ─────────────────────────────
describe('the parameter is presentation only', () => {
  const ENTRY_RAW = readFileSync(join(ROOT, 'src/lib/auth/emailEntry.ts'), 'utf8')
  /** Comments explain the security posture and legitimately name these symbols;
   *  the invariant under test is about CODE, so strip prose before asserting. */
  const ENTRY = ENTRY_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('emailEntry imports nothing — no admin, rbac, PDP or supabase dependency (f)', () => {
    expect(ENTRY).not.toMatch(/^import /m)
    for (const forbidden of ['@/lib/admin', 'permissionEngine', 'checkCorporateIdentity', 'createClient', 'platform_owner', 'admin_roles']) {
      expect(ENTRY, forbidden).not.toContain(forbidden)
    }
  })

  it('it grants no role, session or permission — it only returns a boolean (f)', () => {
    expect(emailEntryRequested('?email=1')).toBe(true)
    expect(typeof emailEntryRequested('?email=1')).toBe('boolean')
    expect(ENTRY).not.toMatch(/fetch\(|signIn|setSession|grantRole|\.role\b/i)
  })

  it('the corporate boundary is NOT RE-IMPLEMENTED on the client (f)', () => {
    // ORIGINAL RULE: "the login page must not gain any client-side copy of the
    // corporate boundary." /admin enforcement lives server-side.
    //
    // WHAT CHANGED (Controller V2 Login, 2026-08-21): the Controller's sign-in
    // card now refuses a non-corporate address BEFORE mailing a one-time code to
    // it, so a visitor is told why immediately instead of completing a whole
    // sign-in and only then meeting /access-denied?reason=not_corporate.
    //
    // The rule the original test protects is UNCHANGED and still asserted: there
    // must be no SECOND implementation of what a corporate address is. The card
    // calls `checkCorporateEmailAddress` — the same function
    // `checkCorporateIdentity` calls — so the two cannot disagree. What it must
    // never do is spell the rule out again: no domain literal, no `endsWith`.
    //
    // And it is still not the boundary. The address is unverified; only a
    // CONFIRMED session passes `checkCorporateIdentity`, server-side.
    const SOURCES = [
      ['login page', LOGIN_PAGE],
      ['controller login card', readFileSync(join(ROOT, 'src/components/controller/ControllerLoginCard.tsx'), 'utf8')],
    ] as const

    for (const [label, raw] of SOURCES) {
      // Comments legitimately explain the posture; the invariant is about CODE.
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${label} must not hardcode the domain`).not.toContain('tappyai.com')
      expect(code, `${label} must not re-implement the suffix test`).not.toContain('endsWith(')
      // The identity-level check needs a CONFIRMED session and must stay server-side.
      expect(code, `${label} must not run the identity check`).not.toContain('checkCorporateIdentity(')
    }
  })

  it('the client consults the ONE shared rule rather than restating it (f)', () => {
    const CARD = readFileSync(join(ROOT, 'src/components/controller/ControllerLoginCard.tsx'), 'utf8')
    expect(CARD).toContain("from '@/lib/controller/auth/corporateIdentity'")
    expect(CARD).toContain('checkCorporateEmailAddress(')
  })
})
