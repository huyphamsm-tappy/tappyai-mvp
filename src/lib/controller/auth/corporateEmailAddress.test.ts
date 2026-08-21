import { describe, it, expect } from 'vitest'
import { checkCorporateEmailAddress, checkCorporateIdentity } from './corporateIdentity'

// The ADDRESS half of the Option B boundary, extracted so the Login screen can
// tell a visitor "that is not a @tappyai.com address" BEFORE sending a one-time
// code to it — instead of letting them complete a whole sign-in and only then
// meeting `/access-denied?reason=not_corporate`.
//
// 🔑 EXTRACTED, NOT DUPLICATED. `corporateIdentity.ts` warns in its own comments
// that this rule "can be silently weakened — or pointed at an attacker-controlled
// domain". A second copy in the UI is exactly that failure. There is ONE
// implementation; `checkCorporateIdentity` now calls it, and the tests below pin
// that the two cannot drift.
//
// 🔑 THIS IS NOT A SECURITY BOUNDARY. It is a courtesy check on a typed string.
// The address is unverified — anyone can type `ceo@tappyai.com`. What makes the
// boundary real is `checkCorporateIdentity`, which additionally requires a
// CONFIRMED address on a real session, server-side. The tests at the bottom pin
// that the identity-level checks did not move into the address-level function.

describe('the address rule — shape', () => {
  it('accepts a corporate address', () => {
    expect(checkCorporateEmailAddress('ops@tappyai.com')).toEqual({
      ok: true,
      email: 'ops@tappyai.com',
      domain: 'tappyai.com',
    })
  })

  it('accepts a plus-alias — same mail domain', () => {
    expect(checkCorporateEmailAddress('ops+oncall@tappyai.com').ok).toBe(true)
  })

  it('accepts an upper-case domain — the fold is locale-independent', () => {
    expect(checkCorporateEmailAddress('ops@TappyAI.COM').ok).toBe(true)
  })

  it('reports an EMPTY address as absent, not malformed — the server already does', () => {
    // Kept deliberately: `checkCorporateIdentity` returns NO_EMAIL for '' today.
    // Reclassifying it here would change server behaviour to make a UI message
    // read better, which is the wrong way round.
    const r = checkCorporateEmailAddress('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('NO_EMAIL')
  })

  it.each([
    ['no @', 'opstappyai.com'],
    ['two @', 'a@b@tappyai.com'],
    ['empty local part', '@tappyai.com'],
    ['empty domain', 'ops@'],
    ['a space inside', 'ops @tappyai.com'],
    ['a newline inside', 'ops@tappyai.com\n'],
  ])('rejects a malformed address (%s)', (_label, email) => {
    const r = checkCorporateEmailAddress(email)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('MALFORMED_EMAIL')
  })

  it.each([null, undefined])('rejects %s', (email) => {
    expect(checkCorporateEmailAddress(email as unknown as string).ok).toBe(false)
  })
})

describe('the address rule — the domain, exactly', () => {
  it.each([
    ['a foreign domain', 'ops@gmail.com'],
    ['a suffix look-alike', 'evil@nottappyai.com'],
    ['a subdomain', 'evil@mail.tappyai.com'],
    ['a prefix', 'evil@tappyai.com.attacker.io'],
    ['a trailing dot', 'evil@tappyai.com.'],
  ])('rejects %s', (_label, email) => {
    const r = checkCorporateEmailAddress(email)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('NON_CORPORATE_DOMAIN')
  })

  it('rejects a domain carrying a non-ASCII code point that folds into ASCII', () => {
    // U+212A KELVIN SIGN lower-cases to a plain `k`. The charset test runs on the
    // RAW domain, before folding, which is what makes this structural.
    const r = checkCorporateEmailAddress('ops@tappyai.comK')
    expect(r.ok).toBe(false)
  })
})

describe('the identity check still owns everything the address check must not', () => {
  const corporate = { email: 'ops@tappyai.com', email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false }

  it('an UNCONFIRMED corporate address passes the address rule and FAILS the identity rule', () => {
    // The whole point of the split. The Login screen may say "the shape is
    // right"; only a confirmed session gets past the real boundary.
    expect(checkCorporateEmailAddress(corporate.email).ok).toBe(true)
    const r = checkCorporateIdentity({ ...corporate, email_confirmed_at: null } as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('EMAIL_UNVERIFIED')
  })

  it('an anonymous identity is still refused by the identity rule', () => {
    const r = checkCorporateIdentity({ ...corporate, is_anonymous: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ANONYMOUS_IDENTITY')
  })

  it('a confirmed corporate identity is still accepted — no regression', () => {
    expect(checkCorporateIdentity(corporate).ok).toBe(true)
  })

  it('the two functions agree on every domain verdict — one rule, not two', () => {
    for (const email of [
      'ops@tappyai.com',
      'ops@gmail.com',
      'evil@nottappyai.com',
      'evil@mail.tappyai.com',
      'a@b@tappyai.com',
    ]) {
      const address = checkCorporateEmailAddress(email)
      const identity = checkCorporateIdentity({
        email,
        email_confirmed_at: '2026-01-01T00:00:00Z',
        is_anonymous: false,
      })
      expect(identity.ok).toBe(address.ok)
      if (!identity.ok && !address.ok) expect(identity.reason).toBe(address.reason)
    }
  })
})
