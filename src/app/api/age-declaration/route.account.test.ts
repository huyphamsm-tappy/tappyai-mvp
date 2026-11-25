/**
 * POST /api/age-declaration for a SIGNED-IN account (owner decision 18/11/2026): the button answer is
 * recorded through record_age_declaration(), the verdict is RE-READ from user_age_status(), and a failed
 * write admits nobody (503). A guest keeps the cookie-only path (route.test.ts).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: async () => ({ ok: true, retryAfter: 0, scope: 'process' }),
}))

const h = vi.hoisted(() => ({
  user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  record: 'recorded' as string | null,   // null => rpc error
  status: { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: 'adult' } as Record<string, unknown>,
  rpcCalls: [] as Array<[string, unknown]>,
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: {
      rpc: async (name: string, args: unknown) => {
        h.rpcCalls.push([name, args])
        if (name === 'record_age_declaration') {
          return h.record === null ? { data: null, error: { code: '42883', message: 'missing' } } : { data: h.record, error: null }
        }
        return { data: [h.status], error: null }
      },
    },
  }),
}))

import { POST } from './route'

const post = (body: unknown, cookie = 'sb-abc-auth-token=x') => POST({
  url: 'http://localhost/api/age-declaration',
  nextUrl: new URL('http://localhost/api/age-declaration'),
  headers: new Headers({ 'content-type': 'application/json', cookie }),
  json: () => Promise.resolve(body),
} as never)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  h.user = { id: 'u1', is_anonymous: false }
  h.record = 'recorded'
  h.status = { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: 'adult' }
  h.rpcCalls = []
})

describe('signed-in account', () => {
  it('"I confirm": records an adult declaration with the Terms version, re-reads, answers eligible and also remembers it on the device', async () => {
    const res = await post({ confirm18: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ageStatus: 'eligible', canCorrectAge: true, ageDeclaration: 'adult' })
    expect(h.rpcCalls[0][0]).toBe('record_age_declaration')
    expect(h.rpcCalls[0][1]).toEqual({ p_adult: true, p_terms_version: '2026-10-10' })
    expect(h.rpcCalls[1][0]).toBe('user_age_status')
    expect(res.headers.get('set-cookie')).toContain('tappy_guest_age=18plus')
  })

  it('"I am under 18": records a minor declaration, answers ineligible with no correction offered, cookie remembers the refusal', async () => {
    h.status = { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: 'minor' }
    const res = await post({ under18: true })
    expect(h.rpcCalls[0][1]).toEqual({ p_adult: false, p_terms_version: '2026-10-10' })
    expect(await res.json()).toEqual({ ageStatus: 'ineligible', canCorrectAge: false, ageDeclaration: 'minor' })
    expect(res.headers.get('set-cookie')).toContain('tappy_guest_age=under18')
  })

  it('an account with an under-18 date of birth cannot become eligible by the button: the re-read says ineligible, no adult cookie', async () => {
    h.record = 'dob_under_18'
    h.status = { has_dob: true, age_years: 15, age_band: 'under_18', corrections_used: 0, declaration: null }
    const res = await post({ confirm18: true })
    expect((await res.json()).ageStatus).toBe('ineligible')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('an account that declared a minor cannot flip to adult', async () => {
    h.record = 'minor_declared'
    h.status = { has_dob: false, age_years: null, age_band: null, corrections_used: 0, declaration: 'minor' }
    const res = await post({ confirm18: true })
    expect((await res.json()).ageStatus).toBe('ineligible')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('FAIL CLOSED: the write fails (migration not applied) -> 503, nobody admitted, no cookie', async () => {
    h.record = null
    const res = await post({ confirm18: true })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('age_unavailable')
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('FAIL CLOSED: the write "succeeds" but the status still reads unknown -> 503', async () => {
    h.status = { has_dob: false, age_years: null, age_band: null, corrections_used: 0 }
    const res = await post({ confirm18: true })
    expect(res.status).toBe(503)
  })

  it('an anonymous trial session is a guest: cookie only, no database call', async () => {
    h.user = { id: 'anon', is_anonymous: true }
    const res = await post({ confirm18: true })
    expect(await res.json()).toEqual({ ageStatus: 'eligible' })
    expect(h.rpcCalls).toEqual([])
    expect(res.headers.get('set-cookie')).toContain('tappy_guest_age=18plus')
  })

  it('a date-of-birth body is NOT an account write here (PATCH /api/profile owns that)', async () => {
    const res = await post({ dateOfBirth: '1990-01-01' })
    expect(h.rpcCalls).toEqual([])
    expect(await res.json()).toEqual({ ageStatus: 'eligible' })
  })

  it('a request with no session credential never touches the account path', async () => {
    const res = await post({ confirm18: true }, '')
    expect(h.rpcCalls).toEqual([])
    expect(await res.json()).toEqual({ ageStatus: 'eligible' })
  })
})

describe('guest refusal is durable on the device', () => {
  const guestPost = (body: unknown, cookie: string) => POST({
    url: 'http://localhost/api/age-declaration',
    nextUrl: new URL('http://localhost/api/age-declaration'),
    headers: new Headers({ 'content-type': 'application/json', cookie }),
    json: () => Promise.resolve(body),
  } as never)

  it('"I am under 18" stores under18; a later adult press on the same device does not undo it', async () => {
    const minor = await guestPost({ under18: true }, '')
    expect(await minor.json()).toEqual({ ageStatus: 'ineligible' })
    expect(minor.headers.get('set-cookie')).toContain('tappy_guest_age=under18')

    const later = await guestPost({ confirm18: true }, 'tappy_guest_age=under18')
    expect(await later.json()).toEqual({ ageStatus: 'ineligible' })
    expect(later.headers.get('set-cookie')).toBeNull()
  })
})
