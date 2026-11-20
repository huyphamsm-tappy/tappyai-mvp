// Group dining is PRIVATE (owner 20/11): a Tappy account AND the leader's acceptance. GET /api/group, POST /api/group/[id]/join and POST /api/group/[id]/members, with a small in-memory database.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({ user: null as { id: string; is_anonymous?: boolean } | null, db: { groups: [] as Row[], group_members: [] as Row[] }, denyRate: false }))

// a tiny query builder over h.db: select / insert / update / delete, eq filters, order, single / maybeSingle, exact counts with head
function fakeClient(opts: { userScoped?: boolean } = {}) {
  return {
    from(table: 'groups' | 'group_members') {
      const filters: Array<[string, unknown]> = []
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let payload: Row = {}
      let count: { head: boolean } | null = null
      const match = (r: Row) => filters.every(([k, v]) => r[k] === v)
      const run = () => {
        const rows = h.db[table]
        if (op === 'insert') {
          if (table === 'group_members' && rows.some(r => r.group_id === payload.group_id && r.user_id === payload.user_id)) return { data: null, error: { code: '23505' }, count: null }
          rows.push({ id: `m${rows.length + 1}`, created_at: new Date(2026, 10, 20, 12, rows.length).toISOString(), ...payload })
          return { data: null, error: null, count: null }
        }
        if (op === 'update') { rows.filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null, count: null } }
        if (op === 'delete') { h.db[table] = rows.filter(r => !match(r)); return { data: null, error: null, count: null } }
        const found = rows.filter(match)
        return { data: count?.head ? null : found, error: null, count: count ? found.length : null }
      }
      const q: Record<string, unknown> = {
        select(_cols?: string, o?: { count?: string; head?: boolean }) { if (o?.count) count = { head: !!o.head }; return q },
        eq(k: string, v: unknown) { filters.push([k, v]); return q },
        order() { return q },
        insert(p: Row) { op = 'insert'; payload = p; return q },
        update(p: Row) { op = 'update'; payload = p; return q },
        delete() { op = 'delete'; return q },
        single() { const r = run(); const row = (r.data as Row[] | null)?.[0] ?? null; return Promise.resolve({ data: row, error: row ? null : { code: 'PGRST116' } }) },
        maybeSingle() { const r = run(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }) },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve(run()).then(resolve) },
      }
      void opts
      return q
    },
  }
}

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: fakeClient({ userScoped: true }) }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeClient() }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: !h.denyRate, retryAfter: 5, scope: 'instance' }) }))

import { GET } from './route'
import { POST as join } from './[id]/join/route'
import { POST as decide } from './[id]/members/route'

const G = '5f0c3c0e-0000-4000-8000-000000000001'
const CREATOR = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const PENDING = '33333333-3333-4333-8333-333333333333'
const OUTSIDER = '44444444-4444-4444-8444-444444444444'

const get = () => GET(new NextRequest(`http://t.test/api/group?id=${G}`))
const joinReq = (body: Record<string, unknown> = { name: 'Cuong', area: 'Quan 3', budget: '200k' }) => join(new NextRequest(`http://t.test/api/group/${G}/join`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: { id: G } })
const decideReq = (body: Record<string, unknown>) => decide(new NextRequest(`http://t.test/api/group/${G}/members`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: { id: G } })

beforeEach(() => {
  h.denyRate = false
  h.user = { id: CREATOR }
  h.db.groups = [{ id: G, name: 'Bua toi thu 6', creator_id: CREATOR, status: 'open', suggestion: null, created_at: '2026-11-20T00:00:00Z', avatar_url: null }]
  h.db.group_members = [
    { id: 'm1', group_id: G, user_id: MEMBER, name: 'Linh', budget: '200k', food_preferences: 'lau', dietary_restrictions: 'di ung hai san', area: 'Binh Thanh', status: 'member', created_at: '2026-11-20T01:00:00Z' },
    { id: 'm2', group_id: G, user_id: PENDING, name: 'Bao', budget: '150k', food_preferences: 'bun', dietary_restrictions: 'chay', area: 'Quan 1', status: 'pending', created_at: '2026-11-20T02:00:00Z' },
  ]
})

