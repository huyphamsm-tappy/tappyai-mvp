import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ deny: false, user: 'real' as 'real' | 'none' | 'anon', verdict: null as boolean[] | null | 'throw', seen: [] as Array<{ answer: string; cards: Array<{ name: string; summary: string }> }> }))

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: vi.fn(async () => ({ user: h.user === 'none' ? null : { id: 'u1', is_anonymous: h.user === 'anon' } })) }))
vi.mock('@/lib/auth/socialWriteAccess', () => ({
  refuseAnonymousSocialWrite: vi.fn((_req: unknown, u: { is_anonymous?: boolean }) => (u.is_anonymous ? new Response(JSON.stringify({ error: 'anonymous' }), { status: 403 }) : null)),
}))
vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: vi.fn(async () => ({ ok: !h.deny, retryAfter: 9, scope: 'instance', ...(h.deny ? { reason: 'limit_exceeded' } : {}) })),
}))
vi.mock('@/lib/ai/answerV4/docMedia', () => ({
  confirmSenseWithModel: vi.fn(async (answer: string, cards: Array<{ name: string; summary: string }>) => {
    h.seen.push({ answer, cards })
    if (h.verdict === 'throw') throw new Error('model down')
    return h.verdict ?? cards.map(() => true)
  }),
}))

import { POST } from './route'

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/entity-profile/sense', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'x-vercel-forwarded-for': '203.0.113.9' } }))
const card = (name: string) => ({ name, summary: `${name} là một xã.` })

beforeEach(() => { h.deny = false; h.user = 'real'; h.verdict = null; h.seen = [] })

describe('who may ask', () => {
  it('a visitor and an anonymous account get no verdict and no model call', async () => {
    h.user = 'none'
    expect((await post({ answer: 'x', cards: [card('A')] })).status).toBe(401)
    h.user = 'anon'
    expect((await post({ answer: 'x', cards: [card('A')] })).status).toBe(403)
    expect(h.seen).toHaveLength(0)
  })
})

describe('POST /api/entity-profile/sense', () => {
  it('returns the model verdict per card, in order', async () => {
    h.verdict = [true, false]
    const res = await post({ answer: 'Chọn công ty **Bình Minh**.', cards: [card('Elon Musk'), card('Bình Minh')] })
    expect(await res.json()).toEqual({ same: [true, false] })
    expect(h.seen[0].cards.map(c => c.name)).toEqual(['Elon Musk', 'Bình Minh'])
  })
  it('a failing model, a wrong-length answer, bad JSON, an oversized body: no chip is vouched for', async () => {
    h.verdict = 'throw'
    expect(await (await post({ answer: 'x', cards: [card('A')] })).json()).toEqual({ same: [false] })
    h.verdict = [true]
    expect(await (await post({ answer: 'x', cards: [card('A'), card('B')] })).json()).toEqual({ same: [false, false] })
    expect((await post('not json')).status).toBe(400)
    expect((await post(JSON.stringify({ answer: 'x'.repeat(9000), cards: [] }))).status).toBe(413)
  })
  it('bounded input: at most 6 cards, answer and summaries clipped, control characters removed; nothing to judge means no model call', async () => {
    await post({ answer: 'a'.repeat(3000), cards: Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, summary: `${'s'.repeat(400)}\u0000` })) })
    expect(h.seen[0].cards).toHaveLength(6)
    expect(h.seen[0].answer.length).toBe(1500)
    expect(h.seen[0].cards[0].summary.length).toBeLessThanOrEqual(300)
    expect(h.seen[0].cards[0].summary).not.toContain('\u0000')
    h.seen = []
    expect(await (await post({ answer: '', cards: [card('A')] })).json()).toEqual({ same: [false] })
    expect(await (await post({ answer: 'x', cards: [] })).json()).toEqual({ same: [] })
    expect(h.seen).toHaveLength(0)
  })
  it('the rate limit answers 429 and the model is not called', async () => {
    h.deny = true
    const res = await post({ answer: 'x', cards: [card('A')] })
    expect(res.status).toBe(429)
    expect(h.seen).toHaveLength(0)
  })
})
