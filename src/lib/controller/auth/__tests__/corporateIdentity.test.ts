import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  checkCorporateIdentity,
  CORPORATE_EMAIL_DOMAIN,
  type VerifiedIdentity,
} from '../corporateIdentity'

// FOUNDATION-10C — the corporate identity POLICY, attacked directly.
//
// The integration (that an Actor cannot exist without passing this) is pinned in
// `lib/admin/rbac.test.ts` and `auth/__tests__/corporateBoundary.test.ts`. This
// file attacks the decision itself: every way an attacker might try to make a
// non-corporate address look corporate.

/** A verified, confirmed, non-anonymous identity — the happy shape. */
const identity = (over: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
  email: `staff@${CORPORATE_EMAIL_DOMAIN}`,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  is_anonymous: false,
  ...over,
})

const reasonFor = (over: Partial<VerifiedIdentity>) => {
  const r = checkCorporateIdentity(identity(over))
  return r.ok ? 'ALLOWED' : r.reason
}

describe('accepts a genuine verified corporate identity', () => {
  it('allows the canonical shape', () => {
    const r = checkCorporateIdentity(identity())
    expect(r.ok).toBe(true)
    expect(r.ok && r.domain).toBe(CORPORATE_EMAIL_DOMAIN)
  })

  it('is case-insensitive on the domain', () => {
    expect(reasonFor({ email: 'Staff@TappyAI.COM' })).toBe('ALLOWED')
    expect(reasonFor({ email: 'staff@TAPPYAI.COM' })).toBe('ALLOWED')
  })

  it('preserves the local part verbatim, including case and dots', () => {
    const r = checkCorporateIdentity(identity({ email: 'Huy.Pham+ops@tappyai.com' }))
    expect(r.ok && r.email).toBe('Huy.Pham+ops@tappyai.com')
  })

  it('allows a plus-alias — it is still the same corporate mail domain', () => {
    // Aliases let one mailbox hold several accounts. That is an ACCOUNT-COUNT
    // concern, not a boundary breach: every such account still needs membership,
    // a department scope and a permission before it can do anything.
    expect(reasonFor({ email: 'ops+controller@tappyai.com' })).toBe('ALLOWED')
  })
})

describe('B-1 pre-flight: the production Owner-candidate identity, as measured', () => {
  // FOUNDATION-10C/B-1. This is the assertion that prevents an Owner lockout.
  //
  // Before Owner authority is migrated to `founder@tappyai.com`, the boundary
  // must be proven to ADMIT that identity. The shape below is the live
  // production record for that account, measured read-only via the Supabase
  // Auth Admin API on 2026-08-09 (provider google, email_verified true,
  // is_anonymous false, not banned). The auth user id is deliberately NOT
  // hardcoded: it is production data with no bearing on the decision.
  //
  // If a future change to the policy would refuse this shape, this test goes
  // RED before anyone deploys it — which is the whole point.
  const PRODUCTION_OWNER_CANDIDATE: VerifiedIdentity = {
    email: 'founder@tappyai.com',
    email_confirmed_at: '2026-08-08T07:21:10.05305Z',
    is_anonymous: false,
  }

  it('is ADMITTED by the corporate identity boundary', () => {
    const r = checkCorporateIdentity(PRODUCTION_OWNER_CANDIDATE)
    expect(r.ok).toBe(true)
    expect(r.ok && r.domain).toBe(CORPORATE_EMAIL_DOMAIN)
  })

  it('the identity being migrated FROM is refused', () => {
    // The current production Platform Owner is a consumer gmail.com Google
    // identity. Option B has no Owner exception, which is why B-1 exists.
    const r = checkCorporateIdentity({ ...PRODUCTION_OWNER_CANDIDATE, email: 'redacted@gmail.com' })
    expect(r).toEqual({ ok: false, reason: 'NON_CORPORATE_DOMAIN' })
  })

  it('the live zalo.tappyai.com subdomain identity is refused', () => {
    // Not hypothetical: production holds one real `@zalo.tappyai.com` account
    // (the Zalo auth bridge). It holds no admin role, but it is a live example
    // of why the domain check is exact equality and not a suffix match.
    const r = checkCorporateIdentity({ ...PRODUCTION_OWNER_CANDIDATE, email: 'bridge@zalo.tappyai.com' })
    expect(r).toEqual({ ok: false, reason: 'NON_CORPORATE_DOMAIN' })
  })
})

