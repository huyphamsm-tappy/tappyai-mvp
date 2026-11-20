// Group dining: the vote and the decision (owner 20/11): one vote per person, changeable; a place is chosen as soon as MORE THAN HALF of the participants (the creator and the accepted members) vote
// for it; when everyone has voted and nobody has a majority, the leader chooses. A pending person or a stranger can not vote; nobody votes after the decision.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { FakeDb } from './fakeDb'

const h = vi.hoisted(() => ({ user: null as { id: string; is_anonymous?: boolean } | null, db: {} as Record<string, Array<Record<string, unknown>>>, denyRate: false }))
vi.mock('@/lib/auth/getRequestUser', async () => { const { fakeClient } = await import('./fakeDb'); return { getRequestUser: async () => ({ user: h.user, supabase: fakeClient(() => h.db as FakeDb) }) } })
vi.mock('@/lib/supabase/admin', async () => { const { fakeClient } = await import('./fakeDb'); return { createAdminClient: () => fakeClient(() => h.db as FakeDb) } })
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: !h.denyRate, retryAfter: 5, scope: 'instance' }) }))

import { POST as vote } from './[id]/vote/route'
import { POST as choose } from './[id]/choose/route'
import { GET } from './route'

const G = '5f0c3c0e-0000-4000-8000-000000000001'
const CREATOR = '11111111-1111-4111-8111-111111111111'
const LINH = '22222222-2222-4222-8222-222222222222'
const CUONG = '55555555-5555-4555-8555-555555555555'
const PENDING = '33333333-3333-4333-8333-333333333333'
const OUTSIDER = '44444444-4444-4444-8444-444444444444'

const voteReq = (optionId: unknown) => vote(new NextRequest(`http://t.test/api/group/${G}/vote`, { method: 'POST', body: JSON.stringify({ optionId }), headers: { 'content-type': 'application/json' } }), { params: { id: G } })
const chooseReq = (optionId: unknown) => choose(new NextRequest(`http://t.test/api/group/${G}/choose`, { method: 'POST', body: JSON.stringify({ optionId }), headers: { 'content-type': 'application/json' } }), { params: { id: G } })
const group = () => h.db.groups[0]

beforeEach(() => {
  h.denyRate = false
  h.user = { id: CREATOR }
  h.db = {
    groups: [{ id: G, name: 'Bua toi thu 6', creator_id: CREATOR, status: 'open', suggestion: 'x', created_at: '2026-11-20T00:00:00Z', avatar_url: null, chosen_option: null, decided_at: null,
      suggestion_options: [{ id: '1', name: 'Lau Be Man', why: 'a' }, { id: '2', name: 'Bun Bo', why: 'b' }, { id: '3', name: 'Com Chay', why: 'c' }] }],
    group_members: [
      { id: 'm1', group_id: G, user_id: LINH, name: 'Linh', status: 'member' },
      { id: 'm2', group_id: G, user_id: CUONG, name: 'Cuong', status: 'member' },
      { id: 'm3', group_id: G, user_id: PENDING, name: 'Bao', status: 'pending' },
    ],
    group_votes: [],
  }
})

