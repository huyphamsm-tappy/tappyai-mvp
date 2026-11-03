import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDeletionReadyCache } from '@/lib/account/deletionReady'

// The interlock end to end: the REAL route + the REAL readiness helper; only Supabase Auth and the network edge are stubbed.
// ACCOUNT_SELF_DELETE_ENABLED was already `true` in Production before the clean-up existed, so this is the test that says merging the
// route does not switch deletion on until the database has the clean-up.

const h = vi.hoisted(() => ({ authCalls: 0, deleted: [] as string[] }))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => { h.authCalls++; return { user: { id: 'u-1', is_anonymous: false }, supabase: {} } } }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ error: null, count: 0 }) }) }),
    auth: { admin: {
      getUserById: async (id: string) => ({ data: { user: { id, identities: [{ provider: 'email' }], app_metadata: { provider: 'email' } } }, error: null }),
      deleteUser: async (id: string) => { h.deleted.push(id); return { error: null } },
    } },
  }),
}))

import { POST } from './route'

const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proj-sentinel.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-sentinel-0123' }
const call = () => POST(new Request('http://localhost/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) }))
const stubRpc = (r: () => Response | Promise<Response>) => { const f = vi.fn(async () => r()); vi.stubGlobal('fetch', f); return f }

describe('POST /api/account/delete - flag AND installed clean-up', () => {
  beforeEach(() => {
    __resetDeletionReadyCache()
    h.authCalls = 0; h.deleted = []
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
    vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', 'true')
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('🚨 flag true + migration NOT applied (the RPC does not exist: PostgREST 404) -> 404 not_available; no session read, nothing deleted', async () => {
    stubRpc(() => new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 }))
    const r = await call()
    expect(r.status).toBe(404)
    expect((await r.json()).error).toBe('not_available')
    expect(h.authCalls).toBe(0)
    expect(h.deleted).toEqual([])
  })

  it('flag true + the database says the clean-up is NOT ready (false) -> 404', async () => {
    stubRpc(() => new Response('false', { status: 200 }))
    expect((await call()).status).toBe(404)
    expect(h.deleted).toEqual([])
  })

  it('flag true + the readiness check itself fails (500 / network down) -> 404 (fail closed)', async () => {
    stubRpc(() => new Response('x', { status: 500 }))
    expect((await call()).status).toBe(404)
    __resetDeletionReadyCache()
    stubRpc(() => { throw new TypeError('fetch failed') })
    expect((await call()).status).toBe(404)
    expect(h.deleted).toEqual([])
  })

  it('flag false -> 404 and the database is never asked', async () => {
    vi.stubEnv('ACCOUNT_SELF_DELETE_ENABLED', 'false')
    const f = stubRpc(() => new Response('true', { status: 200 }))
    expect((await call()).status).toBe(404)
    expect(f).not.toHaveBeenCalled()
  })

  it('flag true + clean-up installed (the owner applied the migration) -> the route works and deletes exactly the caller', async () => {
    stubRpc(() => new Response('true', { status: 200 }))
    const r = await call()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(h.deleted).toEqual(['u-1'])
  })
})