describe('missing or non-corporate identities', () => {
  it('denies a null/undefined identity', () => {
    expect(checkCorporateIdentity(null)).toEqual({ ok: false, reason: 'NO_IDENTITY' })
    expect(checkCorporateIdentity(undefined)).toEqual({ ok: false, reason: 'NO_IDENTITY' })
  })

  it('denies an anonymous sign-in even if it somehow carries a corporate email', () => {
    expect(reasonFor({ is_anonymous: true })).toBe('ANONYMOUS_IDENTITY')
  })

  it('denies an identity with no email (phone-only / provider without email)', () => {
    expect(reasonFor({ email: undefined })).toBe('NO_EMAIL')
    expect(reasonFor({ email: '' })).toBe('NO_EMAIL')
  })

  it('denies consumer domains', () => {
    for (const email of ['user@gmail.com', 'user@yahoo.com', 'user@outlook.com']) {
      expect(reasonFor({ email }), email).toBe('NON_CORPORATE_DOMAIN')
    }
  })
})

describe('email verification is required, and the right field is read', () => {
  it('denies an unconfirmed corporate address', () => {
    expect(reasonFor({ email_confirmed_at: undefined })).toBe('EMAIL_UNVERIFIED')
    expect(reasonFor({ email_confirmed_at: '' })).toBe('EMAIL_UNVERIFIED')
  })

  it('does NOT accept phone confirmation as email confirmation', () => {
    // `confirmed_at` is Supabase's coalesce of email OR phone confirmation. If
    // the policy read that field, a phone-confirmed account could assert an
    // unconfirmed @tappyai.com address and pass. The extra key must be ignored.
    const withPhoneOnly = {
      ...identity({ email_confirmed_at: undefined }),
      confirmed_at: '2026-01-01T00:00:00Z',
      phone_confirmed_at: '2026-01-01T00:00:00Z',
    } as VerifiedIdentity
    expect(checkCorporateIdentity(withPhoneOnly)).toEqual({ ok: false, reason: 'EMAIL_UNVERIFIED' })
  })

  it('ignores a pending email change (new_email grants nothing)', () => {
    const pending = {
      ...identity({ email: 'consumer@gmail.com' }),
      new_email: `boss@${CORPORATE_EMAIL_DOMAIN}`,
    } as VerifiedIdentity
    expect(checkCorporateIdentity(pending)).toEqual({ ok: false, reason: 'NON_CORPORATE_DOMAIN' })
  })
})

describe('domain confusion — the attacks an endsWith() check would fail', () => {
  // Each of these ends with the literal string "tappyai.com" or looks like it.
  it.each([
    ['suffix domain', 'evil@nottappyai.com'],
    ['prefix-glued domain', 'evil@xtappyai.com'],
    ['attacker subdomain', 'evil@mail.tappyai.com'],
    ['deep attacker subdomain', 'evil@a.b.tappyai.com'],
    ['domain used as a prefix', 'evil@tappyai.com.attacker.io'],
    ['hyphen splice', 'evil@tappyai-com.io'],
    ['trailing dot (FQDN root)', 'evil@tappyai.com.'],
    ['different TLD', 'evil@tappyai.co'],
    ['different TLD, longer', 'evil@tappyai.company'],
  ])('denies %s', (_label, email) => {
    expect(reasonFor({ email })).toBe('NON_CORPORATE_DOMAIN')
  })

  it('the policy does not use endsWith — proven by the suffix case', () => {
    expect('evil@nottappyai.com'.endsWith(CORPORATE_EMAIL_DOMAIN)).toBe(true)
    expect(reasonFor({ email: 'evil@nottappyai.com' })).toBe('NON_CORPORATE_DOMAIN')
  })
})

describe('unicode, punycode and homoglyph attacks', () => {
  it('denies a Cyrillic homoglyph domain', () => {
    // U+0430 CYRILLIC SMALL LETTER A renders identically to ASCII "a".
    const homoglyph = 'evil@tаppyai.com'
    expect(homoglyph).not.toBe('evil@tappyai.com')
    expect(reasonFor({ email: homoglyph })).toBe('MALFORMED_EMAIL')
  })

  it('denies a punycode-encoded lookalike domain', () => {
    expect(reasonFor({ email: 'evil@xn--tppyai-5wa.com' })).toBe('NON_CORPORATE_DOMAIN')
  })

  it('denies a fullwidth-character domain', () => {
    expect(reasonFor({ email: 'evil@ｔappyai.com' })).toBe('MALFORMED_EMAIL')
  })

  it('denies a domain carrying a zero-width joiner', () => {
    expect(reasonFor({ email: 'evil@tappyai​.com' })).toBe('MALFORMED_EMAIL')
  })

  it('is not fooled by locale-sensitive case folding', () => {
    // toLowerCase() is locale-independent by spec; these must not fold onto the
    // corporate domain under any locale.
    expect(reasonFor({ email: 'evil@TAPPYAİ.com' })).toBe('MALFORMED_EMAIL')
    expect(reasonFor({ email: 'evil@tappyai.cKm' })).toBe('MALFORMED_EMAIL')
  })
})

