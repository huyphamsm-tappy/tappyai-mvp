import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Security audit 2026-09-30 · /api/viet-content has a DAILY ceiling ─────────────────────────
//
// Unauthenticated, 'smart' model, 900 output tokens. The per-minute burst cap alone admitted
// 14,400 generations per IP per day. No model is called here: AI.generate is a stub that counts.

const h = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    generate: async () => { h.calls++; return { text: '{"caption":"Xin chào","hashtags":"#tappy"}' } },
  },
}))

import { POST } from './route'

const call = (ip: string) => POST(new Request('http://localhost/api/viet-content', {
  method: 'POST',
  headers: { 'x-vercel-forwarded-for': ip, 'content-type': 'application/json' },
  body: JSON.stringify({ topic: 'quán cà phê mới mở', platform: 'facebook' }),
}))

beforeEach(() => {
  h.calls = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T03:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('POST /api/viet-content — daily ceiling per IP', () => {
  it('🚨 admits 30 generations in a VN day, then refuses without calling the model', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 32; i++) {
      // Stay under the 10/min burst cap: this test is about the DAY, not the minute.
      if (i > 0 && i % 9 === 0) vi.setSystemTime(Date.now() + 61_000)
      statuses.push((await call('203.0.113.7')).status)
    }
    expect(statuses.slice(0, 30).every(s => s === 200)).toBe(true)
    expect(statuses.slice(30)).toEqual([429, 429])
    expect(h.calls).toBe(30)
  })

  it('another client IP keeps its own allowance', async () => {
    for (let i = 0; i < 30; i++) {
      if (i > 0 && i % 9 === 0) vi.setSystemTime(Date.now() + 61_000)
      await call('203.0.113.8')
    }
    expect((await call('198.51.100.9')).status).toBe(200)
  })
})
