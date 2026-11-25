// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Hardening 21/11/2026: the global middleware used to call the Supabase Auth server for EVERY matched request. A request with no session cookie has nothing to refresh, so it now makes no call
// (a flood of cheap anonymous requests can no longer be amplified onto the auth server). A request WITH a session cookie still validates it (getUser), and /admin still demands a user.

const h = vi.hoisted(() => ({ getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: h.getUser } }) }))

import { middleware } from '../../../middleware'

const req = (path: string, cookie?: string) => new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} })

describe('middleware auth-server calls', () => {
  beforeEach(() => { h.getUser.mockClear(); vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x.test'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon') })

  it('an anonymous request (no session cookie) makes no auth-server call', async () => {
    await middleware(req('/api/health'))
    await middleware(req('/chat', 'theme=dark'))
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it('a request with a Supabase session cookie still validates it', async () => {
    await middleware(req('/chat', 'sb-abcdef-auth-token=abc'))
    expect(h.getUser).toHaveBeenCalledTimes(1)
  })

  it('/admin without a session redirects to login, without calling the auth server', async () => {
    const res = await middleware(req('/admin/users'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(h.getUser).not.toHaveBeenCalled()
  })
})