describe('malformed addresses', () => {
  it.each([
    ['no @ at all', 'tappyai.com'],
    ['two @ signs', 'evil@attacker.io@tappyai.com'],
    ['two @ signs, reversed', 'evil@tappyai.com@attacker.io'],
    ['empty local part', '@tappyai.com'],
    ['empty domain', 'evil@'],
  ])('denies %s', (_label, email) => {
    expect(reasonFor({ email })).toBe('MALFORMED_EMAIL')
  })

  it.each([
    ['leading space', ' evil@tappyai.com'],
    ['trailing space', 'staff@tappyai.com '],
    ['embedded newline', 'evil@attacker.io\nstaff@tappyai.com'],
    ['embedded carriage return', 'evil@attacker.io\rstaff@tappyai.com'],
    ['embedded tab', 'staff@tappyai.com\tevil'],
    // Built with an explicit code point: a literal NUL in source is exactly the
    // corruption class this project has shipped before, and is unreviewable.
    ['NUL byte', `staff@tappyai.com${String.fromCharCode(0)}.attacker.io`],
  ])('denies %s rather than normalising it into acceptance', (_label, email) => {
    expect(reasonFor({ email })).toBe('MALFORMED_EMAIL')
  })

  it('denies a non-string email defensively', () => {
    const weird = { ...identity(), email: 42 as unknown as string }
    expect(checkCorporateIdentity(weird)).toEqual({ ok: false, reason: 'NO_EMAIL' })
  })
})

describe('the policy is pure and fail-closed', () => {
  it('never returns ok for anything that is not an exact corporate domain', () => {
    // Exhaustive sweep over every case used above: the ONLY allowed results are
    // the ones this suite explicitly asserts as ALLOWED.
    const shouldDeny = [
      'user@gmail.com',
      'evil@nottappyai.com',
      'evil@mail.tappyai.com',
      'evil@tappyai.com.attacker.io',
      'evil@tappyai.com.',
      'evil@tаppyai.com',
      '@tappyai.com',
      'evil@',
      'tappyai.com',
    ]
    for (const email of shouldDeny) {
      expect(checkCorporateIdentity(identity({ email })).ok, email).toBe(false)
    }
  })

  it('makes the same decision every time (no hidden state)', () => {
    const a = checkCorporateIdentity(identity({ email: 'evil@gmail.com' }))
    const b = checkCorporateIdentity(identity({ email: 'evil@gmail.com' }))
    expect(a).toEqual(b)
  })

  it('does not mutate the identity it was given', () => {
    const input = identity({ email: 'Staff@TappyAI.COM' })
    const snapshot = JSON.stringify(input)
    checkCorporateIdentity(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

describe('the source itself is not silently corrupted', () => {
  // This project has shipped a security guard whose regex escape collapsed into
  // a literal control byte, leaving it matching nothing while reading as
  // correct (Component 9a, and again in Component 7's test file). The
  // control-character check in this module was written as a code-point scan
  // precisely so there is no escape to corrupt — this assertion keeps it that
  // way, and would also catch a corrupted escape reintroduced elsewhere.
  const SOURCE = readFileSync(join(process.cwd(), 'src/lib/controller/auth/corporateIdentity.ts'), 'utf8')

  it('contains no stray control characters', () => {
    const offenders: string[] = []
    SOURCE.split(/\r?\n/).forEach((line, i) => {
      for (let c = 0; c < line.length; c++) {
        const code = line.charCodeAt(c)
        if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
          offenders.push(`${i + 1}:${c + 1} U+${code.toString(16).padStart(4, '0')}`)
        }
      }
    })
    expect(offenders).toEqual([])
  })

  it('compares the domain by equality, never by endsWith/includes', () => {
    const code = SOURCE.split('\n')
      .filter((l) => {
        const t = l.trim()
        return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
      })
      .join('\n')
    expect(code).not.toMatch(/\.endsWith\(/)
    expect(code).not.toMatch(/\.includes\(/)
    expect(code).toMatch(/!==\s*CORPORATE_EMAIL_DOMAIN/)
  })

  it('reads the corporate domain from source, not from the environment', () => {
    // An env-configurable boundary can be weakened by a deploy that never
    // touches this file — or pointed at an attacker-controlled domain.
    expect(SOURCE).not.toMatch(/process\.env/)
  })
})
