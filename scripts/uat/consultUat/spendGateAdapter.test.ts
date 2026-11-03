// @vitest-environment node
// The benchmark's SpendGate on a real BudgetGuard: caps, atomicity, the stop rules. MOCK-ONLY: no request, no key.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { reserveSpend, runWithSpendGate, SpendRefusal } from '@/lib/ai/budget/spendGate'
import { BudgetGuard } from './harness'
import { GuardSpendGate } from './spendGateAdapter'

const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD']
beforeEach(() => { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' })
afterEach(() => { for (const k of KEYS) delete process.env[k] })
const turn = () => new GuardSpendGate(new BudgetGuard(0.05))

describe('4 · the per-turn cap ($0.05) is hard: a call that would pass it is refused before it is sent', () => {
  it('reservations add up against the cap; the one that does not fit is refused and leaves nothing held', () => {
    const g = turn()
    runWithSpendGate(g, () => {
      reserveSpend('llm:a', 0.02)
      reserveSpend('llm:b', 0.02)
      expect(() => reserveSpend('llm:c', 0.011)).toThrowError(expect.objectContaining({ name: 'SpendRefusal', reason: 'budget' }))
      reserveSpend('serper:search', 0.01) // exactly fills the cap
      expect(() => reserveSpend('serper:search', 0.000001)).toThrow(SpendRefusal)
    })
    expect(g.guard.openReservedUsd).toBeCloseTo(0.05, 10)
    expect(g.refusals).toBe(2)
    expect(g.requests).toBe(3)
  })
  it('money already SPENT counts too: settled cost + a new reservation may not pass the cap', () => {
    const g = turn()
    runWithSpendGate(g, () => {
      const a = reserveSpend('llm:a', 0.04)!
      expect(a.settle(0.03)).toBe('ok')
      expect(() => reserveSpend('llm:b', 0.021)).toThrow(SpendRefusal) // 0.03 spent + 0.021 > 0.05
      reserveSpend('llm:b', 0.02)
    })
    expect(g.guard.knownUsd).toBeCloseTo(0.03, 10)
  })
})

describe('4 · the run cap ($0.65) is hard: 13 turns of $0.05 fit exactly and no more', () => {
  it('the outer guard reserves the per-turn maximum before each turn; the 14th is refused', () => {
    const run = new BudgetGuard(0.65)
    for (let i = 0; i < 13; i++) run.reserve(0.05)
    expect(() => run.reserve(0.05)).toThrow()
    expect(run.openReservedUsd).toBeCloseTo(0.65, 10)
  })
})

describe('3 · atomic reservation', () => {
  it('two calls started in the same tick for $0.03 each under a $0.05 cap: exactly one is allowed', async () => {
    const g = turn()
    const res = await runWithSpendGate(g, () => Promise.allSettled([
      Promise.resolve().then(() => reserveSpend('llm:a', 0.03)),
      Promise.resolve().then(() => reserveSpend('llm:b', 0.03)),
    ]))
    expect(res.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(res.filter(r => r.status === 'rejected')).toHaveLength(1)
  })
})

describe('5 · a cost above the reservation, an unknown cost, an unusable cost: the run stops, no total', () => {
  it('actual above the reservation is recorded in full and blocks every further call', () => {
    const g = turn()
    runWithSpendGate(g, () => {
      const h = reserveSpend('llm:a', 0.01)!
      expect(h.settle(0.02)).toBe('exceeded')
      expect(g.guard.blockedBy).toBe('cost-exceeded-reservation')
      expect(() => reserveSpend('llm:b', 0.001)).toThrowError(expect.objectContaining({ reason: 'blocked' }))
    })
    expect(g.guard.knownUsd).toBeCloseTo(0.02, 10)
  })
  it('a failed call (cost unknown) keeps its reservation open and blocks', () => {
    const g = turn()
    runWithSpendGate(g, () => {
      reserveSpend('llm:a', 0.01)!.markUnknown()
      expect(g.guard.blockedBy).toBe('cost-unknown')
      expect(() => reserveSpend('llm:b', 0.001)).toThrow(SpendRefusal)
    })
    expect(g.guard.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
  })
  it('missing / NaN / negative / non-number usage is "invalid": never turned into 0, the reservation stays unresolved', () => {
    for (const bad of [undefined, null, Number.NaN, -1, '0.01']) {
      const g = turn()
      runWithSpendGate(g, () => { expect(reserveSpend('llm:a', 0.01)!.settle(bad), String(bad)).toBe('invalid') })
      expect(g.guard.blockedBy).toBe('invalid-cost')
      expect(g.guard.knownUsd).toBe(0)
      expect(g.guard.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
    }
  })
})

describe('4 · a closed turn takes no more calls', () => {
  it('after close() a new reservation is refused as late; a reservation that was already open stays open and is still reported', () => {
    const g = turn()
    runWithSpendGate(g, () => {
      const open = reserveSpend('llm:a', 0.01)!
      g.close()
      expect(() => reserveSpend('llm:b', 0.001)).toThrowError(expect.objectContaining({ name: 'SpendRefusal', reason: 'blocked' }))
      open.settle(0.005) // the call that was already running can still be booked
    })
    expect(g.lateRefusals).toBe(1); expect(g.refusals).toBe(0)
    expect(g.guard.knownUsd).toBeCloseTo(0.005, 10)
  })
})

describe('6 · release is only for a call that never left; the books', () => {
  it('release frees the reservation and records nothing spent', () => {
    const g = turn()
    runWithSpendGate(g, () => { reserveSpend('serper:search', 0.001)!.release() })
    expect(g.guard.openReservedUsd).toBe(0); expect(g.guard.knownUsd).toBe(0)
    expect(g.records.map(r => r.state)).toEqual(['released'])
  })
  it('requests are counted by label: model calls and Serper calls', () => {
    const g = turn()
    runWithSpendGate(g, () => {
      reserveSpend('llm:consult', 0.004)!.settle(0.003)
      reserveSpend('llm:consult:retry', 0.004)!.settle(0.003)
      reserveSpend('serper:search', 0.001)!.settle(0.001)
    })
    expect(g.count('llm:')).toBe(2); expect(g.count('serper:')).toBe(1)
  })
})
