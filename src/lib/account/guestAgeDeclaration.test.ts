import { describe, expect, it } from 'vitest'
import { evaluateGuestAge, guestAgeCookie, readCookie, readGuestAgeDeclaration, GUEST_AGE_COOKIE, GUEST_AGE_HEADER } from './guestAgeDeclaration'

const NOW = new Date(Date.UTC(2026, 8, 17)) // 2026-09-17

describe('evaluateGuestAge — a self-declaration, evaluated server-side', () => {
  it('"18plus" is eligible', () => {
    expect(evaluateGuestAge('18plus', NOW)).toEqual({ status: 'eligible', value: '18plus' })
  })
  it('a full date of birth is exact: 18 today is eligible, 18 tomorrow is not', () => {
    expect(evaluateGuestAge('2008-09-17', NOW).status).toBe('eligible')
    expect(evaluateGuestAge('2008-09-18', NOW).status).toBe('ineligible')
    expect(evaluateGuestAge('1990-01-01', NOW).status).toBe('eligible')
  })
  it('a birth year alone is read by year: 2008 → 18 → eligible, 2009 → 17 → ineligible', () => {
    expect(evaluateGuestAge('2008', NOW)).toEqual({ status: 'eligible', value: '2008' })
    expect(evaluateGuestAge('2009', NOW).status).toBe('ineligible')
  })
  it('nonsense is unknown, never eligible: future, impossible, malformed, non-string', () => {
    for (const v of ['2030', '2030-01-01', '1800', '1800-01-01', '2005-02-30', 'yes', '', '18+', 18, null, undefined, true]) {
      expect(evaluateGuestAge(v as never, NOW).status, String(v)).toBe('unknown')
    }
  })
})

describe('readGuestAgeDeclaration — header (installed app) first, then the web cookie', () => {
  it('reads the cookie', () => {
    const h = new Headers({ cookie: `foo=bar; ${GUEST_AGE_COOKIE}=1990-01-01; x=y` })
    expect(readGuestAgeDeclaration(h, NOW).status).toBe('eligible')
  })
  it('prefers the header', () => {
    const h = new Headers({ cookie: `${GUEST_AGE_COOKIE}=2015-01-01`, [GUEST_AGE_HEADER]: '18plus' })
    expect(readGuestAgeDeclaration(h, NOW).status).toBe('eligible')
  })
  it('nothing declared → unknown', () => {
    expect(readGuestAgeDeclaration(new Headers(), NOW).status).toBe('unknown')
    expect(readGuestAgeDeclaration(new Headers({ cookie: 'a=b' }), NOW).status).toBe('unknown')
  })
  it('readCookie is exact on the name and decodes', () => {
    expect(readCookie('tappy_guest_age_x=1; tappy_guest_age=2000-01-01', 'tappy_guest_age')).toBe('2000-01-01')
    expect(readCookie('tappy_guest_age=2000%2D01%2D01', 'tappy_guest_age')).toBe('2000-01-01')
    expect(readCookie(null, 'tappy_guest_age')).toBeNull()
  })
})

describe('guestAgeCookie', () => {
  it('is HttpOnly, Lax, a year long, and Secure only when asked', () => {
    expect(guestAgeCookie('1990-01-01', false)).toBe('tappy_guest_age=1990-01-01; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly')
    expect(guestAgeCookie('18plus', true)).toContain('; Secure')
  })
})
