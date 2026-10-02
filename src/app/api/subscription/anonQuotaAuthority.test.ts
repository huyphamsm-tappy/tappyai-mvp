import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { FREE_DAILY_LIMIT, ANON_LIFETIME_LIMIT } from '@/lib/config/product'

// ── /api/subscription reports the quota that is actually enforced ─────────
//
// History: C48 fixed the LIMIT half (the paywall quoted the registered 15 to guests capped at 5),
// and a follow-up fixed the COUNT half (display counted `conversations` rows while enforcement
// counted RPC attempts). Both were symptoms of TWO authorities.
//
// Since 2026-09-15 there is ONE: `lib/ai/quota/aiQuestionQuota.ts`, the shared AI question pool
// that /api/chat and /api/scam-shield/analyze SPEND from. This route reads it without spending.
// The contract it must report:
//
//   anonymous  → ANON_LIFETIME_LIMIT (5), period 'lifetime' — five, once
//   registered → FREE_DAILY_LIMIT (15), period 'day'
//   Pro        → exempt; nothing used
//
// and, when the store cannot say how much was used, it reports the limit as USED (fail closed).

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: true } as Record<string, unknown> | null,
    sub: null as Record<string, unknown> | null,
    peek: { limit: 5, period: 'lifetime', used: 0, remaining: 5 } as Record<string, unknown>,
    peekCalls: [] as unknown[],
    rpcCalls: [] as string[],
    tables: [] as string[],
  }
  const builder = (): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      gte: () => b,
      single: () => Promise.resolve({ data: state.sub, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
    }
    return b
  }
  const client = {
    from: (table: string) => { state.tables.push(table); return builder() },
    rpc: (name: string) => { state.rpcCalls.push(name); return Promise.resolve({ data: 0, error: null }) },
  }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/ai/quota/aiQuestionQuota', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/quota/aiQuestionQuota')>()
  return {
    ...actual,
    peekAiQuestionQuota: async (identity: unknown) => { h.state.peekCalls.push(identity); return h.state.peek },
  }
})

import { GET } from './route'

const get = async () => {
  const req = { nextUrl: new URL('http://localhost/api/subscription'), headers: new Headers({ 'x-forwarded-for': '203.0.113.9' }) }
  const res = await GET(req as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = { id: 'u1', is_anonymous: true }
  h.state.sub = null
  h.state.peek = { limit: ANON_LIFETIME_LIMIT, period: 'lifetime', used: 0, remaining: ANON_LIFETIME_LIMIT }
  h.state.peekCalls = []
  h.state.rpcCalls = []
  h.state.tables = []
})

describe('the limit reported is the one enforced — from the ONE authority', () => {
  it('an anonymous session gets the LIFETIME allowance, not the registered daily one', async () => {
    const { body } = await get()
    expect(body.freeDailyLimit).toBe(ANON_LIFETIME_LIMIT)
    expect(body.quotaPeriod).toBe('lifetime')
    expect(body.isAnonymous).toBe(true)
    expect(h.state.peekCalls[0]).toEqual({ kind: 'anon', id: 'u1' })
    expect(ANON_LIFETIME_LIMIT).toBeLessThan(FREE_DAILY_LIMIT)
  })

  it('a registered account gets the daily allowance, keyed by the account', async () => {
    h.state.user = { id: 'u1', is_anonymous: false }
    h.state.peek = { limit: FREE_DAILY_LIMIT, period: 'day', used: 11, remaining: 4 }
    const { body } = await get()
    expect(body).toMatchObject({ freeDailyLimit: FREE_DAILY_LIMIT, quotaPeriod: 'day', todayMessageCount: 11, remaining: 4, isAnonymous: false })
    expect(h.state.peekCalls[0]).toEqual({ kind: 'user', id: 'u1' })
  })

  it('🚨 the COUNT comes from the shared quota, never from conversations rows or the old anon RPC', async () => {
    h.state.peek = { limit: 5, period: 'lifetime', used: 4, remaining: 1 }
    const { body } = await get()
    expect(body.remaining).toBe(1)
    expect(body.todayMessageCount).toBe(4)
    expect(h.state.tables).not.toContain('conversations')
    expect(h.state.rpcCalls).toEqual([])
  })

  it('at the cap, remaining is 0 — never negative', async () => {
    h.state.peek = { limit: 5, period: 'lifetime', used: 5, remaining: 0 }
    expect((await get()).body.remaining).toBe(0)
  })

  it('a Pro account is exempt: nothing used, everything remaining', async () => {
    h.state.user = { id: 'u1', is_anonymous: false }
    h.state.sub = { status: 'active', current_period_end: new Date(Date.now() + 86_400_000).toISOString() }
    h.state.peek = { limit: FREE_DAILY_LIMIT, period: 'day', used: 9, remaining: 6 }
    const { body } = await get()
    expect(body.isPro).toBe(true)
    expect(body.todayMessageCount).toBe(0)
    expect(body.remaining).toBe(FREE_DAILY_LIMIT)
  })
})

describe('a store that cannot report FAILS CLOSED', () => {
  it('an unknown count is shown as the limit used, not as plenty left', async () => {
    h.state.peek = { limit: 5, period: 'lifetime', used: null, remaining: null }
    const { body } = await get()
    expect(body.todayMessageCount).toBe(ANON_LIFETIME_LIMIT)
    expect(body.remaining).toBe(0)
  })
})

describe('no second authority survives in the routes', () => {
  const chat = readFileSync('src/app/api/chat/route.ts', 'utf8')
  const sub = readFileSync('src/app/api/subscription/route.ts', 'utf8')
  const page = readFileSync('src/app/(app)/subscription/page.tsx', 'utf8')

  it('/api/chat spends from the shared quota and no longer runs the per-day RPC or the cookie counter', () => {
    expect(chat).toContain("from '@/lib/ai/quota/aiQuestionQuota'")
    expect(chat).not.toContain('anon_chat_usage_increment')
    expect(chat).not.toContain('tappy_anon=')
    expect(chat).not.toContain('countTodayUserMessages')
    expect(chat).not.toContain('ANON_DAILY_LIMIT')
  })

  it('/api/chat quotes the lifetime constant to a refused guest and keeps its machine codes', () => {
    expect(chat).toContain("error: 'anon_limit_reached'")
    expect(chat).toContain("error: 'free_limit_reached'")
    expect(chat).toContain('n: ANON_LIFETIME_LIMIT')
    expect(chat).not.toMatch(/n: 5\b/)
  })

  it('the display surfaces read the same module', () => {
    for (const src of [sub, page]) {
      expect(src).toContain('peekAiQuestionQuota')
      expect(src).not.toContain('countTodayUserMessages')
      expect(src).not.toContain('anon_chat_usage_today')
    }
  })
})
