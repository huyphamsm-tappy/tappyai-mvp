// Group dining lifecycle (owner 20/11): creating a group (clipped, no double groups, a limit), leaving it, deleting it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { FakeDb } from './fakeDb'

const h = vi.hoisted(() => ({ user: null as { id: string; is_anonymous?: boolean } | null, db: {} as Record<string, Array<Record<string, unknown>>>, denyRate: false }))
vi.mock('@/lib/auth/getRequestUser', async () => { const { fakeClient } = await import('./fakeDb'); return { getRequestUser: async () => ({ user: h.user, supabase: fakeClient(() => h.db as FakeDb) }) } })
vi.mock('@/lib/supabase/admin', async () => { const { fakeClient } = await import('./fakeDb'); return { createAdminClient: () => fakeClient(() => h.db as FakeDb) } })
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: !h.denyRate, retryAfter: 5, scope: 'instance' }) }))

import { POST as create } from './route'
import { DELETE as remove } from './[id]/route'
import { POST as leave } from './[id]/leave/route'

const G = '5f0c3c0e-0000-4000-8000-000000000001'
const CREATOR = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const PENDING = '33333333-3333-4333-8333-333333333333'
const OUTSIDER = '44444444-4444-4444-8444-444444444444'

const createReq = (body: unknown) => create(new NextRequest('http://t.test/api/group', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
const removeReq = () => remove(new NextRequest(`http://t.test/api/group/${G}`, { method: 'DELETE' }), { params: { id: G } })
const leaveReq = () => leave(new NextRequest(`http://t.test/api/group/${G}/leave`, { method: 'POST' }), { params: { id: G } })

beforeEach(() => {
  h.denyRate = false
  h.user = { id: CREATOR }
  h.db = {
    groups: [{ id: G, name: 'Bua toi thu 6', creator_id: CREATOR, created_at: '2020-01-01T00:00:00Z' }],
    group_members: [
      { id: 'm1', group_id: G, user_id: MEMBER, name: 'Linh', status: 'member' },
      { id: 'm2', group_id: G, user_id: PENDING, name: 'Bao', status: 'pending' },
    ],
  }
})

describe('POST /api/group: creating a group', () => {
  it('creates a group owned by the caller, with its name clipped and cleaned', async () => {
    h.db.groups = []
    const res = await createReq({ name: `  Tiec   ${'x'.repeat(200)}  ` })
    expect(res.status).toBe(200)
    expect(h.db.groups).toHaveLength(1)
    expect(h.db.groups[0].creator_id).toBe(CREATOR)
    expect(String(h.db.groups[0].name).length).toBeLessThanOrEqual(60)
    expect(String(h.db.groups[0].name).startsWith('Tiec x')).toBe(true)
  })
  it('a second tap on the same name within a minute returns the first group instead of making another', async () => {
    h.db.groups = []
    const a = await (await createReq({ name: 'Nhom ban than' })).json()
    const b = await (await createReq({ name: 'Nhom ban than' })).json()
    expect(h.db.groups).toHaveLength(1)
    expect(b.id).toBe(a.id)
  })
  it('a name that is empty or not text is refused; no account is 401; the rate limit applies', async () => {
    expect((await createReq({ name: '   ' })).status).toBe(400)
    expect((await createReq({ name: 42 })).status).toBe(400)
    h.user = null
    expect((await createReq({ name: 'A' })).status).toBe(401)
    h.user = { id: CREATOR }
    h.denyRate = true
    expect((await createReq({ name: 'A' })).status).toBe(429)
  })
})

describe('POST /api/group/[id]/leave', () => {
  it('an accepted member leaves; a pending person withdraws the request', async () => {
    h.user = { id: MEMBER }
    expect((await leaveReq()).status).toBe(200)
    expect(h.db.group_members.map(r => r.user_id)).toEqual([PENDING])
    h.user = { id: PENDING }
    expect((await leaveReq()).status).toBe(200)
    expect(h.db.group_members).toEqual([])
  })
  it('the creator can not leave (the group is deleted instead); a stranger is 404; no account is 401', async () => {
    expect((await leaveReq()).status).toBe(400)
    expect(h.db.groups).toHaveLength(1)
    h.user = { id: OUTSIDER }
    expect((await leaveReq()).status).toBe(404)
    h.user = null
    expect((await leaveReq()).status).toBe(401)
  })
})

describe('DELETE /api/group/[id]', () => {
  it('the creator deletes the group', async () => {
    expect((await removeReq()).status).toBe(200)
    expect(h.db.groups).toEqual([])
  })
  it('a member, a pending person or a stranger can not (and learn nothing); an unknown group is 404; no account is 401', async () => {
    for (const uid of [MEMBER, PENDING, OUTSIDER]) {
      h.user = { id: uid }
      expect([403, 404], uid).toContain((await removeReq()).status)
    }
    expect(h.db.groups).toHaveLength(1)
    h.user = { id: CREATOR }
    h.db.groups = []
    expect((await removeReq()).status).toBe(404)
    h.user = null
    expect((await removeReq()).status).toBe(401)
  })
})
