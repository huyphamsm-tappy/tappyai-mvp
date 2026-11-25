// The bill of a group meal (owner 20/11): a participant who paid enters the total, the tip, personal items and who is left out; the others are shown what they owe the payer; the payer marks who paid back.
// People are named by opaque keys ('leader' and each member row id), never by account id.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { FakeDb } from './fakeDb'

const h = vi.hoisted(() => ({ user: null as { id: string; is_anonymous?: boolean } | null, db: {} as Record<string, Array<Record<string, unknown>>>, denyRate: false }))
vi.mock('@/lib/auth/getRequestUser', async () => { const { fakeClient } = await import('./fakeDb'); return { getRequestUser: async () => ({ user: h.user, supabase: fakeClient(() => h.db as FakeDb) }) } })
vi.mock('@/lib/supabase/admin', async () => { const { fakeClient } = await import('./fakeDb'); return { createAdminClient: () => fakeClient(() => h.db as FakeDb) } })
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: !h.denyRate, retryAfter: 5, scope: 'instance' }) }))

import { PUT, PATCH, DELETE } from './[id]/bill/route'
import { GET } from './route'

const G = '5f0c3c0e-0000-4000-8000-000000000001'
const CREATOR = '11111111-1111-4111-8111-111111111111'
const LINH = '22222222-2222-4222-8222-222222222222'
const CUONG = '55555555-5555-4555-8555-555555555555'
const PENDING = '33333333-3333-4333-8333-333333333333'
const OUTSIDER = '44444444-4444-4444-8444-444444444444'

const req = (method: string, body?: unknown) => new NextRequest(`http://t.test/api/group/${G}/bill`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) })
const put = (body: unknown) => PUT(req('PUT', body), { params: { id: G } })
const patch = (body: unknown) => PATCH(req('PATCH', body), { params: { id: G } })
const del = () => DELETE(req('DELETE'), { params: { id: G } })
const get = () => GET(new NextRequest(`http://t.test/api/group?id=${G}`))
const bill = () => h.db.group_bills[0]

beforeEach(() => {
  h.denyRate = false
  h.user = { id: LINH }
  h.db = {
    groups: [{ id: G, name: 'Bua toi thu 6', creator_id: CREATOR, status: 'open', suggestion: null, created_at: '2026-11-20T00:00:00Z', avatar_url: null }],
    profiles: [{ id: CREATOR, full_name: 'Huy Pham' }],
    group_members: [
      { id: 'm1', group_id: G, user_id: LINH, name: 'Linh', status: 'member', created_at: '2026-11-20T01:00:00Z' },
      { id: 'm2', group_id: G, user_id: CUONG, name: 'Cuong', status: 'member', created_at: '2026-11-20T02:00:00Z' },
      { id: 'm3', group_id: G, user_id: PENDING, name: 'Bao', status: 'pending', created_at: '2026-11-20T03:00:00Z' },
    ],
    group_bills: [],
    group_votes: [],
  }
})