describe('POST /api/group/[id]/vote', () => {
  it('records one vote; with 3 participants one vote is no majority yet', async () => {
    const res = await voteReq('1')
    expect(res.status).toBe(200)
    const b = await res.json()
    expect(b).toMatchObject({ ok: true, chosen: null, votes: { counts: { '1': 1, '2': 0, '3': 0 }, mine: '1', voted: 1, participants: 3 } })
    expect(group().chosen_option).toBeNull()
  })
  it('more than half (2 of 3) decides at once: the place is chosen and the time is written', async () => {
    await voteReq('1')
    h.user = { id: LINH }
    const b = await (await voteReq('1')).json()
    expect(b.chosen).toBe('1')
    expect(group().chosen_option).toBe('1')
    expect(typeof group().decided_at).toBe('string')
  })
  it('a person can change their vote before the decision, and still counts once', async () => {
    await voteReq('1')
    await voteReq('2')
    h.user = { id: LINH }
    const b = await (await voteReq('3')).json()
    expect(b.votes.counts).toEqual({ '1': 0, '2': 1, '3': 1 })
    expect(h.db.group_votes).toHaveLength(2)
    expect(b.chosen).toBeNull()
  })
  it('after the decision nobody votes (409)', async () => {
    await voteReq('1')
    h.user = { id: LINH }
    await voteReq('1')
    h.user = { id: CUONG }
    expect((await voteReq('2')).status).toBe(409)
    expect(h.db.group_votes).toHaveLength(2)
  })
  it('a pending person, a stranger and a visitor with no account can not vote', async () => {
    for (const uid of [PENDING, OUTSIDER]) { h.user = { id: uid }; expect((await voteReq('1')).status, uid).toBe(403) }
    h.user = null
    expect((await voteReq('1')).status).toBe(401)
    expect(h.db.group_votes).toEqual([])
  })
  it('an option that is not on the cards, bad input, a group with no cards, an unknown group and the rate limit are refused', async () => {
    expect((await voteReq('9')).status).toBe(400)
    expect((await voteReq(undefined)).status).toBe(400)
    expect((await voteReq(42)).status).toBe(400)
    group().suggestion_options = null
    expect((await voteReq('1')).status).toBe(400)
    h.db.groups = []
    expect((await voteReq('1')).status).toBe(404)
    h.denyRate = true
    expect((await voteReq('1')).status).toBe(429)
  })
})

describe('POST /api/group/[id]/choose: the leader decides only when everyone has voted and nobody has a majority', () => {
  const everyoneVoted = async () => {
    await voteReq('1'); h.user = { id: LINH }; await voteReq('2'); h.user = { id: CUONG }; await voteReq('3'); h.user = { id: CREATOR }
  }
  it('with a tie of three votes the leader chooses', async () => {
    await everyoneVoted()
    expect(group().chosen_option).toBeNull()
    const res = await chooseReq('2')
    expect(res.status).toBe(200)
    expect(group().chosen_option).toBe('2')
  })
  it('before everyone has voted, or when a majority exists, the leader can not override (409)', async () => {
    await voteReq('1')
    expect((await chooseReq('2')).status).toBe(409)
    h.user = { id: LINH }; await voteReq('1') // a majority: already decided
    h.user = { id: CREATOR }
    expect((await chooseReq('2')).status).toBe(409)
    expect(group().chosen_option).toBe('1')
  })
  it('only the leader chooses; a bad option is 400; no account is 401', async () => {
    await everyoneVoted()
    for (const uid of [LINH, PENDING, OUTSIDER]) { h.user = { id: uid }; expect((await chooseReq('2')).status, uid).toBe(403) }
    h.user = { id: CREATOR }
    expect((await chooseReq('9')).status).toBe(400)
    h.user = null
    expect((await chooseReq('2')).status).toBe(401)
    expect(group().chosen_option).toBeNull()
  })
})

describe('GET /api/group carries the cards, the votes and the decision for the people who may see them', () => {
  const get = () => GET(new NextRequest(`http://t.test/api/group?id=${G}`))
  it('a member sees the options, the counts, their own vote and the chosen place', async () => {
    h.user = { id: CREATOR }; await voteReq('1')
    h.user = { id: LINH }
    const b = await (await get()).json()
    expect(b.suggestion_options.map((o: { name: string }) => o.name)).toEqual(['Lau Be Man', 'Bun Bo', 'Com Chay'])
    expect(b.votes).toMatchObject({ counts: { '1': 1, '2': 0, '3': 0 }, mine: null, voted: 1, participants: 3 })
    expect(b.chosen_option).toBeNull()
    await voteReq('1')
    const after = await (await get()).json()
    expect(after.chosen_option).toBe('1')
    expect(after.votes.mine).toBe('1')
  })
  it('a pending person and a stranger see no cards and no votes', async () => {
    for (const uid of [PENDING, OUTSIDER]) {
      h.user = { id: uid }
      const b = await (await get()).json()
      expect(JSON.stringify(b)).not.toContain('Lau Be Man')
      expect(b.votes).toBeUndefined()
    }
  })
})
