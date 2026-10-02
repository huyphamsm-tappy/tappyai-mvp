/**
 * POST /api/age-declaration — the guest's 18+ self-declaration (owner D1, revised).
 * Sets a device cookie, writes nothing else, and stores an under-18 answer too so
 * the refusal is durable on that device.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/security/rateLimit', () => ({
  rateLimit: () => ({ ok: true, retryAfter: 0 }),
  dailyRateLimit: () => ({ ok: true }),
  clientIp: () => '127.0.0.1',
}))

import { POST } from './route'

const post = (body: unknown, https = false) => POST({
  url: `${https ? 'https' : 'http'}://localhost/api/age-declaration`,
  nextUrl: new URL(`${https ? 'https' : 'http'}://localhost/api/age-declaration`),
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve(body),
} as never)

describe('POST /api/age-declaration', () => {
  it('a date of birth of an adult: 200 eligible, HttpOnly Lax cookie carrying the date', async () => {
    const res = await post({ dateOfBirth: '1990-01-01' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ageStatus: 'eligible' })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('tappy_guest_age=1990-01-01')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
  })
  it('over https the cookie is Secure', async () => {
    const res = await post({ dateOfBirth: '1990-01-01' }, true)
    expect(res.headers.get('set-cookie')).toContain('Secure')
  })
  it('"I am 18+" confirmation: 200 eligible', async () => {
    const res = await post({ confirm18: true })
    expect(await res.json()).toEqual({ ageStatus: 'eligible' })
    expect(res.headers.get('set-cookie')).toContain('tappy_guest_age=18plus')
  })
  it('under 18: 200 with ineligible, and the answer is stored so the refusal sticks', async () => {
    const res = await post({ dateOfBirth: '2015-06-01' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ageStatus: 'ineligible' })
    expect(res.headers.get('set-cookie')).toContain('tappy_guest_age=2015-06-01')
  })
  it('malformed, future, impossible or missing: 400, no cookie', async () => {
    for (const b of [{}, { dateOfBirth: '2005-02-30' }, { dateOfBirth: '2099-01-01' }, { dateOfBirth: 'yes' }, { confirm18: 'true' }]) {
      const res = await post(b)
      expect(res.status, JSON.stringify(b)).toBe(400)
      expect((await res.json()).error).toBe('invalid_request')
      expect(res.headers.get('set-cookie')).toBeNull()
    }
  })
})
