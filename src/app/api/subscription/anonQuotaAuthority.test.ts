/**
 * The anonymous chat quota has ONE authority. These tests prove it cannot be confused with a
 * second one.
 *
 * ============================================================================
 * THE DEFECT CLASS
 * ============================================================================
 * A quota that is DISPLAYED by one mechanism and ENFORCED by another will disagree, and the user
 * is the last to find out. This product has had both halves of that bug:
 *
 *   • the LIMIT half (C48): `/api/subscription` reported FREE_DAILY_LIMIT (15) to anonymous
 *     guests whose enforced ceiling is ANON_DAILY_LIMIT (5). Measured live: the paywall said
 *     "13 remaining" while `/api/chat` answered 401 anon_limit_reached.
 *
 *   • the COUNT half: the limit was fixed but the count still came from `conversations` (turns
 *     that landed) while enforcement came from `anon_chat_usage_increment` (attempts). Same
 *     symptom, one layer down.
 *
 * Both halves now read from the enforcing source. What follows holds that, and holds the third
 * thing that makes "authoritative with a fallback" honest: that the fallback cannot hand out a
 * second allowance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { FREE_DAILY_LIMIT, ANON_DAILY_LIMIT } from '@/lib/config/product'

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: true } as Record<string, unknown> | null,
    sub: null as Record<string, unknown> | null,
    rpcResult: { data: 0 as number | null, error: null as { code?: string; message: string } | null },
    /** Every RPC name the route called. */
    rpcCalls: [] as string[],
    /** Every table the route read. */
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
    rpc: (name: string) => {
      state.rpcCalls.push(name)
      return Promise.resolve(state.rpcResult)
    },
  }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))

import { GET } from './route'

const get = async () => {
  const req = { nextUrl: new URL('http://localhost/api/subscription'), headers: new Headers() }
  const res = await GET(req as any)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = { id: 'u1', is_anonymous: true }
  h.state.sub = null
  h.state.rpcResult = { data: 0, error: null }
  h.state.rpcCalls = []
  h.state.tables = []
})

describe('an anonymous guest is told the quota that is enforced on them', () => {
  it('the limit is the anonymous one, not the registered one', () => {
    // Guarding the constants themselves: if they ever became equal, every assertion below would
    // pass while proving nothing about which branch ran.
    expect(ANON_DAILY_LIMIT).toBeLessThan(FREE_DAILY_LIMIT)
  })

  it('reports ANON_DAILY_LIMIT for an anonymous session', async () => {
    const { body } = await get()
    expect(body.freeDailyLimit).toBe(ANON_DAILY_LIMIT)
    expect(body.isAnonymous).toBe(true)
  })

  it('reports FREE_DAILY_LIMIT for a registered one', async () => {
    h.state.user = { id: 'u1', is_anonymous: false }
    const { body } = await get()
    expect(body.freeDailyLimit).toBe(FREE_DAILY_LIMIT)
    expect(body.isAnonymous).toBe(false)
  })

  it('🚨 the COUNT comes from the enforcing counter, not from conversations', async () => {
    h.state.rpcResult = { data: 4, error: null }
    const { body } = await get()
    expect(h.state.rpcCalls, 'the enforcing counter was never consulted')
      .toContain('anon_chat_usage_today')
    expect(h.state.tables, 'an anonymous guest must not be counted from `conversations`')
      .not.toContain('conversations')
    expect(body.todayMessageCount).toBe(4)
    expect(body.remaining).toBe(ANON_DAILY_LIMIT - 4)
  })

  it('a registered user is still counted from conversations, not from the anon RPC', async () => {
    h.state.user = { id: 'u1', is_anonymous: false }
    await get()
    expect(h.state.rpcCalls).not.toContain('anon_chat_usage_today')
  })

  it('at the cap, remaining is 0 — never negative', async () => {
    h.state.rpcResult = { data: ANON_DAILY_LIMIT + 3, error: null }
    const { body } = await get()
    expect(body.remaining).toBe(0)
  })
})

describe('a BROKEN authority fails CLOSED', () => {
  it('an erroring counter reports "none left", not "plenty left"', async () => {
    // A guest wrongly told they have none can sign in — which is what the paywall wants anyway.
    // A guest wrongly told they have plenty is refused mid-sentence with no explanation.
    h.state.rpcResult = { data: null, error: { message: 'connection reset' } }
    const { body } = await get()
    expect(body.todayMessageCount).toBe(ANON_DAILY_LIMIT)
    expect(body.remaining).toBe(0)
  })

  it('🚨 it does not fall back to the conversations count', async () => {
    // Falling back to the other counter IS the divergence. Reinstating it as a general error path
    // reinstates the bug for exactly the requests where the authority was unavailable.
    h.state.rpcResult = { data: null, error: { message: 'boom' } }
    await get()
    expect(h.state.tables).not.toContain('conversations')
  })
})

