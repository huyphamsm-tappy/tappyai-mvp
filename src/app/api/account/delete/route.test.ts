import { generateKeyPairSync } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// UAT3 P0 + Apple 5.1.1(v). The route is a gate in front of the ONE deletion path (`auth.admin.deleteUser`). The Apple branch runs the
// REAL client (client-secret signing, code exchange, subject check, revoke) against a stubbed appleid.apple.com; only Supabase Auth
// and the network edge are fakes. `h.events` records the order of side effects so "revoked BEFORE deleted" is asserted, not assumed.

const h = vi.hoisted(() => ({
  user: { id: 'u-1', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  roles: 0,
  owner: 0,
  lookupError: null as unknown,
  identities: [] as Array<{ provider: string; provider_id?: string; identity_data?: { sub?: string } }>,
  appMeta: {} as Record<string, unknown>,
  getUserError: null as { message: string; status?: number; code?: string } | null,
  deleteError: null as { message: string; code?: string } | null,
  deleted: [] as string[],
  events: [] as string[],
  /** Whether the clean-up migration is installed (the real helper has its own tests + deletionInterlock.route.test.ts). */
  ready: true,
}))

vi.mock('@/lib/account/deletionReady', () => ({
  selfDeleteAvailable: async () => process.env.ACCOUNT_SELF_DELETE_ENABLED === 'true' && h.ready,
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ error: h.lookupError, count: table === 'admin_roles' ? h.roles : h.owner }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => h.getUserError
          ? { data: { user: null }, error: h.getUserError }
          : { data: { user: { id, identities: h.identities, app_metadata: h.appMeta } }, error: null },
        deleteUser: async (id: string) => { h.events.push('delete'); if (!h.deleteError) h.deleted.push(id); return { error: h.deleteError } },
      },
    },
  }),
}))