describe('PUT /api/group/[id]/bill: a participant who paid enters the bill', () => {
  it('stores it with the caller as the payer, and the answer shows who owes the payer what (equal split, 3 people)', async () => {
    const res = await put({ totalVnd: 300_000, tipVnd: 0 })
    expect(res.status).toBe(200)
    expect(bill()).toMatchObject({ payer_id: LINH, total_vnd: 300_000, tip_vnd: 0 })
    const b = (await res.json()).bill
    expect(b.payerKey).toBe('m1')
    expect(b.payerName).toBe('Linh')
    expect(b.settlement.transfers).toEqual([{ fromId: 'leader', toId: 'm1', amountVnd: 100_000 }, { fromId: 'm2', toId: 'm1', amountVnd: 100_000 }])
    expect(JSON.stringify(b)).not.toContain(CREATOR)
    expect(JSON.stringify(b)).not.toContain(CUONG)
  })
  it('the leader can pay too, and is named from the profile', async () => {
    h.user = { id: CREATOR }
    const b = (await (await put({ totalVnd: 300_000 })).json()).bill
    expect(b.payerKey).toBe('leader')
    expect(b.payerName).toBe('Huy Pham')
  })
  it('personal items and people left out change the split; items are cleaned and clipped', async () => {
    const res = await put({ totalVnd: 400_000, tipVnd: 40_000, excluded: ['m2'], items: [{ name: `Bia ${'x'.repeat(100)}`, amountVnd: 40_000, forId: 'leader' }] })
    const b = (await res.json()).bill
    // 440k bill - 40k personal = 400k shared by 2 (the leader and Linh) = 200k each; the leader owes 200k + 40k
    expect(b.settlement.sharedVnd).toBe(400_000)
    expect(b.settlement.transfers).toEqual([{ fromId: 'leader', toId: 'm1', amountVnd: 240_000 }])
    expect((bill().items as Array<{ name: string }>)[0].name.length).toBeLessThanOrEqual(40)
  })
  it('editing replaces the numbers and clears who has paid (the amounts changed)', async () => {
    await put({ totalVnd: 300_000 })
    await patch({ memberKey: 'm2', paid: true })
    expect((bill().paid as Record<string, boolean>).m2).toBe(true)
    await put({ totalVnd: 450_000 })
    expect(h.db.group_bills).toHaveLength(1)
    expect(bill().total_vnd).toBe(450_000)
    expect(bill().paid).toEqual({})
  })
  it('only the payer edits the bill; another participant gets 403', async () => {
    await put({ totalVnd: 300_000 })
    h.user = { id: CUONG }
    expect((await put({ totalVnd: 1 })).status).toBe(403)
    expect(bill().total_vnd).toBe(300_000)
  })
  it('a pending person, a stranger and a visitor can not enter a bill', async () => {
    for (const uid of [PENDING, OUTSIDER]) { h.user = { id: uid }; expect((await put({ totalVnd: 1000 })).status, uid).toBe(403) }
    h.user = null
    expect((await put({ totalVnd: 1000 })).status).toBe(401)
    expect(h.db.group_bills).toEqual([])
  })
  it('bad money, unknown people, too many items and the rate limit are refused with a code', async () => {
    expect((await put({ totalVnd: 0 })).status).toBe(400)
    expect((await put({ totalVnd: 'abc' })).status).toBe(400)
    expect((await put({ totalVnd: 1000, items: [{ name: 'x', amountVnd: 5000, forId: 'm2' }] })).status).toBe(400) // more than the bill
    expect((await put({ totalVnd: 1000, excluded: ['nobody'] })).status).toBe(400)
    expect((await put({ totalVnd: 1000, items: Array.from({ length: 21 }, () => ({ name: 'x', amountVnd: 1, forId: 'm2' })) })).status).toBe(400)
    expect((await put({ totalVnd: 1000, excluded: ['leader', 'm1', 'm2'] })).status).toBe(400) // nobody shares
    expect(h.db.group_bills).toEqual([])
    h.denyRate = true
    expect((await put({ totalVnd: 1000 })).status).toBe(429)
  })
})

describe('PATCH /api/group/[id]/bill: the payer marks who paid back', () => {
  it('marks and unmarks a person; not the payer themselves, not an unknown key', async () => {
    await put({ totalVnd: 300_000 })
    expect((await patch({ memberKey: 'm2', paid: true })).status).toBe(200)
    expect(bill().paid).toEqual({ m2: true })
    expect((await patch({ memberKey: 'm2', paid: false })).status).toBe(200)
    expect(bill().paid).toEqual({})
    expect((await patch({ memberKey: 'm1', paid: true })).status).toBe(400)
    expect((await patch({ memberKey: 'zzz', paid: true })).status).toBe(400)
    expect((await patch({ memberKey: 'm2' })).status).toBe(400)
  })
  it('only the payer, and only when there is a bill', async () => {
    expect((await patch({ memberKey: 'm2', paid: true })).status).toBe(404)
    await put({ totalVnd: 300_000 })
    h.user = { id: CUONG }
    expect((await patch({ memberKey: 'leader', paid: true })).status).toBe(403)
  })
})

describe('DELETE /api/group/[id]/bill', () => {
  it('the payer or the leader removes it; another member can not', async () => {
    await put({ totalVnd: 300_000 })
    h.user = { id: CUONG }
    expect((await del()).status).toBe(403)
    h.user = { id: CREATOR }
    expect((await del()).status).toBe(200)
    expect(h.db.group_bills).toEqual([])
    await put({ totalVnd: 1000 }) // the leader enters one
    h.user = { id: CREATOR }
    expect((await del()).status).toBe(200)
  })
})

describe('GET /api/group carries the bill for the people of the group, and no one else', () => {
  it('a member sees the bill, the settlement and who paid; a pending person and a stranger see no bill', async () => {
    await put({ totalVnd: 300_000 })
    await patch({ memberKey: 'm2', paid: true })
    h.user = { id: CUONG }
    const b = (await (await get()).json()).bill
    expect(b).toMatchObject({ payerKey: 'm1', totalVnd: 300_000, paid: { m2: true }, isPayer: false })
    expect(b.people.map((p: { key: string }) => p.key)).toEqual(['leader', 'm1', 'm2'])
    expect(b.myKey).toBe('m2')
    for (const uid of [PENDING, OUTSIDER]) {
      h.user = { id: uid }
      expect(JSON.stringify(await (await get()).json())).not.toContain('settlement')
    }
  })
})
