// @vitest-environment node
// BENCH_SPEND_GATE · the core: flag, caps, injection, one reservation per paid call. MOCK-ONLY: nothing here makes a request.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  benchSpendGateOn, readBenchCaps, reserveSpend, runWithSpendGate, currentSpendGate, SpendRefusal, utf8Bytes,
  type SpendGate, type SpendReservation, type SpendSettleStatus,
} from './spendGate'

/** A numeric gate: refuses when held + spent + max > cap. Enough to test the contract of reserveSpend. */
class NumGate implements SpendGate {
  held = 0; spent = 0; next = 1; calls: string[] = []
  constructor(readonly cap: number) {}
  reserve(label: string, maxUsd: number): SpendReservation {
    this.calls.push(`reserve:${label}`)
    if (this.held + this.spent + maxUsd > this.cap + 1e-12) throw new SpendRefusal('over the cap', 'budget')
    this.held += maxUsd
    return { id: this.next++, maxUsd, label }
  }
  settle(r: SpendReservation, actual: unknown): SpendSettleStatus { this.calls.push('settle'); this.held -= r.maxUsd; if (typeof actual !== 'number' || !(actual >= 0)) return 'invalid'; this.spent += actual; return actual > r.maxUsd ? 'exceeded' : 'ok' }
  release(r: SpendReservation) { this.calls.push('release'); this.held -= r.maxUsd }
  markUnknown() { this.calls.push('unknown') }
}

const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD']
beforeEach(() => { for (const k of KEYS) delete process.env[k] })
afterEach(() => { for (const k of KEYS) delete process.env[k] })
const on = (turn = '0.05', run = '0.65') => { process.env.BENCH_SPEND_GATE = '1'; if (turn) process.env.BENCH_SPEND_TURN_CAP_USD = turn; if (run) process.env.BENCH_SPEND_RUN_CAP_USD = run }

describe('flag', () => {
  it('7 · OFF is the default: no reservation is made, no gate is asked, nothing is read', () => {
    const g = new NumGate(1)
    expect(benchSpendGateOn()).toBe(false)
    expect(runWithSpendGate(g, () => reserveSpend('llm:x', 0.01))).toBeNull()
    expect(g.calls).toEqual([])
    process.env.BENCH_SPEND_TURN_CAP_USD = 'garbage' // caps are not even looked at while the flag is OFF
    expect(readBenchCaps()).toBeNull()
  })
  it('is read at call time (not captured at import)', () => {
    expect(benchSpendGateOn()).toBe(false)
    process.env.BENCH_SPEND_GATE = 'true'
    expect(benchSpendGateOn()).toBe(true)
    process.env.BENCH_SPEND_GATE = '0'
    expect(benchSpendGateOn()).toBe(false)
  })
})

describe('caps (read only when the flag is ON)', () => {
  it('valid caps are returned as numbers', () => {
    on('0.05', '0.65')
    expect(readBenchCaps()).toEqual({ turnUsd: 0.05, runUsd: 0.65 })
  })
  it('a missing or invalid cap, or a turn cap above the run cap, is NOT replaced by a default: every paid call is refused', () => {
    const bad: Array<[string, string]> = [['', '0.65'], ['0.05', ''], ['abc', '0.65'], ['0.05', '-1'], ['0', '0.65'], ['1e-2', '0.65'], ['5%', '0.65'], ['0.70', '0.65'], ['NaN', '0.65']]
    for (const [t, r] of bad) {
      for (const k of KEYS) delete process.env[k]
      on(t, r)
      expect(readBenchCaps(), `${t}/${r}`).toBeNull()
      expect(() => runWithSpendGate(new NumGate(1), () => reserveSpend('llm:x', 0.001)), `${t}/${r}`).toThrow(SpendRefusal)
    }
  })
})

describe('reserveSpend', () => {
  it('flag ON without an injected gate refuses (fail closed)', () => {
    on()
    expect(currentSpendGate()).toBeUndefined()
    expect(() => reserveSpend('llm:x', 0.001)).toThrowError(expect.objectContaining({ name: 'SpendRefusal', reason: 'no_gate' }))
  })
  it('a call with no upper bound (null / 0 / NaN / negative / Infinity) is refused and nothing is held', () => {
    on()
    const g = new NumGate(1)
    for (const bad of [null, 0, Number.NaN, -1, Infinity]) expect(() => runWithSpendGate(g, () => reserveSpend('llm:x', bad as never)), String(bad)).toThrowError(expect.objectContaining({ reason: 'no_bound' }))
    expect(g.calls).toEqual([])
  })
  it('a reservation is made BEFORE anything else and is resolved exactly once', () => {
    on()
    const g = new NumGate(1)
    const h = runWithSpendGate(g, () => reserveSpend('serper:search', 0.001))!
    expect(g.held).toBeCloseTo(0.001, 12)
    expect(h.settle(0.001)).toBe('ok')
    expect(() => h.settle(0.001)).toThrow(/already resolved/)
    expect(() => h.release()).toThrow(/already resolved/)
    expect(g.spent).toBeCloseTo(0.001, 12)
  })
  it('6 · a refusal leaves no reservation open', () => {
    on()
    const g = new NumGate(0.002)
    runWithSpendGate(g, () => reserveSpend('a', 0.002))
    expect(() => runWithSpendGate(g, () => reserveSpend('b', 0.001))).toThrow(SpendRefusal)
    expect(g.held).toBeCloseTo(0.002, 12) // only a's
  })
  it('the gate is per async context: two concurrent scopes never see each other\'s gate', async () => {
    on()
    const a = new NumGate(1), b = new NumGate(1)
    await Promise.all([
      runWithSpendGate(a, async () => { await new Promise(r => setTimeout(r, 5)); reserveSpend('a', 0.001) }),
      runWithSpendGate(b, async () => { await new Promise(r => setTimeout(r, 1)); reserveSpend('b', 0.001) }),
    ])
    expect(a.calls).toEqual(['reserve:a']); expect(b.calls).toEqual(['reserve:b'])
  })
})

describe('utf8Bytes', () => {
  it('counts BYTES, not characters (Vietnamese is multi-byte), and is infinite for what cannot be serialised', () => {
    expect(utf8Bytes('ăâê')).toBe(new TextEncoder().encode('"ăâê"').length)
    expect(utf8Bytes('ăâê')).toBeGreaterThan('"ăâê"'.length)
    const cyc: Record<string, unknown> = {}; cyc.self = cyc
    expect(utf8Bytes(cyc)).toBe(Number.POSITIVE_INFINITY)
  })
})