describe('GET /api/group: who sees what', () => {
  it('no account: 401 (the group is not public information)', async () => {
    h.user = null
    expect((await get()).status).toBe(401)
  })
  it('the creator sees the group, the accepted members and the pending requests to decide on', async () => {
    const b = await (await get()).json()
    expect(b.state).toBe('creator')
    expect(b.members.map((m: Row) => m.name)).toEqual(['Linh'])
    expect(b.pendingRequests.map((m: Row) => m.name)).toEqual(['Bao'])
    expect(b.pendingRequests[0].id).toBe('m2')
  })
  it('an accepted member sees the group and the accepted members, never a pending request, and no user ids', async () => {
    h.user = { id: MEMBER }
    const b = await (await get()).json()
    expect(b.state).toBe('member')
    expect(b.members.map((m: Row) => m.name)).toEqual(['Linh'])
    expect(b.pendingRequests ?? []).toEqual([])
    expect(JSON.stringify(b)).not.toContain(PENDING)
    expect(JSON.stringify(b)).not.toContain('user_id')
  })
  it('a pending person sees only that their request waits (and the group name), nothing about the members', async () => {
    h.user = { id: PENDING }
    const b = await (await get()).json()
    expect(b).toEqual({ state: 'pending', id: G, name: 'Bua toi thu 6' })
  })
  it('a stranger with the link sees only the name and can ask to join', async () => {
    h.user = { id: OUTSIDER }
    expect(await (await get()).json()).toEqual({ state: 'none', id: G, name: 'Bua toi thu 6' })
  })
  it('an unknown group is 404', async () => {
    h.db.groups = []
    expect((await get()).status).toBe(404)
  })
})

describe('POST /api/group/[id]/join: opening the link files a REQUEST', () => {
  it('writes the person as pending, never as a member', async () => {
    h.user = { id: OUTSIDER }
    const res = await joinReq()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, pending: true })
    expect(h.db.group_members.find(r => r.user_id === OUTSIDER)).toMatchObject({ status: 'pending', name: 'Cuong' })
  })
  it('a second request, an accepted member or the creator change nothing and say so', async () => {
    h.user = { id: PENDING }
    expect(await (await joinReq()).json()).toMatchObject({ ok: true, pending: true, alreadyRequested: true })
    h.user = { id: MEMBER }
    expect(await (await joinReq()).json()).toMatchObject({ ok: true, alreadyJoined: true })
    h.user = { id: CREATOR }
    expect(await (await joinReq()).json()).toMatchObject({ ok: true, alreadyJoined: true })
    expect(h.db.group_members).toHaveLength(2)
  })
  it('a full group (10 accepted members) takes no new request; pending requests do not count toward the 10', async () => {
    for (let i = 0; i < 9; i++) h.db.group_members.push({ id: `x${i}`, group_id: G, user_id: `00000000-0000-4000-8000-0000000000${10 + i}`, name: `P${i}`, status: 'member', created_at: '2026-11-20T03:00:00Z' })
    h.user = { id: OUTSIDER }
    expect((await joinReq()).status).toBe(400)
    h.db.group_members = h.db.group_members.filter(r => r.id !== 'x0')
    expect((await joinReq()).status).toBe(200)
  })
  it('no account, no name or area, an unknown group: refused', async () => {
    h.user = null
    expect((await joinReq()).status).toBe(401)
    h.user = { id: OUTSIDER }
    expect((await joinReq({ name: '', area: '' })).status).toBe(400)
    h.db.groups = []
    expect((await joinReq()).status).toBe(404)
  })
})

describe('POST /api/group/[id]/members: the leader decides', () => {
  it('approve turns a pending request into a member', async () => {
    const res = await decideReq({ memberId: 'm2', action: 'approve' })
    expect(res.status).toBe(200)
    expect(h.db.group_members.find(r => r.id === 'm2')?.status).toBe('member')
  })
  it('decline deletes a pending request; remove deletes an accepted member; each only for its own state', async () => {
    expect((await decideReq({ memberId: 'm1', action: 'decline' })).status).toBe(400)
    expect((await decideReq({ memberId: 'm2', action: 'remove' })).status).toBe(400)
    expect((await decideReq({ memberId: 'm2', action: 'decline' })).status).toBe(200)
    expect((await decideReq({ memberId: 'm1', action: 'remove' })).status).toBe(200)
    expect(h.db.group_members).toEqual([])
  })
  it('only the creator decides: a member, a pending person or a stranger get 403 and change nothing', async () => {
    for (const uid of [MEMBER, PENDING, OUTSIDER]) {
      h.user = { id: uid }
      expect((await decideReq({ memberId: 'm2', action: 'approve' })).status, uid).toBe(403)
    }
    expect(h.db.group_members.find(r => r.id === 'm2')?.status).toBe('pending')
  })
  it('approving into a full group is refused; a member id of another group is 404; bad input is 400; the rate limit applies', async () => {
    for (let i = 0; i < 9; i++) h.db.group_members.push({ id: `x${i}`, group_id: G, user_id: `00000000-0000-4000-8000-0000000000${10 + i}`, name: `P${i}`, status: 'member', created_at: '2026-11-20T03:00:00Z' })
    expect((await decideReq({ memberId: 'm2', action: 'approve' })).status).toBe(400)
    h.db.group_members = h.db.group_members.filter(r => !String(r.id).startsWith('x'))
    expect((await decideReq({ memberId: 'zzz', action: 'approve' })).status).toBe(404)
    expect((await decideReq({ memberId: 'm2', action: 'explode' })).status).toBe(400)
    expect((await decideReq({})).status).toBe(400)
    h.denyRate = true
    expect((await decideReq({ memberId: 'm2', action: 'approve' })).status).toBe(429)
  })
})
