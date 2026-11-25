// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ getUser: vi.fn(), headers: [] as Array<Record<string, string> | undefined>, serverGetUser: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_u: string, _k: string, o?: { global?: { headers?: Record<string, string> } }) => { h.headers.push(o?.global?.headers); return { auth: { getUser: h.getUser } } },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: h.serverGetUser } }) }))

import { isOAuthClientToken } from './oauthClientToken'
import { getRequestUser } from './getRequestUser'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (p: unknown) => `${b64({ alg: 'ES256' })}.${b64(p)}.sig`
const REAL_OAUTH = jwt({ iss: 'https://x.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', client_id: 'c20558f1-e1bf-4315-997a-4cb2f54e627e', scope: 'openid profile' })
const SESSION = jwt({ iss: 'https://x.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub: 'u' })
const req = (token?: string) => new Request('http://localhost/api/x', { headers: token ? { authorization: `Bearer ${token}` } : {} })

beforeEach(() => { vi.clearAllMocks(); h.headers.length = 0; h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } }); h.serverGetUser.mockResolvedValue({ data: { user: { id: 'cookie-user' } } }) })

describe('a token issued to a third-party OAuth app is for the MCP gateway only', () => {
  it('recognises the client_id claim and nothing else', () => {
    expect(isOAuthClientToken(REAL_OAUTH)).toBe(true)
    for (const t of [SESSION, 'not-a-jwt', 'a.b', 'a.%%%.c', jwt({ client_id: '' }), jwt({ client_id: 5 }), jwt(null), jwt([])]) expect(isOAuthClientToken(t), t).toBe(false)
  })
  it('every Tappy route sees NO user for such a token, and the Supabase client it gets carries no identity header', async () => {
    const r = await getRequestUser(req(REAL_OAUTH))
    expect(r.user).toBeNull()
    expect(h.getUser).not.toHaveBeenCalled() // the token is not even offered to the identity provider as a login
    expect(h.headers).toEqual([undefined])
  })
  it('a normal session token and a cookie session still work exactly as before', async () => {
    const a = await getRequestUser(req(SESSION))
    expect(a.user).toMatchObject({ id: 'u1' }); expect(h.headers[0]).toEqual({ Authorization: `Bearer ${SESSION}` })
    const b = await getRequestUser(req())
    expect(b.user).toMatchObject({ id: 'cookie-user' })
  })
})