import { POST } from './route'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const APPLE_ENV = { APPLE_SIWA_TEAM_ID: 'TEAM123456', APPLE_SIWA_KEY_ID: 'KEYID12345', APPLE_SIWA_PRIVATE_KEY: PEM }
const idToken = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`
const SECRETS = ['RT-secret-0001', 'code-xyz', 'BEGIN PRIVATE KEY', 'TEAM123456', 'KEYID12345']

type AppleScript = { token?: () => Response; revoke?: () => Response }
function stubApple(s: AppleScript = {}) {
  const f = vi.fn(async (url: string) => {
    if (String(url).endsWith('/auth/token')) {
      h.events.push('apple_token')
      return s.token ? s.token() : new Response(JSON.stringify({ refresh_token: 'RT-secret-0001', id_token: idToken('apple-sub-1') }), { status: 200 })
    }
    h.events.push('apple_revoke')
    return s.revoke ? s.revoke() : new Response('', { status: 200 })
  })
  vi.stubGlobal('fetch', f)
  return f
}

const call = (body: unknown) => POST(new Request('http://localhost/api/account/delete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))
const apple = (extra: Record<string, unknown> = {}) => call({ confirm: 'XÓA', apple_authorization_code: 'code-xyz', ...extra })

const ENV_KEYS = ['ACCOUNT_SELF_DELETE_ENABLED', 'APPLE_SIWA_TEAM_ID', 'APPLE_SIWA_KEY_ID', 'APPLE_SIWA_PRIVATE_KEY', 'APPLE_SIWA_CLIENT_ID']

describe('POST /api/account/delete', () => {
  const prev: Record<string, string | undefined> = {}
  let logs: string[]
  beforeEach(() => {
    for (const k of ENV_KEYS) prev[k] = process.env[k]
    process.env.ACCOUNT_SELF_DELETE_ENABLED = 'true'
    Object.assign(process.env, APPLE_ENV)
    h.user = { id: 'u-1', is_anonymous: false }; h.roles = 0; h.owner = 0; h.lookupError = null; h.deleteError = null; h.deleted = []; h.events = []
    h.identities = [{ provider: 'email' }]; h.appMeta = { provider: 'email', providers: ['email'] }; h.getUserError = null; h.ready = true
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  })
  afterEach(() => {
    for (const k of ENV_KEYS) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k] }
    vi.unstubAllGlobals(); vi.restoreAllMocks()
  })

  // -- unchanged behaviour for everybody who never used Apple ----------------------------------------------------------------
  it('🚨 is not available where the flag is off (production until the clean-up behind it is live)', async () => {
    delete process.env.ACCOUNT_SELF_DELETE_ENABLED
    const r = await call({ confirm: 'XÓA' })
    expect(r.status).toBe(404)
    expect((await r.json()).error).toBe('not_available')
    expect(h.deleted).toEqual([])
  })

  it('🚨 is not available where the clean-up migration is not installed, even with the flag on', async () => {
    h.ready = false
    const r = await call({ confirm: 'XÓA' })
    expect(r.status).toBe(404)
    expect((await r.json()).error).toBe('not_available')
    expect(h.deleted).toEqual([])
  })

  it('refuses no session (401) and an anonymous session (403 account_required)', async () => {
    h.user = null
    expect((await call({ confirm: 'XÓA' })).status).toBe(401)
    h.user = { id: 'anon', is_anonymous: true }
    const anon = await call({ confirm: 'XÓA' })
    expect(anon.status).toBe(403)
    expect((await anon.json()).error).toBe('account_required')
    expect(h.deleted).toEqual([])
  })

  it('refuses without the typed word - for an Apple account too, before anything is revoked', async () => {
    h.identities = [{ provider: 'apple', provider_id: 'apple-sub-1' }]
    const f = stubApple()
    expect((await call({})).status).toBe(400)
    expect((await call({ confirm: 'yes' })).status).toBe(400)
    expect((await call({ confirm: true })).status).toBe(400)
    expect((await call({ apple_authorization_code: 'code-xyz' })).status).toBe(400)
    expect(h.deleted).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })

  it.each(['XÓA', 'xóa', ' XOÁ ', 'DELETE', 'delete'])('accepts %j and deletes exactly the caller', async (word) => {
    const r = await call({ confirm: word })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
    expect(h.deleted).toEqual(['u-1'])
  })

  it('Google / Zalo / email accounts never touch Apple, even if a code is sent', async () => {
    const f = stubApple()
    for (const identities of [[{ provider: 'google' }], [{ provider: 'email' }], [{ provider: 'email' }, { provider: 'google' }], []]) {
      h.identities = identities; h.deleted = []
      const r = await apple()
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ ok: true })
      expect(h.deleted).toEqual(['u-1'])
    }
    expect(f).not.toHaveBeenCalled()
  })

  it('an account with no Apple config is still deletable when it never used Apple', async () => {
    for (const k of ['APPLE_SIWA_TEAM_ID', 'APPLE_SIWA_KEY_ID', 'APPLE_SIWA_PRIVATE_KEY']) delete process.env[k]
    expect((await call({ confirm: 'XÓA' })).status).toBe(200)
    expect(h.deleted).toEqual(['u-1'])
  })

  it('refuses a staff account before deleting (leaver runbook)', async () => {
    h.roles = 1
    expect((await call({ confirm: 'XÓA' })).status).toBe(409)
    h.roles = 0; h.owner = 1
    expect((await call({ confirm: 'XÓA' })).status).toBe(409)
    expect(h.deleted).toEqual([])
  })

  it('fails closed when the staff lookup errors', async () => {
    h.lookupError = { message: 'boom' }
    expect((await call({ confirm: 'XÓA' })).status).toBe(500)
    expect(h.deleted).toEqual([])
  })

  it('maps a foreign-key refusal from Auth to staff_account, anything else to delete_failed', async () => {
    h.deleteError = { message: 'Database error deleting user: update or delete on table "users" violates foreign key constraint' }
    const staff = await call({ confirm: 'XÓA' })
    expect(staff.status).toBe(409)
    expect((await staff.json()).error).toBe('staff_account')
    h.deleteError = { message: 'network' }
    const failed = await call({ confirm: 'XÓA' })
    expect(failed.status).toBe(500)
    const body = await failed.json()
    expect(body.error).toBe('delete_failed')
    expect(typeof body.message).toBe('string')
  })

  it('deleting twice is not an error (the second call finds the user already gone)', async () => {
    h.deleteError = { message: 'User not found', code: 'user_not_found' }
    const r = await call({ confirm: 'XÓA' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  it('a wrong word deletes nothing (XOA1, empty, missing)', async () => {
    for (const confirm of ['XOA1', '', undefined, 'xóa nha']) expect((await call({ confirm })).status).toBe(400)
    expect(h.deleted).toEqual([])
  })

  // -- Sign in with Apple ------------------------------------------------------------------------------------------------------
  describe('an account with an Apple identity', () => {
    beforeEach(() => { h.identities = [{ provider: 'apple', provider_id: 'apple-sub-1', identity_data: { sub: 'apple-sub-1' } }]; h.appMeta = { provider: 'apple', providers: ['apple'] } })

    it('revokes at Apple FIRST (token exchange, then revoke), then deletes; says so; nothing leaks', async () => {
      stubApple()
      const r = await apple()
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body).toEqual({ ok: true, apple_revoked: true })
      expect(h.events).toEqual(['apple_token', 'apple_revoke', 'delete'])
      expect(h.deleted).toEqual(['u-1'])
      for (const s of SECRETS) { expect(JSON.stringify(body)).not.toContain(s); for (const l of logs) expect(l).not.toContain(s) }
      for (const l of logs) { expect(l).not.toContain('u-1'); expect(l).not.toContain('@') }
    })

    it('matches the account by provider_id OR identity_data.sub', async () => {
      stubApple()
      h.identities = [{ provider: 'apple', identity_data: { sub: 'apple-sub-1' } }]
      expect((await apple()).status).toBe(200)
      h.deleted = []; h.identities = [{ provider: 'apple', provider_id: 'apple-sub-1' }]
      expect((await apple()).status).toBe(200)
    })

    it('no code -> 409 apple_authorization_required; Apple untouched; account NOT deleted', async () => {
      const f = stubApple()
      for (const body of [{ confirm: 'XÓA' }, { confirm: 'XÓA', apple_authorization_code: '' }, { confirm: 'XÓA', apple_authorization_code: '   ' }, { confirm: 'XÓA', apple_authorization_code: 42 }]) {
        const r = await call(body)
        expect(r.status).toBe(409)
        expect((await r.json()).error).toBe('apple_authorization_required')
      }
      expect(f).not.toHaveBeenCalled()
      expect(h.deleted).toEqual([])
    })

    it('expired / used / wrong-app code -> 400 apple_authorization_invalid; nothing revoked, nothing deleted', async () => {
      stubApple({ token: () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }) })
      const r = await apple()
      expect(r.status).toBe(400)
      expect((await r.json()).error).toBe('apple_authorization_invalid')
      expect(h.events).toEqual(['apple_token'])
      expect(h.deleted).toEqual([])
    })

    it('a code from a DIFFERENT Apple ID -> 409 apple_identity_mismatch; the revoke endpoint is never called; not deleted', async () => {
      stubApple({ token: () => new Response(JSON.stringify({ refresh_token: 'RT-secret-0001', id_token: idToken('someone-else') }), { status: 200 }) })
      const r = await apple()
      expect(r.status).toBe(409)
      expect((await r.json()).error).toBe('apple_identity_mismatch')
      expect(h.events).toEqual(['apple_token'])
      expect(h.deleted).toEqual([])
    })

    it('an Apple account whose subject cannot be read is refused, never deleted unrevoked', async () => {
      h.identities = []; h.appMeta = { provider: 'apple', providers: ['apple'] }
      stubApple()
      const r = await apple()
      expect(r.status).toBe(409)
      expect(h.deleted).toEqual([])
    })

    it('Apple revocation not configured here -> 503 apple_revoke_unavailable; not deleted; Apple untouched', async () => {
      for (const k of ['APPLE_SIWA_TEAM_ID', 'APPLE_SIWA_KEY_ID', 'APPLE_SIWA_PRIVATE_KEY']) delete process.env[k]
      const f = stubApple()
      const r = await apple()
      expect(r.status).toBe(503)
      expect((await r.json()).error).toBe('apple_revoke_unavailable')
      expect(f).not.toHaveBeenCalled()
      expect(h.deleted).toEqual([])
    })

    it('Apple down at the exchange or at the revoke -> 502 apple_revoke_failed; the account is NOT deleted and the message says so', async () => {
      for (const s of [{ token: () => new Response('{}', { status: 500 }) }, { revoke: () => new Response('{}', { status: 500 }) }]) {
        h.events = []
        stubApple(s)
        const r = await apple()
        expect(r.status).toBe(502)
        const body = await r.json()
        expect(body.error).toBe('apple_revoke_failed')
        expect(body).not.toHaveProperty('apple_revoked')
        expect(h.deleted).toEqual([])
        expect(h.events).not.toContain('delete')
      }
    })

    it('revoked at Apple but the local delete fails -> 500 delete_failed WITHOUT claiming apple_revoked; a retry with a fresh code completes', async () => {
      stubApple()
      h.deleteError = { message: 'network' }
      const first = await apple()
      expect(first.status).toBe(500)
      const body = await first.json()
      expect(body.error).toBe('delete_failed')
      expect(body).not.toHaveProperty('apple_revoked')
      expect(h.deleted).toEqual([])
      h.deleteError = null; h.events = []
      const retry = await apple({ apple_authorization_code: 'code-xyz-2' })
      expect(retry.status).toBe(200)
      expect(await retry.json()).toEqual({ ok: true, apple_revoked: true })
      expect(h.deleted).toEqual(['u-1'])
    })

    it('repeating the request after success is safe: the user is already gone, nothing is revoked twice', async () => {
      const f = stubApple()
      h.getUserError = { message: 'User not found', status: 404, code: 'user_not_found' }
      h.deleteError = { message: 'User not found', code: 'user_not_found' }
      const r = await apple()
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ ok: true })
      expect(f).not.toHaveBeenCalled()
    })

    it('a STAFF account with an Apple identity is refused BEFORE its Apple authorisation is touched', async () => {
      h.roles = 1
      const f = stubApple()
      const r = await apple()
      expect(r.status).toBe(409)
      expect((await r.json()).error).toBe('staff_account')
      expect(f).not.toHaveBeenCalled()
      expect(h.deleted).toEqual([])
    })

    it('a failed identity lookup is NOT "no Apple": 500, nothing revoked, nothing deleted', async () => {
      h.getUserError = { message: 'upstream', status: 500 }
      const f = stubApple()
      const r = await apple()
      expect(r.status).toBe(500)
      expect((await r.json()).error).toBe('delete_failed')
      expect(f).not.toHaveBeenCalled()
      expect(h.deleted).toEqual([])
    })

    it('every error response carries a message and never a secret', async () => {
      for (const script of [{ token: () => new Response(JSON.stringify({ error: 'invalid_grant', hint: 'RT-secret-0001' }), { status: 400 }) }, { revoke: () => new Response(JSON.stringify({ detail: 'RT-secret-0001' }), { status: 500 }) }]) {
        stubApple(script)
        const r = await apple()
        const text = await r.text()
        expect(JSON.parse(text).message).toEqual(expect.any(String))
        for (const s of SECRETS) expect(text).not.toContain(s)
        for (const l of logs) for (const s of SECRETS) expect(l).not.toContain(s)
      }
    })
  })
})
