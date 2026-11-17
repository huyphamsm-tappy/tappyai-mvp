import { describe, it, expect } from 'vitest'
import { loginErrorKey } from './loginError'
import { dictionaries } from '@/lib/i18n/dictionaries'

describe('loginErrorKey', () => {
  const CASES: Array<[string, string]> = [
    ['no_code', 'login.err.noCode'],
    ['access_denied', 'login.err.cancelled'],
    ['zalo_denied', 'login.err.zaloDenied'],
    ['zalo_failed', 'login.err.zaloFailed'],
    ['zalo_unavailable', 'login.err.zaloUnavailable'],
    ['zalo_invalid', 'login.err.zaloInvalid'],
    ['app_state_invalid', 'login.err.appState'],
    ['Email link is invalid or has expired', 'login.err.linkExpired'],
    ['rate_limited', 'login.err.rateLimited'],
  ]
  for (const [raw, key] of CASES) {
    it(`${raw} -> ${key}`, () => expect(loginErrorKey(raw)).toBe(key))
  }

  it('anything else gets the generic sentence, never its own text', () => {
    expect(loginErrorKey('User already registered')).toBe('login.err.generic')
    expect(loginErrorKey('<script>alert(1)</script>')).toBe('login.err.generic')
  })

  it('nothing to show when there is no error', () => {
    expect(loginErrorKey(null)).toBeNull()
    expect(loginErrorKey('')).toBeNull()
    expect(loginErrorKey('   ')).toBeNull()
  })

  it('every key exists in BOTH languages and is a real sentence', () => {
    const keys = new Set([...CASES.map(([, k]) => k), 'login.err.generic'])
    for (const locale of ['vi', 'en'] as const) {
      for (const k of keys) {
        const text = (dictionaries as Record<string, Record<string, string>>)[locale][k]
        expect(text, `${locale} ${k}`).toBeTruthy()
        expect(text.length).toBeGreaterThan(15)
      }
    }
  })
})
