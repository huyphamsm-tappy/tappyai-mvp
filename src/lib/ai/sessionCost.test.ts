// 02/11 (owner: "bộ đếm chi phí cộng dồn khi UAT"): outside production the server prints one readable line per turn with the running total
// of the session, so the person testing sees the burn without opening a vendor dashboard. Never in production, never changes a turn.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSessionCost, sessionCostLine, logSessionCost } from './sessionCost'
import type { TurnCostInfo } from './turnCost'

afterEach(() => vi.restoreAllMocks())

const info = (o: Partial<TurnCostInfo> = {}): TurnCostInfo => ({ domain: null, turnType: 'one_brain', model: 'luna', tokensIn: 1000, tokensOut: 200, serperCalls: 5, cacheHits: 1, usd: 0.0125, answerUsd: 0.0045, serperUsd: 0.008, ...o })

describe('sessionCostLine', () => {
  it('adds each turn to the running total: dollars, search credits, turns', () => {
    const s = createSessionCost()
    const a = sessionCostLine(s, info(), {})
    expect(a).toContain('turn 0.0125 USD')
    expect(a).toContain('search 0.0080')
    expect(a).toContain('model 0.0045')
    expect(a).toContain('session 1 turns 0.0125 USD')
    expect(a).toContain('~8 Serper credits')
    const b = sessionCostLine(s, info({ usd: 0.02, serperUsd: 0.012, answerUsd: 0.008 }), {})
    expect(b).toContain('session 2 turns 0.0325 USD')
    expect(b).toContain('~20 Serper credits')
  })
  it('the price per credit is the one the cost code uses (SERPER_USD_PER_CREDIT), so a cheaper plan counts fewer credits for the same dollars', () => {
    const s = createSessionCost()
    expect(sessionCostLine(s, info({ serperUsd: 0.008 }), { SERPER_USD_PER_CREDIT: '0.0005' })).toContain('~16 Serper credits')
  })
  it('a turn that did not report the split still counts its dollars, with no search part', () => {
    const s = createSessionCost()
    const line = sessionCostLine(s, { domain: null, turnType: 'ask', model: 'haiku', tokensIn: 1, tokensOut: 1, serperCalls: 0, cacheHits: 0, usd: 0.003 }, {})
    expect(line).toContain('session 1 turns 0.0030 USD')
    expect(line).toContain('~0 Serper credits')
  })
  it('junk numbers never produce NaN', () => {
    const s = createSessionCost()
    const line = sessionCostLine(s, info({ usd: NaN, serperUsd: -1, answerUsd: Infinity }), {})
    expect(line).not.toContain('NaN')
    expect(line).not.toContain('Infinity')
  })
})

describe('logSessionCost', () => {
  it('prints in development and in tests, never in a production runtime', () => {
    const log = vi.fn()
    logSessionCost(info(), { env: { NODE_ENV: 'development' }, log, state: createSessionCost() })
    expect(log).toHaveBeenCalledTimes(1)
    const logProd = vi.fn()
    logSessionCost(info(), { env: { NODE_ENV: 'production' }, log: logProd, state: createSessionCost() })
    logSessionCost(info(), { env: { VERCEL_ENV: 'production' }, log: logProd, state: createSessionCost() })
    expect(logProd).not.toHaveBeenCalled()
  })
  it('a failing logger never breaks the turn', () => {
    expect(() => logSessionCost(info(), { env: {}, log: () => { throw new Error('x') }, state: createSessionCost() })).not.toThrow()
  })
})
