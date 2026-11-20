// POST /api/group/[id]/suggest as THREE CARDS of REAL places (owner 20/11): places are searched for the group's area and tastes; the model only chooses among them; a new suggestion clears the old vote.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { FakeDb } from './fakeDb'

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  db: {} as Record<string, Array<Record<string, unknown>>>,
  rows: [] as Array<Record<string, unknown>>,
  searchThrows: false,
  searchArgs: [] as unknown[][],
  answers: [] as string[],
  prompts: [] as string[],
}))
vi.mock('@/lib/auth/getRequestUser', async () => { const { fakeClient } = await import('./fakeDb'); return { getRequestUser: async () => ({ user: h.user, supabase: fakeClient(() => h.db as FakeDb) }) } })
vi.mock('@/lib/supabase/admin', async () => { const { fakeClient } = await import('./fakeDb'); return { createAdminClient: () => fakeClient(() => h.db as FakeDb) } })
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: true, retryAfter: 1, scope: 'instance' }) }))
vi.mock('@/lib/ai/consent/aiDataConsent', () => ({ loadAllowedUserIds: async (_a: unknown, ids: string[]) => new Set(ids) }))
vi.mock('@/lib/ai/tools/food', () => ({ searchPlaces: async (...a: unknown[]) => { h.searchArgs.push(a); if (h.searchThrows) throw new Error('search down'); return { results: h.rows } } }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: async (o: { prompt: string }) => { h.prompts.push(o.prompt); return { text: h.answers.shift() ?? 'Goi y ' } } } }))

import { POST } from './[id]/suggest/route'

const G = '5f0c3c0e-0000-4000-8000-000000000001'
const CREATOR = '11111111-1111-4111-8111-111111111111'
const LINH = '22222222-2222-4222-8222-222222222222'
const BAO = '33333333-3333-4333-8333-333333333333'
const PENDING = '44444444-4444-4444-8444-444444444444'

const call = () => POST(new NextRequest(`http://t.test/api/group/${G}/suggest`, { method: 'POST' }), { params: { id: G } })
const group = () => h.db.groups[0]

beforeEach(() => {
  h.user = { id: CREATOR }
  h.searchThrows = false
  h.searchArgs = []
  h.prompts = []
  h.answers = []
  h.rows = [
    { name: 'Lau Be Man', address: '1 Le Loi, Quan 1', rating: 4.6, maps_link: 'https://www.google.com/maps?q=1' },
    { name: 'Bun Bo 3 Thang', address: '2 Nguyen Hue, Quan 1', rating: 4.2 },
    { name: 'Com Chay Hoa Sen', address: '3 Pasteur, Quan 3', rating: 4.8 },
    { name: 'Pizza 4P', address: '4 Dong Khoi, Quan 1', rating: 4.9 },
  ]
  h.db = {
    groups: [{ id: G, name: 'Bua toi thu 6', creator_id: CREATOR, suggestion: 'cu', suggestion_options: [{ id: '1', name: 'Cu' }], chosen_option: '1', decided_at: '2026-11-20T00:00:00Z' }],
    group_members: [
      { id: 'm1', group_id: G, user_id: LINH, name: 'Linh', budget: '100–200k', food_preferences: 'lau, bun bo', dietary_restrictions: 'khong hai san', area: 'Quan 1', status: 'member', created_at: '2026-11-20T01:00:00Z' },
      { id: 'm2', group_id: G, user_id: BAO, name: 'Bao', budget: 'Dưới 100k', food_preferences: 'bun bo', dietary_restrictions: '', area: 'Quan 1', status: 'member', created_at: '2026-11-20T02:00:00Z' },
      { id: 'm3', group_id: G, user_id: PENDING, name: 'NguoiChoDuyet', budget: 'x', food_preferences: 'sushi', dietary_restrictions: 'bi mat', area: 'Quan 9', status: 'pending', created_at: '2026-11-20T03:00:00Z' },
    ],
    group_votes: [{ id: 'v1', group_id: G, user_id: LINH, option_id: '1' }],
  }
})

describe('suggest: three cards of real places', () => {
  it('searches for the group area and tastes, lets the model choose among the places found, and saves the cards and a text version', async () => {
    h.answers = ['[{"n":1,"why":"Co lau, gan Quan 1"},{"n":2,"why":"Bun bo hop ngan sach"},{"n":3,"why":"Co mon chay"}]']
    const res = await call()
    expect(res.status).toBe(200)
    expect(h.searchArgs[0].slice(0, 3)).toEqual(['lau bun bo', 'Quan 1', 'restaurant'])
    const cards = group().suggestion_options as Array<Record<string, unknown>>
    expect(cards.map(c => c.name)).toEqual(['Lau Be Man', 'Bun Bo 3 Thang', 'Com Chay Hoa Sen'])
    expect(cards.map(c => c.id)).toEqual(['1', '2', '3'])
    expect(cards[0]).toMatchObject({ address: '1 Le Loi, Quan 1', why: 'Co lau, gan Quan 1', maps_link: 'https://www.google.com/maps?q=1' })
    expect(String(group().suggestion)).toContain('Lau Be Man')
    const body = await res.json()
    expect(body.options).toHaveLength(3)
    expect(body.suggestion).toBe(group().suggestion)
  })
  it('the model never adds a place: a number that is not in the list is ignored, and a garbled answer falls back to the best rated places', async () => {
    h.answers = ['[{"n":99,"why":"Quan ma"}]']
    await call()
    const cards = group().suggestion_options as Array<Record<string, unknown>>
    expect(cards.map(c => c.name)).toEqual(['Pizza 4P', 'Com Chay Hoa Sen', 'Lau Be Man'])
    expect(cards.some(c => c.name === 'Quan ma')).toBe(false)
    h.answers = ['khong phai json']
    await call()
    expect((group().suggestion_options as Array<Record<string, unknown>>).map(c => c.name)).toEqual(['Pizza 4P', 'Com Chay Hoa Sen', 'Lau Be Man'])
  })
  it('a new suggestion clears the old decision and the old votes', async () => {
    h.answers = ['[{"n":1,"why":"a"}]']
    await call()
    expect(group().chosen_option).toBeNull()
    expect(group().decided_at).toBeNull()
    expect(h.db.group_votes).toEqual([])
  })
  it('only ACCEPTED members are described to the model: a pending request never reaches it', async () => {
    h.answers = ['[{"n":1,"why":"a"}]']
    await call()
    const all = h.prompts.join('\n')
    expect(all).toContain('Linh')
    expect(all).not.toContain('NguoiChoDuyet')
    expect(all).not.toContain('sushi')
  })
})

describe('suggest: no places found', () => {
  it('no rows, or a failing search: the old text suggestion is written instead, with no cards, and the old vote is still cleared', async () => {
    h.rows = []
    h.answers = ['Goi y bang van ban']
    const res = await call()
    expect(res.status).toBe(200)
    expect(group().suggestion).toBe('Goi y bang van ban')
    expect(group().suggestion_options).toBeNull()
    h.searchThrows = true
    h.answers = ['Van ban khac']
    expect((await call()).status).toBe(200)
    expect(group().suggestion).toBe('Van ban khac')
  })
})

describe('suggest: who may ask', () => {
  it('only the creator (403), an account is needed (401), a group with no accepted member is 400', async () => {
    h.user = { id: LINH }
    expect((await call()).status).toBe(403)
    h.user = null
    expect((await call()).status).toBe(401)
    h.user = { id: CREATOR }
    h.db.group_members = h.db.group_members.filter(m => m.status !== 'member')
    expect((await call()).status).toBe(400)
  })
})
