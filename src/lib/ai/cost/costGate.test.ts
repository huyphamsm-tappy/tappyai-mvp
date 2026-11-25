import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  costGateOn, dailyCapMicros, reserveMicros, reserveTurnCost, dayCostMicros, toMicros, DEFAULT_DAILY_CAP_USD, TURN_RESERVE_USD,
} from './costGate'
import { __resetKvCounters } from '@/lib/security/kvCounter'

// No Upstash credentials in these envs: the counter runs in the process, exactly the path the preview builds use.
const ENV = {} as Record<string, string | undefined>
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

beforeEach(() => { __resetKvCounters(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('the flag', () => {
  it('is off by default and on only for the exact value "1"', () => {
    expect(costGateOn({})).toBe(false)
    expect(costGateOn({ AI_COST_GATE: 'true' })).toBe(false)
    expect(costGateOn({ AI_COST_GATE: '1' })).toBe(true)
  })
  it('is locked off in a production runtime until the owner lists it in CONSULT_PRODUCTION_ALLOW', () => {
    expect(costGateOn({ AI_COST_GATE: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(costGateOn({ AI_COST_GATE: '1', NODE_ENV: 'production' })).toBe(false)
    expect(costGateOn({ AI_COST_GATE: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'AI_COST_GATE' })).toBe(true)
    expect(costGateOn({ AI_COST_GATE: '1', VERCEL_ENV: 'production', CONSULT_PRODUCTION_ALLOW: 'AI_COST_GATE_X' })).toBe(false)
  })
})

describe('numbers', () => {
  it('converts USD to whole micro-USD and ignores junk', () => {
    expect(toMicros(0.017)).toBe(17_000)
    expect(toMicros(-1)).toBe(0)
    expect(toMicros(Number.NaN)).toBe(0)
  })
  it('a Deep Research reservation is larger than a chat one, and every cap is above a normal day', () => {
    expect(reserveMicros('deep')).toBeGreaterThan(reserveMicros('think'))
    expect(reserveMicros('think')).toBeGreaterThan(reserveMicros('chat'))
    // A free account may ask 10 chat questions a day (about 0.017 USD each): well inside its ceiling.
    expect(DEFAULT_DAILY_CAP_USD.free).toBeGreaterThan(10 * 0.017 * 2)
    expect(DEFAULT_DAILY_CAP_USD.pro).toBeLessThan(DEFAULT_DAILY_CAP_USD.promax)
    expect(TURN_RESERVE_USD.deep).toBeLessThan(DEFAULT_DAILY_CAP_USD.pro)
  })
  it('an env override replaces a default only with a positive number', () => {
    expect(dailyCapMicros('pro', { AI_COST_DAILY_CAP_USD_PRO: '2.5' })).toBe(2_500_000)
    expect(dailyCapMicros('pro', { AI_COST_DAILY_CAP_USD_PRO: '0' })).toBe(toMicros(DEFAULT_DAILY_CAP_USD.pro))
    expect(dailyCapMicros('pro', { AI_COST_DAILY_CAP_USD_PRO: 'abc' })).toBe(toMicros(DEFAULT_DAILY_CAP_USD.pro))
    expect(dailyCapMicros('free', {})).toBe(toMicros(DEFAULT_DAILY_CAP_USD.free))
  })
})

describe('reserve / settle / release', () => {
  const cap = { AI_COST_DAILY_CAP_USD_PRO: '0.20' } // room for exactly four chat turns of 0.05
  const ask = (userId = A, mode: 'chat' | 'deep' = 'chat', env = { ...ENV, ...cap }) => reserveTurnCost({ userId, tier: 'pro', mode, env })

  it('admits turns until the day ceiling, then refuses, and a refusal leaves no residue', async () => {
    const results = []
    for (let i = 0; i < 6; i++) results.push(await ask())
    expect(results.map(r => r.ok)).toEqual([true, true, true, true, false, false])
    const last = results[5]
    expect(last.ok === false && last.reason).toBe('daily_cap')
    expect(await dayCostMicros(A, { ...ENV, ...cap })).toBe(4 * reserveMicros('chat'))
  })

  it('settling replaces the reservation by the real cost: a cheap turn frees room, an expensive one takes it', async () => {
    const env = { ...ENV, ...cap }
    const r = await ask(A, 'chat', env)
    expect(r.ok).toBe(true)
    if (r.ok) await r.turn.settle(0.017)
    expect(await dayCostMicros(A, env)).toBe(17_000)
    const e = await ask(A, 'chat', env)
    if (e.ok) await e.turn.settle(0.09) // more than the 0.05 reserved
    expect(await dayCostMicros(A, env)).toBe(17_000 + 90_000)
  })

  it('release gives the whole reservation back; settle and release happen once', async () => {
    const env = { ...ENV, ...cap }
    const r = await ask(A, 'chat', env)
    if (!r.ok) throw new Error('should be admitted')
    await r.turn.release()
    await r.turn.release()
    await r.turn.settle(1)
    expect(await dayCostMicros(A, env)).toBe(0)
    const s = await ask(A, 'chat', env)
    if (!s.ok) throw new Error('should be admitted')
    await s.turn.settle(0.01)
    await s.turn.settle(0.5)
    await s.turn.release()
    expect(await dayCostMicros(A, env)).toBe(10_000)
  })

  it('parallel turns cannot both take the last room', async () => {
    const env = { ...ENV, ...cap }
    const results = await Promise.all(Array.from({ length: 20 }, () => ask(A, 'chat', env)))
    expect(results.filter(r => r.ok).length).toBe(4)
    expect(await dayCostMicros(A, env)).toBe(4 * reserveMicros('chat'))
  })

  it('accounts are metered separately', async () => {
    const env = { ...ENV, ...cap }
    for (let i = 0; i < 4; i++) await ask(A, 'chat', env)
    expect((await ask(A, 'chat', env)).ok).toBe(false)
    expect((await ask(B, 'chat', env)).ok).toBe(true)
  })

  it('a Deep Research turn is refused when its larger reservation does not fit, while a chat turn still does', async () => {
    const env = { ...ENV, AI_COST_DAILY_CAP_USD_PRO: '0.30' }
    const first = await ask(A, 'deep', env) // reserves 0.25
    expect(first.ok).toBe(true)
    expect((await ask(A, 'deep', env)).ok).toBe(false) // 0.25 + 0.25 > 0.30
    expect((await ask(A, 'chat', env)).ok).toBe(true) // 0.25 + 0.05 = 0.30, exactly the ceiling
    expect((await ask(A, 'chat', env)).ok).toBe(false)
  })

  it('an id that is not an account id is refused rather than metered under a shared key', async () => {
    const r = await reserveTurnCost({ userId: 'guest-1', tier: 'free', mode: 'chat', env: ENV })
    expect(r.ok).toBe(false)
  })
})
