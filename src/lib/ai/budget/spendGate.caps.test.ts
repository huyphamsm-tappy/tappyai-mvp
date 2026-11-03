// @vitest-environment node
// BENCH_SPEND_GATE · the caps are validated by their EXACT decimal value, and nothing above $0.10 per turn (Owner decision 26/10/2026, Wave 3-FIX R3-06; it was $0.05) / $0.65 per run is ever accepted.
// MOCK-ONLY: no model, no network. The checks run on the text of the cap BEFORE any rounding or micro-USD conversion.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MAX_RUN_CAP_USD, MAX_TURN_CAP_USD, readBenchCaps, reserveSpend, runWithSpendGate, SpendRefusal, type SpendGate } from './spendGate'

const env = (turn: string | undefined, run: string | undefined): Record<string, string | undefined> => ({ BENCH_SPEND_GATE: '1', BENCH_SPEND_TURN_CAP_USD: turn, BENCH_SPEND_RUN_CAP_USD: run })

describe('P0-1 · the maximum is a constant, not a parameter', () => {
  it('MAX_TURN_CAP_USD = 0.10 and MAX_RUN_CAP_USD = 0.65', () => {
    expect(MAX_TURN_CAP_USD).toBe(0.10)
    expect(MAX_RUN_CAP_USD).toBe(0.65)
  })
  it('Wave 3-FIX R3-06: 0.10 is accepted, 0.11 and 0.100000000001 are not, and the earlier 0.05 is still a valid cap', () => {
    expect(readBenchCaps(env('0.10', '0.65'))).toEqual({ turnUsd: 0.1, runUsd: 0.65 })
    expect(readBenchCaps(env('0.1', '0.65'))).toEqual({ turnUsd: 0.1, runUsd: 0.65 })
    expect(readBenchCaps(env('0.11', '0.65'))).toBeNull()
    expect(readBenchCaps(env('0.100000000001', '0.65'))).toBeNull()
    expect(readBenchCaps(env('0.05', '0.65'))).toEqual({ turnUsd: 0.05, runUsd: 0.65 })
  })
  it('the gate OFF (the default, and production) reads no cap at all: the larger maximum reaches nothing', () => {
    expect(readBenchCaps({ BENCH_SPEND_TURN_CAP_USD: '0.10', BENCH_SPEND_RUN_CAP_USD: '0.65' })).toBeNull()
    expect(readBenchCaps({ BENCH_SPEND_GATE: '0', BENCH_SPEND_TURN_CAP_USD: '0.10', BENCH_SPEND_RUN_CAP_USD: '0.65' })).toBeNull()
  })
})

describe('P0-1 · readBenchCaps accepts only caps at or below the maximum, judged on the exact decimal text', () => {
  const accepted: Array<[string, string]> = [['0.05', '0.65'], ['0.10', '0.65'], ['0.100', '0.650'], ['0.10000000', '0.65'], [' 0.10 ', '0.65'], ['0.02', '0.02'], ['0.050', '0.650'], ['0.05000000', '0.65'], [' 0.05 ', '0.65'], ['0.000001', '0.000001'], ['0.099999999999', '0.649999999999']]
  for (const [t, r] of accepted) {
    it(`accepted: turn ${JSON.stringify(t)} run ${JSON.stringify(r)}`, () => {
      const caps = readBenchCaps(env(t, r))
      expect(caps).not.toBeNull()
      expect(caps!.turnUsd).toBeLessThanOrEqual(0.10)
      expect(caps!.runUsd).toBeLessThanOrEqual(0.65)
    })
  }
  const rejected: Array<[string, string | undefined, string]> = [
    ['0.11', '0.65', 'turn above the maximum'],
    ['0.06', '0.05', 'turn above the run cap (the old maximum is no longer the line)'],
    ['0.10', '0.70', 'run above the maximum'],
    ['1', '10', 'both far above'],
    ['1000000000', '1000000000', 'huge'],
    ['99999999999999999999999', '99999999999999999999999', 'larger than any safe integer'],
    ['0.10000001', '0.65', 'one micro-cent above, rounding down later would not overspend but the text is above the maximum'],
    ['0.10', '0.650001', 'run a millionth above'],
    ['5e-2', '0.65', 'exponent form'],
    ['1e-2', '0.65', 'exponent form'],
    ['5e-8', '0.65', 'exponent form'],
    ['0.05', '6.5e-1', 'exponent form'],
    ['-0.05', '0.65', 'negative'],
    ['NaN', '0.65', 'NaN'],
    ['Infinity', '0.65', 'Infinity'],
    ['', '0.65', 'empty'],
    ['0.05', undefined, 'missing'],
    ['0.05', '', 'empty'],
    ['0', '0', 'zero'],
    ['0.05', '0.02', 'turn above run'],
    ['0.0000000000001', '0.65', 'more decimals than the exact parser keeps (13)'],
    ['.05', '0.65', 'no integer part'],
    ['0x10', '0.65', 'hex'],
    ['5%', '0.65', 'percent'],
  ]
  for (const [t, r, why] of rejected) {
    it(`rejected (${why}): turn ${JSON.stringify(t)} run ${JSON.stringify(r)}`, () => {
      expect(readBenchCaps(env(t, r))).toBeNull()
    })
  }
})

describe('P0-1 · reserveSpend refuses every paid call when a cap is above the maximum (the gate is never even asked)', () => {
  const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD']
  beforeEach(() => { for (const k of KEYS) delete process.env[k] })
  afterEach(() => { for (const k of KEYS) delete process.env[k] })
  for (const [t, r] of [['0.11', '0.65'], ['0.10', '0.70'], ['1', '10'], ['0.10000001', '0.65'], ['5e-2', '0.65']]) {
    it(`turn ${t} run ${r}`, () => {
      process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = t; process.env.BENCH_SPEND_RUN_CAP_USD = r
      const calls: string[] = []
      const gate: SpendGate = { reserve: l => { calls.push(l); throw new Error('must not be asked') }, settle: () => 'ok', release: () => {}, markUnknown: () => {} }
      let err: unknown
      try { runWithSpendGate(gate, () => reserveSpend('llm:x', 0.001)) } catch (e) { err = e }
      expect(err).toBeInstanceOf(SpendRefusal)
      expect((err as SpendRefusal).reason).toBe('no_caps')
      expect(calls).toEqual([])
    })
  }
})