describe('a NOT-YET-DEPLOYED authority degrades instead of lying', () => {
  /**
   * The deploy window: code ahead of schema. `/api/chat` degrades identically — when the RPC is
   * unavailable it enforces with the legacy cookie cap — so during that window the legacy count
   * is no more divergent than it was the day before.
   *
   * 🚨 Failing closed HERE would tell every anonymous guest they had nothing left for as long as
   * the code was ahead of the migration, turning a deploy-ordering detail into a product outage.
   */
  it('PGRST202 falls back to the legacy count rather than reporting zero remaining', async () => {
    h.state.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
    const { body } = await get()
    expect(h.state.tables, 'the legacy count was not used').toContain('conversations')
    expect(body.remaining, 'a guest was told they had nothing left during the deploy window')
      .toBe(ANON_DAILY_LIMIT)
  })

  it('the two failure modes are told apart by CODE, not by a message substring', async () => {
    // A reworded server error must not silently reclassify a broken authority as "not deployed",
    // which would fail open on exactly the requests that need to fail closed.
    const src = readFileSync('src/app/api/subscription/route.ts', 'utf8')
    expect(src).toContain("error.code === 'PGRST202'")
  })

  it('a transient error is NOT treated as "not deployed"', async () => {
    h.state.rpcResult = { data: null, error: { code: '57014', message: 'statement timeout' } }
    const { body } = await get()
    expect(body.remaining).toBe(0)
  })
})

describe('the cookie fallback cannot hand out a second allowance', () => {
  const chat = readFileSync('src/app/api/chat/route.ts', 'utf8')

  it('a successful RPC mirrors its count into the cookie', () => {
    // The two counters were INDEPENDENT: a guest who used all five through the RPC and then met
    // one transient RPC failure found a cookie counter that had never been written, and started
    // again at zero.
    expect(chat).toMatch(/anonTokenCount = usedToday/)
    expect(chat).toMatch(/if \(anonTokenCount !== null\) \{[\s\S]{0,400}tappy_anon=\$\{vnToday\(\)\}:\$\{anonTokenCount\}/)
  })

  it('the cookie is not read while the RPC is answering', () => {
    // Precedence, stated in code: the row is the authority and the cookie is only consulted when
    // the authority did not answer.
    expect(chat).toMatch(/else if \(!authedUserId && !anonQuotaByToken\)/)
  })

  it('both paths quote the same limit constant', () => {
    const refusals = [...chat.matchAll(/anon_limit_reached/g)]
    expect(refusals.length, 'expected both the RPC and the cookie refusal').toBeGreaterThanOrEqual(2)
    // Neither path may hardcode a number.
    expect(chat).not.toMatch(/usedToday > 5\b/)
    expect(chat).not.toMatch(/anonCount >= 5\b/)
  })
})

describe('the two enforcement paths admit the SAME number of messages', () => {
  /**
   * The paths compare differently and both are correct — which is exactly why this needs a test
   * rather than a reading.
   *
   *   RPC:    increment first, then refuse when `newCount > LIMIT`   (post-count, strict)
   *   cookie: refuse when `countSoFar >= LIMIT`, then increment      (pre-count, inclusive)
   *
   * Swap either operator and the two paths differ by one, so a guest gets four messages or six
   * depending on which counter happened to be in play. Simulated rather than asserted on the
   * source, because it is the ARITHMETIC that has to agree.
   */
  function allowedViaRpc(limit: number): number {
    let stored = 0
    let allowed = 0
    for (let i = 0; i < limit + 5; i++) {
      const newCount = ++stored          // anon_chat_usage_increment()
      if (newCount > limit) break        // route: `if (usedToday > ANON_DAILY_LIMIT)`
      allowed++
    }
    return allowed
  }

  function allowedViaCookie(limit: number): number {
    let stored = 0
    let allowed = 0
    for (let i = 0; i < limit + 5; i++) {
      if (stored >= limit) break         // route: `if (anonCount >= ANON_DAILY_LIMIT)`
      allowed++
      stored = stored + 1
    }
    return allowed
  }

  it('🚨 the route implements the comparisons this simulates', () => {
    // Without this, the simulation proves two ALGORITHMS agree and says nothing about the code.
    // A mutation demonstrated exactly that: loosening the RPC comparison to
    // `usedToday > ANON_DAILY_LIMIT + 1` — six messages instead of five — left every test above
    // green. The model is only evidence once it is pinned to the source it models.
    const chat = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(chat, 'the RPC path no longer compares post-count strictly')
      .toMatch(/if \(usedToday > ANON_DAILY_LIMIT\)/)
    expect(chat, 'the cookie path no longer compares pre-count inclusively')
      .toMatch(/if \(anonCount >= ANON_DAILY_LIMIT\)/)
  })

  it('both allow exactly ANON_DAILY_LIMIT messages', () => {
    expect(allowedViaRpc(ANON_DAILY_LIMIT)).toBe(ANON_DAILY_LIMIT)
    expect(allowedViaCookie(ANON_DAILY_LIMIT)).toBe(ANON_DAILY_LIMIT)
  })

  it('they agree at every limit, not just the configured one', () => {
    for (const limit of [1, 2, 5, 10, 15]) {
      expect(allowedViaRpc(limit), `limit ${limit}`).toBe(allowedViaCookie(limit))
    }
  })
})
