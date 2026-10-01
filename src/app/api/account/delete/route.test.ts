import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// UAT3 P0 — self-service deletion. The route is a gate in front of the ONE deletion path
// (`auth.admin.deleteUser`, as the operator runbook does); these pin the gate and the mapping.

const h = vi.hoisted(() => ({
  user: { id: 'u-1', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  roles: 0,
  owner: 0,
  lookupError: null as unknown,
  deleteError: null as { message: string; code?: string } | null,
  deleted: [] as string[],
}))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ error: h.lookupError, count: table === 'admin_roles' ? h.roles : h.owner }),
      }),
    }),
    auth: { admin: { deleteUser: async (id: string) => { if (!h.deleteError) h.deleted.push(id); return { error: h.deleteError } } } },
  }),
}))

import { POST } from './route'

const call = (body: unknown) => POST(new Request('http://localhost/api/account/delete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

describe('POST /api/account/delete', () => {
  const prev = process.env.ACCOUNT_SELF_DELETE_ENABLED
  beforeEach(() => {
    process.env.ACCOUNT_SELF_DELETE_ENABLED = 'true'
    h.user = { id: 'u-1', is_anonymous: false }; h.roles = 0; h.owner = 0; h.lookupError = null; h.deleteError = null; h.deleted = []
  })
  afterEach(() => { process.env.ACCOUNT_SELF_DELETE_ENABLED = prev })

  it('🚨 is not available where the flag is off (production until D1/D2/D4 are applied)', async () => {
    delete process.env.ACCOUNT_SELF_DELETE_ENABLED
    const r = await call({ confirm: 'XÓA' })
    expect(r.status).toBe(404)
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

  it('refuses without the typed word', async () => {
    expect((await call({})).status).toBe(400)
    expect((await call({ confirm: 'yes' })).status).toBe(400)
    expect((await call({ confirm: true })).status).toBe(400)
    expect(h.deleted).toEqual([])
  })

  it.each(['XÓA', 'xóa', ' XOÁ ', 'DELETE', 'delete', 'XÓA'])('accepts %j and deletes exactly the caller', async (word) => {
    const r = await call({ confirm: word })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
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

  it('owner 01/10: deleting twice is not an error (the second call finds the user already gone)', async () => {
    h.deleteError = { message: 'User not found', code: 'user_not_found' }
    const r = await call({ confirm: 'XÓA' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  it('owner 01/10: a wrong word deletes nothing (XOA1, empty, missing)', async () => {
    for (const confirm of ['XOA1', '', undefined, 'xóa nha']) {
      expect((await call({ confirm })).status).toBe(400)
    }
    expect(h.deleted).toEqual([])
  })
})
