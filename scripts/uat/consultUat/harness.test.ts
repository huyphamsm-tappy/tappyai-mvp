// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { UAT_TURNS, type UatTurn } from './questions'
import {
  BudgetGuard, BudgetRefusal, ReservationError, RequestNotSent, createMockRunner, matchesFixedUatSet, percentile, runUat, summarize, toMicro, toolCallRate,
  type ChatMessage, type TurnRunner,
} from './harness'

/** A runner that counts its calls and answers from a function. */
function counting(answer: (id: string, n: number) => Awaited<ReturnType<TurnRunner>> | Promise<Awaited<ReturnType<TurnRunner>>>) {
  const calls: string[] = []
  const runner: TurnRunner = async ({ turn }) => { calls.push(turn.id); return answer(turn.id, calls.length) }
  return { runner, calls }
}
const ok = (usd = 0, ms = 1, toolNames: string[] = []) => ({ text: 'ok', toolCalls: toolNames.map(name => ({ name })), ms, usd })

describe('UAT question set', () => {
  it('has the 13 fixed turns (12 questions, Q11 with a follow-up), unique ids, in order', () => {
    expect(UAT_TURNS).toHaveLength(13)
    expect(new Set(UAT_TURNS.map(t => t.id)).size).toBe(13)
    expect(new Set(UAT_TURNS.map(t => t.conversation)).size).toBe(12)
    expect(UAT_TURNS.map(t => t.id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11.1', 'Q11.2', 'Q12'])
    for (const t of UAT_TURNS) expect(t.text.trim().length).toBeGreaterThan(20)
  })

  it('keeps the numbers that the fixed wording depends on', () => {
    const byId = Object.fromEntries(UAT_TURNS.map(t => [t.id, t.text]))
    expect(byId.Q4).toContain('8.000.000đ')
    expect(byId.Q4).toContain('3.000.000đ')
    expect(byId['Q11.1']).toContain('5.000.000đ')
    expect(byId['Q11.2']).toContain('6.000.000đ')
    expect(byId.Q6).toContain('15/11/2026')
    expect(byId.Q12).toContain('22:00')
  })

  it('Q11 is one conversation in two turns; every other conversation has one turn', () => {
    const q11 = UAT_TURNS.filter(t => t.conversation === 'Q11')
    expect(q11.map(t => t.turn)).toEqual([1, 2])
    expect(UAT_TURNS.filter(t => t.conversation !== 'Q11').every(t => t.turn === 1)).toBe(true)
  })
})

describe('BudgetGuard: inputs', () => {
  it('refuses every call when no cap was supplied', () => {
    expect(() => new BudgetGuard(null).reserve(0.01)).toThrow(BudgetRefusal)
  })

  it('rejects a cap that is NaN, infinite or negative; a cap of 0 is valid but nothing fits under it', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -0.01]) expect(() => new BudgetGuard(bad), String(bad)).toThrow(BudgetRefusal)
    const zero = new BudgetGuard(0)
    expect(() => zero.reserve(0.000001)).toThrow(BudgetRefusal)
  })

  it('rejects a per-turn maximum that is NaN, infinite, negative or 0 (no way round the check)', () => {
    const g = new BudgetGuard(10)
    for (const bad of [Number.NaN, Infinity, -Infinity, -1, 0]) expect(() => g.reserve(bad), String(bad)).toThrow(BudgetRefusal)
    expect(g.openReservedUsd).toBe(0)
  })
})

describe('BudgetGuard: reservations', () => {
  it('checks known cost plus the new reservation before a call (old behaviour kept)', () => {
    const g = new BudgetGuard(0.05)
    g.settle(g.reserve(0.02), 0.02)
    g.settle(g.reserve(0.02), 0.02)
    expect(() => g.reserve(0.02)).toThrow(BudgetRefusal)
    expect(g.knownUsd).toBeCloseTo(0.04, 10)
  })

  it('holds the reservation: an open reservation counts against the cap before any cost is known', () => {
    const g = new BudgetGuard(0.05)
    g.reserve(0.03)
    expect(g.openReservedUsd).toBeCloseTo(0.03, 10)
    expect(() => g.reserve(0.03)).toThrow(BudgetRefusal)
  })

  it('a cost below the reservation frees the surplus exactly; no phantom budget stays held', () => {
    const g = new BudgetGuard(0.05)
    const r = g.reserve(0.04)
    expect(g.settle(r, 0.01)).toBe('ok')
    expect(g.knownUsd).toBeCloseTo(0.01, 10)
    expect(g.openReservedUsd).toBe(0)
    expect(() => g.reserve(0.04)).not.toThrow()
  })

  it('a cost exactly at the reservation reconciles', () => {
    const g = new BudgetGuard(1)
    expect(g.settle(g.reserve(0.02), 0.02)).toBe('ok')
    expect(g.blockedBy).toBeNull()
  })

  it('a cost above the reservation is recorded in full, flagged, and blocks every further reservation', () => {
    const g = new BudgetGuard(1)
    expect(g.settle(g.reserve(0.02), 0.05)).toBe('exceeded')
    expect(g.knownUsd).toBeCloseTo(0.05, 10)
    expect(g.blockedBy).toBe('cost-exceeded-reservation')
    expect(() => g.reserve(0.01)).toThrow(BudgetRefusal)
  })

  it('an invalid reported cost keeps the reservation open and blocks (never turned into 0)', () => {
    for (const bad of [Number.NaN, Infinity, -1, '0.01', undefined, null]) {
      const g = new BudgetGuard(1)
      expect(g.settle(g.reserve(0.02), bad), String(bad)).toBe('invalid')
      expect(g.knownUsd, String(bad)).toBe(0)
      expect(g.unresolvedReservedUsd, String(bad)).toBeCloseTo(0.02, 10)
      expect(g.blockedBy, String(bad)).toBe('invalid-cost')
    }
  })

  it('a reservation is resolved exactly once', () => {
    const g = new BudgetGuard(1)
    const a = g.reserve(0.01); g.settle(a, 0.01)
    expect(() => g.settle(a, 0.01)).toThrow(ReservationError)
    expect(() => g.release(a)).toThrow(ReservationError)
    expect(g.knownUsd).toBeCloseTo(0.01, 10)
    const b = g.reserve(0.01); g.release(b)
    expect(() => g.settle(b, 0)).toThrow(ReservationError)
    expect(() => g.markUnknown(b)).toThrow(ReservationError)
    expect(() => g.release(b)).toThrow(ReservationError)
    expect(() => g.settle({ id: 999, maxUsd: 1 }, 0)).toThrow(ReservationError)
  })

  it('release frees a reservation without recording any cost; markUnknown keeps it open and blocks', () => {
    const g = new BudgetGuard(1)
    g.release(g.reserve(0.02))
    expect(g.openReservedUsd).toBe(0)
    expect(g.knownUsd).toBe(0)
    g.markUnknown(g.reserve(0.02))
    expect(g.unresolvedReservedUsd).toBeCloseTo(0.02, 10)
    expect(g.blockedBy).toBe('cost-unknown')
    expect(() => g.reserve(0.01)).toThrow(BudgetRefusal)
  })

  it('floating-point edge: a sum that exactly fits the cap runs, one micro-USD over does not', () => {
    const g = new BudgetGuard(0.3)
    g.settle(g.reserve(0.1), 0.1)
    expect(() => g.reserve(0.2)).not.toThrow()
    const h = new BudgetGuard(0.3)
    h.settle(h.reserve(0.1), 0.1)
    h.settle(h.reserve(0.2), 0.2)
    expect(h.knownUsd).toBeCloseTo(0.3, 10)
    expect(() => h.reserve(0.000001)).toThrow(BudgetRefusal)
    const i = new BudgetGuard(0.3)
    i.settle(i.reserve(0.1), 0.1)
    expect(() => i.reserve(0.200001)).toThrow(BudgetRefusal)
  })
})

describe('BudgetGuard: micro-USD rounding (relative precision, safe integers)', () => {
  it('a reservation of 0.0000010004 USD counts as 2 micro-USD: it fits a cap of 2 micro-USD, and 0.1 micro-USD more is refused', () => {
    const g = new BudgetGuard(0.000002)
    g.reserve(0.0000010004)
    expect(g.openReservedUsd).toBeCloseTo(0.000002, 12)
    expect(() => g.reserve(0.0000001)).toThrow(BudgetRefusal)
  })

  it('a cap of 0.0000019996 USD counts as 1 micro-USD: 1 micro-USD fits, a further 0.1 micro-USD does not', () => {
    const g = new BudgetGuard(0.0000019996)
    g.reserve(0.000001)
    expect(() => g.reserve(0.0000001)).toThrow(BudgetRefusal)
  })

  it('an actual cost of 0.0000010004 USD (2 micro-USD) under a reservation of 0.000001 (1 micro-USD) is "exceeded"', () => {
    const g = new BudgetGuard(1)
    expect(g.settle(g.reserve(0.000001), 0.0000010004)).toBe('exceeded')
    expect(g.blockedBy).toBe('cost-exceeded-reservation')
  })

  it('a value too large for exact arithmetic (1e15 USD) is refused as a cap or a reservation and invalid as an actual cost', () => {
    expect(() => new BudgetGuard(1e15)).toThrow(BudgetRefusal)
    expect(() => new BudgetGuard(1).reserve(1e15)).toThrow(BudgetRefusal)
    const g = new BudgetGuard(1)
    const r = g.reserve(0.01)
    expect(g.settle(r, 1e15)).toBe('invalid')
    expect(g.knownUsd).toBe(0)
    expect(g.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
    expect(g.blockedBy).toBe('invalid-cost')
  })

  it('toMicro: whole micro-USD from the decimal text; up for costs and reservations, down for the cap', () => {
    expect(toMicro(0.0000010004, 'up')).toBe(2)
    expect(toMicro(0.0000010004, 'down')).toBe(1)
    expect(toMicro(0.0000019996, 'down')).toBe(1)
    expect(toMicro(0.00000199999999999999, 'down')).toBe(1)
    expect(toMicro(0.00000199999999999999, 'up')).toBe(2)
    expect(toMicro(0.1000000000004, 'up')).toBe(100001)
    expect(toMicro(0.1, 'up')).toBe(100000)
    expect(toMicro(0.1, 'down')).toBe(100000)
    expect(toMicro(0.3, 'up')).toBe(300000)
    expect(toMicro(0.07, 'up')).toBe(70000)
    expect(toMicro(0, 'up')).toBe(0)
    expect(toMicro(12.5, 'up')).toBe(12500000)
  })

  it('toMicro: exponent forms are read as decimals (1e-7 USD = 0.1 micro-USD)', () => {
    expect(toMicro(1e-7, 'up')).toBe(1)
    expect(toMicro(1e-7, 'down')).toBe(0)
    expect(toMicro(1.5e-7, 'up')).toBe(1)
    expect(toMicro(1e-6, 'up')).toBe(1)
    expect(toMicro(1e-6, 'down')).toBe(1)
    expect(toMicro(2.5e-6, 'up')).toBe(3)
    expect(toMicro(2.5e-6, 'down')).toBe(2)
    expect(toMicro(1e-300, 'up')).toBe(1)
    expect(toMicro(1e-300, 'down')).toBe(0)
  })

  it('toMicro: a value that is not a finite number >= 0, or too large for a safe integer, gives null', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -1, -0.000001, '1', null, undefined, {}]) expect(toMicro(bad, 'up'), String(bad)).toBeNull()
    expect(toMicro(1e15, 'up')).toBeNull()
    expect(toMicro(1e15, 'down')).toBeNull()
    expect(toMicro(1e21, 'up')).toBeNull()
    expect(toMicro(9007199254, 'up')).toBe(9007199254000000)
    expect(toMicro(9007199255, 'up')).toBeNull()
  })

  it('a cap of 0.00000199999999999999 USD is 1 micro-USD, never 2', () => {
    const g = new BudgetGuard(0.00000199999999999999)
    g.reserve(0.000001)
    expect(() => g.reserve(0.0000001)).toThrow(BudgetRefusal)
  })

  it('an actual cost of 0.1000000000004 USD under a reservation of 0.1 USD is "exceeded" and is recorded as 100001 micro-USD, not less', () => {
    const g = new BudgetGuard(1)
    expect(g.settle(g.reserve(0.1), 0.1000000000004)).toBe('exceeded')
    expect(g.knownUsd).toBeCloseTo(0.100001, 12)
  })

  it('an actual cost of exactly 0 is valid: "ok", nothing added to the known cost, the reservation is released', () => {
    const g = new BudgetGuard(1)
    const r = g.reserve(0.02)
    expect(g.settle(r, 0)).toBe('ok')
    expect(g.knownUsd).toBe(0)
    expect(g.openReservedUsd).toBe(0)
    expect(g.blockedBy).toBeNull()
    expect(() => g.reserve(1)).not.toThrow()
  })

  it('a cap of 0 is valid but refuses every reservation with a positive amount', () => {
    const g = new BudgetGuard(0)
    for (const amount of [0.000001, 0.01, 1]) expect(() => g.reserve(amount), String(amount)).toThrow(BudgetRefusal)
    expect(g.openReservedUsd).toBe(0)
  })

  it('values that float noise would round the wrong way keep their exact micro-USD count', () => {
    const g = new BudgetGuard(0.07)
    g.settle(g.reserve(0.07), 0.07)
    expect(g.knownUsd).toBeCloseTo(0.07, 12)
    expect(() => g.reserve(0.000001)).toThrow(BudgetRefusal)
  })
})

describe('BudgetGuard: reservation handles', () => {
  it('a handle is frozen', () => {
    const real = new BudgetGuard(1).reserve(0.01)
    expect(Object.isFrozen(real)).toBe(true)
    expect(() => { (real as { id: number }).id = 99 }).toThrow(TypeError)
  })

  it('a forged copy of a real handle (same id and amount) is rejected by settle, release and markUnknown, and changes nothing', () => {
    const g = new BudgetGuard(1)
    const real = g.reserve(0.02)
    const forged = { id: real.id, maxUsd: real.maxUsd }
    expect(() => g.settle(forged, 0)).toThrow(ReservationError)
    expect(() => g.release(forged)).toThrow(ReservationError)
    expect(() => g.markUnknown(forged)).toThrow(ReservationError)
    expect(g.openReservedUsd).toBeCloseTo(0.02, 10)
    expect(g.knownUsd).toBe(0)
    expect(g.blockedBy).toBeNull()
    expect(g.settle(real, 0.01)).toBe('ok')
    expect(g.knownUsd).toBeCloseTo(0.01, 10)
    expect(g.openReservedUsd).toBe(0)
  })

  it('a forged copy of an already resolved handle is rejected too, and the state stays as it was', () => {
    const g = new BudgetGuard(1)
    const real = g.reserve(0.02)
    g.settle(real, 0.02)
    const forged = { id: real.id, maxUsd: real.maxUsd }
    expect(() => g.settle(forged, 0)).toThrow(ReservationError)
    expect(() => g.release(forged)).toThrow(ReservationError)
    expect(() => g.markUnknown(forged)).toThrow(ReservationError)
    expect(g.knownUsd).toBeCloseTo(0.02, 10)
    expect(g.openReservedUsd).toBe(0)
    expect(g.blockedBy).toBeNull()
  })

  it('a handle from another guard is rejected even when its id exists here', () => {
    const a = new BudgetGuard(1)
    const b = new BudgetGuard(1)
    const fromA = a.reserve(0.01)
    b.reserve(0.01)
    expect(() => b.settle(fromA, 0)).toThrow(ReservationError)
    expect(b.openReservedUsd).toBeCloseTo(0.01, 10)
  })

  it('null or undefined instead of a handle is rejected', () => {
    const g = new BudgetGuard(1)
    g.reserve(0.01)
    expect(() => g.settle(undefined as never, 0)).toThrow(ReservationError)
    expect(() => g.release(null as never)).toThrow(ReservationError)
  })
})

describe('BudgetGuard: accounting overflow', () => {
  /** A guard whose known cost is 8e9 USD under a 9e9 USD cap (8e15 of 9e15 micro-USD; the safe-integer limit is about 9.007e15). */
  const loaded = () => {
    const g = new BudgetGuard(9_000_000_000)
    expect(g.settle(g.reserve(8_000_000_000), 8_000_000_000)).toBe('ok')
    return g
  }

  it('the second reservation fits the cap exactly, and its 2e9 cost reports "overflow" (checked before "exceeded")', () => {
    const g = loaded()
    expect(g.knownUsd).toBeCloseTo(8e9, 3)
    const r2 = g.reserve(1_000_000_000)
    expect(g.settle(r2, 2_000_000_000)).toBe('overflow')
  })

  it('after an overflow the total is unstated, the subtotal excludes the overflowing turn, and the run is blocked', () => {
    const g = loaded()
    const r2 = g.reserve(1_000_000_000)
    g.settle(r2, 2_000_000_000)
    expect(g.knownUsd).toBeNull()
    expect(g.knownSubtotalUsd).toBeCloseTo(8e9, 3)
    expect(g.blockedBy).toBe('invalid-cost')
    expect(g.unresolvedReservedUsd).toBeCloseTo(1e9, 3)
    expect(() => g.reserve(1)).toThrow(BudgetRefusal)
    expect(() => g.reserve(0.000001)).toThrow(BudgetRefusal)
  })

  it('without an overflow the subtotal equals the known total', () => {
    const g = new BudgetGuard(1)
    g.settle(g.reserve(0.1), 0.05)
    expect(g.knownUsd).toBeCloseTo(0.05, 12)
    expect(g.knownSubtotalUsd).toBeCloseTo(0.05, 12)
  })
})

describe('runUat: accounting overflow', () => {
  it('an overflowing turn keeps its real cost on the turn, leaves the total unstated, and stops the run', async () => {
    const guard = new BudgetGuard(9_000_000_000)
    guard.settle(guard.reserve(8_000_000_000), 8_000_000_000)
    const { runner, calls } = counting(() => ok(2_000_000_000))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 1_000_000_000 })
    expect(calls).toEqual(['Q1'])
    expect(report.turns[0]).toMatchObject({ id: 'Q1', usd: 2_000_000_000, cost: 'known', accountingOverflow: true })
    expect(report.stopped).toMatchObject({ reason: 'invalid-cost', atTurn: 'Q1', detail: 'accounting total would exceed the safe-integer range' })
    expect(report.cost.costAccounted).toBe(false)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    expect(report.cost.knownUsd).toBeNull()
    expect(report.cost.knownSubtotalUsd).toBeCloseTo(8e9, 3)
    expect(report.notRun).toHaveLength(12)
    expect(report.notRun[0]).toEqual({ id: 'Q2', reason: 'invalid-cost' })
    const s = summarize(report)
    expect(s.knownUsd).toBeNull()
    expect(s.knownSubtotalUsd).toBeCloseTo(8e9, 3)
    expect(s.totalUsd).toBeNull()
  })
})

describe('runUat: complete means the fixed UAT set', () => {
  const costOk = () => ok(0.001)

  it('matchesFixedUatSet accepts the fixed set (also a copy) and nothing else', () => {
    expect(matchesFixedUatSet(UAT_TURNS)).toBe(true)
    expect(matchesFixedUatSet(UAT_TURNS.map(t => ({ ...t })))).toBe(true)
    expect(matchesFixedUatSet(UAT_TURNS.slice(0, 3))).toBe(false)
    expect(matchesFixedUatSet([])).toBe(false)
    expect(matchesFixedUatSet([...UAT_TURNS, UAT_TURNS[0]])).toBe(false)
    expect(matchesFixedUatSet(UAT_TURNS.map((t, i) => (i === 5 ? { ...t, conversation: 'Q6b' } : t)))).toBe(false)
    expect(matchesFixedUatSet(UAT_TURNS.map((t, i) => (i === 11 ? { ...t, turn: 3 } : t)))).toBe(false)
  })

  it('the fixed set, 13 turns, no error, valid cost: complete, and the total equals the known cost', async () => {
    const { runner } = counting(costOk)
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(true)
    expect(report.cost.totalUsd).not.toBeNull()
    expect(report.cost.totalUsd).toBe(report.cost.knownUsd)
    expect(report.cost.totalUsd).toBeCloseTo(0.013, 10)
  })

  it('the first three turns only: the cost is accounted and known, but the run is not complete and no total is stated', async () => {
    const { runner, calls } = counting(costOk)
    const report = await runUat({ turns: UAT_TURNS.slice(0, 3), runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual(['Q1', 'Q2', 'Q3'])
    expect(report.stopped).toBeNull()
    expect(report.notRun).toEqual([])
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    expect(report.cost.knownUsd).toBeCloseTo(0.003, 10)
  })

  it('13 turns with two of them swapped: not complete, no total', async () => {
    const swapped = [...UAT_TURNS]
    ;[swapped[1], swapped[2]] = [swapped[2], swapped[1]]
    expect(swapped).toHaveLength(13)
    const { runner } = counting(costOk)
    const report = await runUat({ turns: swapped, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('13 turns with the text of one changed: not complete, no total', async () => {
    const edited = UAT_TURNS.map((t, i) => (i === 3 ? { ...t, text: `${t.text} (edited)` } : t))
    const { runner } = counting(costOk)
    const report = await runUat({ turns: edited, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('13 turns with one replaced by a turn with another id: not complete, no total', async () => {
    const replaced = UAT_TURNS.map((t, i) => (i === 4 ? { ...t, id: 'QX', conversation: 'QX' } : t))
    expect(replaced).toHaveLength(13)
    const { runner } = counting(costOk)
    const report = await runUat({ turns: replaced, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })
})

describe('runUat: the runner cannot change the fixed UAT set or the completion result', () => {
  /**
   * Every kind of write a runner could make to the turn it was handed. Each write is caught, so the run stays an ordinary costed
   * run (a runner that throws would turn it into a cost-unknown run, which is not what is tested here). Whether a write throws
   * (strict mode) or is ignored does not matter; what matters is that the turn is unchanged afterwards.
   */
  function tamper(turn: UatTurn, newText: string): number {
    const writes: Array<() => void> = [
      () => { turn.text = newText },
      () => { turn.id = 'Q99' },
      () => { turn.conversation = 'Q99' },
      () => { turn.turn = 99 },
      () => { delete (turn as Partial<UatTurn>).text },
    ]
    for (const w of writes) { try { w() } catch { /* a write to a frozen object may throw; the run goes on */ } }
    return writes.length
  }

  it('canonical set: the runner gets a frozen copy, UAT_TURNS stays as it was, and the run is still complete with its total', async () => {
    const before = JSON.stringify(UAT_TURNS)
    const seen: Array<{ sameObject: boolean; frozen: boolean; intact: boolean; attempts: number }> = []
    const runner: TurnRunner = async ({ turn }) => {
      const pristine = JSON.stringify(turn)
      const attempts = tamper(turn, 'TAMPERED')
      seen.push({ sameObject: UAT_TURNS.includes(turn), frozen: Object.isFrozen(turn), intact: JSON.stringify(turn) === pristine, attempts })
      return ok(0.001)
    }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(seen).toHaveLength(13)
    for (const s of seen) expect(s).toEqual({ sameObject: false, frozen: true, intact: true, attempts: 5 })
    expect(JSON.stringify(UAT_TURNS)).toBe(before)
    expect(report.turns.map(t => t.question)).toEqual(UAT_TURNS.map(t => t.text))
    expect(report.turns.every(t => t.cost === 'known' && t.error === undefined)).toBe(true)
    expect(report.stopped).toBeNull()
    expect(report.notRun).toEqual([])
    expect(report.cost).toMatchObject({ costAccounted: true, complete: true, totalUsd: 0.013 })
  })

  it('an edited set cannot become the fixed set because the runner rewrites the turns it is given: not complete, no total', async () => {
    const edited = UAT_TURNS.map((t, i) => (i === 3 ? { ...t, text: `${t.text} (edited)` } : { ...t }))
    const editedText = edited[3].text
    const runner: TurnRunner = async ({ turn }) => {
      const canonical = UAT_TURNS.find(f => f.id === turn.id)
      tamper(turn, canonical ? canonical.text : 'TAMPERED')
      return ok(0.001)
    }
    const report = await runUat({ turns: edited, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.turns).toHaveLength(13)
    expect(report.turns.every(t => t.cost === 'known' && t.error === undefined)).toBe(true)
    expect(edited[3].text).toBe(editedText)
    expect(matchesFixedUatSet(edited)).toBe(false)
    expect(report.turns[3].question).toBe(editedText)
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })
})

describe('runUat: totalUsd is the cost of this run, not of the guard', () => {
  it('a reused guard: totalUsd excludes the earlier spend, the guard still counts both, and the cap is still enforced', async () => {
    const guard = new BudgetGuard(0.05)
    guard.settle(guard.reserve(0.02), 0.02) // spent before the UAT run starts
    const { runner } = counting(() => ok(0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
    expect(report.cost).toMatchObject({ costAccounted: true, complete: true })
    expect(report.cost.totalUsd).toBe(0.013) // 13 turns x 0.001; the earlier 0.02 is not in it
    expect(report.cost.knownUsd).toBe(0.033) // cumulative: 0.02 + 0.013
    expect(guard.knownUsd).toBe(0.033)
    expect(summarize(report).totalUsd).toBe(0.013)
    // 0.033 is spent of 0.05: 0.018 would pass the cap by one micro-USD, 0.017 fits exactly.
    expect(() => guard.reserve(0.018)).toThrow(BudgetRefusal)
    expect(() => guard.reserve(0.017)).not.toThrow()
  })

  it('a reused guard whose earlier spend leaves too little room: the run is refused part-way and no total is stated', async () => {
    const guard = new BudgetGuard(0.016)
    guard.settle(guard.reserve(0.015), 0.015)
    const { runner, calls } = counting(() => ok(0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.001 })
    expect(calls).toEqual(['Q1'])
    expect(report.stopped).toMatchObject({ reason: 'budget-refused', atTurn: 'Q2' })
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('a fresh guard: totalUsd and the guard total are the same number', async () => {
    const guard = new BudgetGuard(1)
    const { runner } = counting(() => ok(0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
    expect(report.cost.totalUsd).toBe(0.013)
    expect(report.cost.totalUsd).toBe(guard.knownUsd)
  })

  it('a reused guard with an invalid cost in this run: totalUsd stays null (the bad cost is not counted as 0)', async () => {
    const guard = new BudgetGuard(1)
    guard.settle(guard.reserve(0.02), 0.02)
    const { runner } = counting((_id, n) => (n === 5 ? { ...ok(), usd: Number.NaN } : ok(0.001)))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
    expect(report.stopped).toMatchObject({ reason: 'invalid-cost', atTurn: 'Q5' })
    expect(report.cost.costAccounted).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })
})

describe('runUat: completion cannot be spoofed (discriminating cases)', () => {
  it('only one turn text differs and the runner rewrites ONLY that text to the canonical one: the caller data stays edited, not complete, no total', async () => {
    const editedIndex = 3
    const edited = UAT_TURNS.map((t, i) => (i === editedIndex ? { ...t, text: `${t.text} (edited)` } : { ...t }))
    const editedText = edited[editedIndex].text
    const canonicalText = UAT_TURNS[editedIndex].text
    expect(editedText).not.toBe(canonicalText)
    const before = JSON.stringify(edited)
    expect(matchesFixedUatSet(edited)).toBe(false) // checked before the run
    // The runner changes nothing but `text`, and only on the edited turn. Whether that write throws is not recorded or asserted
    // here: what is asserted is the text the runner can read straight after the write, and the caller's data after the run.
    const writes: Array<{ id: string; textAfterWrite: string }> = []
    const runner: TurnRunner = async ({ turn }) => {
      if (turn.id === edited[editedIndex].id) {
        try { turn.text = canonicalText } catch { /* ignored on purpose, see above */ }
        writes.push({ id: turn.id, textAfterWrite: turn.text })
      }
      return ok(0.001)
    }
    const report = await runUat({ turns: edited, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(writes).toEqual([{ id: UAT_TURNS[editedIndex].id, textAfterWrite: editedText }])
    expect(JSON.stringify(edited)).toBe(before) // the caller's turn data is unchanged after the run
    expect(matchesFixedUatSet(edited)).toBe(false)
    expect(report.turns).toHaveLength(13)
    expect(report.turns.every(t => t.cost === 'known' && t.error === undefined)).toBe(true)
    expect(report.turns[editedIndex].question).toBe(editedText)
    expect(report.stopped).toBeNull()
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('matchesFixedUatSet compares with a private reference: changing the exported UAT_TURNS cannot make an altered set pass', async () => {
    expect(UAT_TURNS).toHaveLength(13)
    const canonicalCopy = UAT_TURNS.map(t => ({ ...t }))
    const originalText = UAT_TURNS[3].text
    const mutable = UAT_TURNS as UatTurn[]
    expect(matchesFixedUatSet(canonicalCopy)).toBe(true)
    try {
      // 1. One text of the exported array is altered. The array and a copy of it now carry the altered text and must both fail.
      mutable[3].text = `${originalText} (mutated)`
      expect(matchesFixedUatSet(UAT_TURNS)).toBe(false)
      expect(matchesFixedUatSet(UAT_TURNS.map(t => ({ ...t })))).toBe(false)
      expect(matchesFixedUatSet(canonicalCopy)).toBe(true) // the real fixed content still passes
      // 2. The altered array handed to runUat does not yield a complete run or a total.
      const { runner } = counting(() => ok(0.001))
      const altered = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
      expect(altered.turns).toHaveLength(13)
      expect(altered.cost.costAccounted).toBe(true)
      expect(altered.cost.complete).toBe(false)
      expect(altered.cost.totalUsd).toBeNull()
      // 3. A turn appended to the exported array: 14 turns are not the fixed set.
      mutable[3].text = originalText
      mutable.push({ id: 'QX', conversation: 'QX', turn: 1, text: 'extra turn' })
      expect(matchesFixedUatSet(UAT_TURNS)).toBe(false)
    } finally {
      mutable.length = 13
      mutable[3].text = originalText
    }
    expect(UAT_TURNS).toHaveLength(13)
    expect(UAT_TURNS[3].text).toBe(originalText)
    expect(matchesFixedUatSet(UAT_TURNS)).toBe(true)
  })
})

describe('runUat: a reused guard that already holds an older reservation', () => {
  const unresolved: Array<[string, (g: BudgetGuard) => void, string]> = [
    ['unknown (markUnknown)', g => g.markUnknown(g.reserve(0.02)), 'cost-unknown'],
    ['unreconciled (settle with NaN)', g => { expect(g.settle(g.reserve(0.02), Number.NaN)).toBe('invalid') }, 'invalid-cost'],
  ]
  for (const [label, makeOlder, blocker] of unresolved) {
    it(`an older ${label} reservation blocks the guard: no paid turn is started, the run is not complete, no total`, async () => {
      const guard = new BudgetGuard(1)
      makeOlder(guard)
      expect(guard.blockedBy).toBe(blocker)
      expect(guard.unresolvedReservedUsd).toBeCloseTo(0.02, 10)
      const { runner, calls } = counting(() => ok(0.001))
      const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
      expect(calls).toEqual([]) // the runner was never invoked
      expect(report.stopped).toMatchObject({ reason: 'budget-refused', atTurn: 'Q1' })
      expect(report.stopped?.detail).toContain(blocker)
      expect(report.turns).toEqual([])
      expect(report.notRun).toHaveLength(13)
      expect(guard.blockedBy).toBe(blocker)
      expect(report.cost.unresolvedReservedUsd).toBeCloseTo(0.02, 10)
      expect(report.cost.costAccounted).toBe(false)
      expect(report.cost.complete).toBe(false)
      expect(report.cost.totalUsd).toBeNull()
    })
  }

  // Changed from the previous version of this test, which expected costAccounted true and totalUsd 0.013 while the older held
  // reservation was still open. Rule now: any reservation still open after the loop (held, unknown or unreconciled) means the
  // cost is not fully accounted for, so no total is stated. What did NOT change: a held reservation does not block the run,
  // is not "unresolved" in the guard's own sense, and `complete` keeps its contract (fixed set, whole run, no error).
  it('an older HELD reservation: it does not block the run, but it stays open, so the cost is not fully accounted for and no total is stated', async () => {
    const guard = new BudgetGuard(1)
    guard.reserve(0.02) // taken and never settled, released or marked unknown
    expect(guard.blockedBy).toBeNull()
    expect(guard.unresolvedReservedUsd).toBe(0)
    const { runner, calls } = counting(() => ok(0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
    expect(calls).toHaveLength(13)
    expect(report.turns).toHaveLength(13)
    expect(report.turns.every(t => t.cost === 'known' && t.usd === 0.001 && t.error === undefined)).toBe(true)
    expect(report.stopped).toBeNull()
    expect(report.notRun).toEqual([])
    expect(guard.blockedBy).toBeNull()
    expect(guard.openReservedUsd).toBeCloseTo(0.02, 10) // the older reservation is still open after the run
    expect(guard.knownUsd).toBe(0.013) // only this run was settled
    expect(report.cost.unresolvedReservedUsd).toBe(0)
    expect(report.cost.costAccounted).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    expect(report.cost.complete).toBe(true) // existing contract: fixed set, whole run, no error; it does not depend on open reservations
  })

  it('an older HELD reservation still counts against the cumulative cap: a run that no longer fits is refused before any call', async () => {
    const guard = new BudgetGuard(0.025)
    guard.reserve(0.02)
    const { runner, calls } = counting(() => ok(0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 }) // 0.02 held + 0.01 > 0.025
    expect(calls).toEqual([])
    expect(report.stopped).toMatchObject({ reason: 'budget-refused', atTurn: 'Q1' })
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('RequestNotSent releases its reservation, so nothing stays open, but the run is still not a completed 13-turn UAT; an ordinary error leaves its reservation open', async () => {
    const guard = new BudgetGuard(1)
    const { runner, calls } = counting(id => { if (id === 'Q5') throw new RequestNotSent('offline'); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
    expect(calls).toHaveLength(13)
    expect(report.turns[4]).toMatchObject({ id: 'Q5', cost: 'none', usd: null, error: 'offline' })
    expect(guard.openReservedUsd).toBe(0)
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    // Contrast: an ordinary error is not proof that nothing was sent, so its reservation stays open.
    const other = new BudgetGuard(1)
    const failing = counting(id => { if (id === 'Q5') throw new Error('boom'); return ok(0.001) })
    const failed = await runUat({ turns: UAT_TURNS, runner: failing.runner, guard: other, maxUsdPerTurn: 0.01 })
    expect(other.openReservedUsd).toBeCloseTo(0.01, 10)
    expect(failed.cost.costAccounted).toBe(false)
    expect(failed.cost.totalUsd).toBeNull()
  })

  it('a budget refusal creates no reservation for the refused call: the runner is not invoked for it and nothing extra stays open (fresh guard)', async () => {
    const guard = new BudgetGuard(0.012)
    const { runner, calls } = counting(() => ok(0.01))
    const report = await runUat({ turns: UAT_TURNS, runner, guard, maxUsdPerTurn: 0.01 })
    expect(calls).toEqual(['Q1']) // Q2 would need 0.01 + 0.01 > 0.012: refused before the runner
    expect(report.stopped).toMatchObject({ reason: 'budget-refused', atTurn: 'Q2' })
    expect(report.notRun[0]).toEqual({ id: 'Q2', reason: 'budget-refused' })
    expect(report.notRun).toHaveLength(12)
    expect(guard.openReservedUsd).toBe(0)
    expect(guard.blockedBy).toBeNull()
    expect(report.cost.costAccounted).toBe(true) // nothing is open; the run is simply incomplete
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    // The refused call took nothing from the cap: 0.01 known + 0.002 still fits a cap of 0.012 exactly.
    expect(() => guard.reserve(0.002)).not.toThrow()
  })
})

describe('hardening: cap and per-turn inputs of the wrong type', () => {
  it('a cap that is a string, undefined, slightly negative or infinite is rejected by the constructor', () => {
    for (const bad of ['10', undefined, -0.000001, Infinity, {}, [], true]) {
      expect(() => new BudgetGuard(bad as unknown as number), String(bad)).toThrow(BudgetRefusal)
    }
  })

  it('reserve() rejects a per-turn maximum that is a string, null, undefined or an object, and a cap of 0 still fits nothing', () => {
    const g = new BudgetGuard(10)
    for (const bad of ['0.01', null, undefined, {}, true]) expect(() => g.reserve(bad as unknown as number), String(bad)).toThrow(BudgetRefusal)
    expect(g.openReservedUsd).toBe(0)
    expect(() => new BudgetGuard(0).reserve(0.000001)).toThrow(BudgetRefusal)
  })
})

describe('hardening: ordinary runner errors never count as "not sent"', () => {
  it('an Error whose message says "not sent" is still an unknown cost: reservation open, run stopped, no total', async () => {
    const { runner, calls } = counting(id => { if (id === 'Q2') throw new Error('request not sent'); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual(['Q1', 'Q2'])
    expect(report.turns.find(t => t.id === 'Q2')).toMatchObject({ cost: 'unknown', usd: null, error: 'request not sent' })
    expect(report.stopped).toMatchObject({ reason: 'cost-unknown', atTurn: 'Q2' })
    expect(report.cost.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
    expect(report.cost.costAccounted).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('an Error that merely carries the name "RequestNotSent" (not an instance of the class) is an unknown cost too', async () => {
    class Impostor extends Error { constructor() { super('nothing was sent'); this.name = 'RequestNotSent' } }
    const { runner } = counting(id => { if (id === 'Q1') throw new Impostor(); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.turns[0]).toMatchObject({ cost: 'unknown', usd: null })
    expect(report.stopped?.reason).toBe('cost-unknown')
    expect(report.cost.totalUsd).toBeNull()
  })

  it('a thrown string or other non-Error value is an unknown cost', async () => {
    const { runner } = counting(id => { if (id === 'Q1') throw 'boom'; return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.turns[0]).toMatchObject({ cost: 'unknown', usd: null, error: 'boom' })
    expect(report.stopped?.reason).toBe('cost-unknown')
  })

  it('an ordinary error on the very first turn stops the run: no later turn is called, all twelve others are listed as not run', async () => {
    const { runner, calls } = counting(id => { if (id === 'Q1') throw new Error('socket hang up'); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual(['Q1'])
    expect(report.turns).toHaveLength(1)
    expect(report.notRun).toHaveLength(12)
    expect(report.notRun.every(n => n.reason === 'cost-unknown')).toBe(true)
    expect(report.cost.knownUsd).toBe(0)
    expect(report.cost.totalUsd).toBeNull()
    expect(report.cost.complete).toBe(false)
  })
})

describe('hardening: a runner that returns something that is not a TurnResult', () => {
  const bad: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'answer'],
    ['an empty object', {}],
    ['no usd key', { text: 'x', toolCalls: [], ms: 1 }],
    ['text not a string', { text: 5, toolCalls: [], ms: 1, usd: 0.001 }],
    ['toolCalls not an array', { text: 'x', toolCalls: 'none', ms: 1, usd: 0.001 }],
    ['a tool call without a name', { text: 'x', toolCalls: [{}], ms: 1, usd: 0.001 }],
    ['ms NaN', { text: 'x', toolCalls: [], ms: Number.NaN, usd: 0.001 }],
    ['ms negative', { text: 'x', toolCalls: [], ms: -1, usd: 0.001 }],
  ]

  it('does not throw out of runUat: the turn is an unknown cost, the reservation stays open, the run stops, no total', async () => {
    for (const [label, value] of bad) {
      const calls: string[] = []
      const runner = (async ({ turn }: { turn: { id: string } }) => { calls.push(turn.id); return value }) as unknown as TurnRunner
      const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
      expect(calls, label).toEqual(['Q1'])
      expect(report.turns[0], label).toMatchObject({ cost: 'unknown', usd: null, error: 'malformed runner result' })
      expect(report.stopped?.reason, label).toBe('cost-unknown')
      expect(report.cost.unresolvedReservedUsd, label).toBeCloseTo(0.01, 10)
      expect(report.cost.totalUsd, label).toBeNull()
    }
  })
})

describe('runUat: a single not-sent turn', () => {
  it('a lone RequestNotSent turn does not stop the run, but the run is not complete and no total is stated', async () => {
    const { runner, calls } = counting(id => { if (id === 'Q5') throw new RequestNotSent('offline'); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toHaveLength(13)
    expect(report.stopped).toBeNull()
    expect(report.notRun).toEqual([])
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    expect(report.cost.knownUsd).toBeCloseTo(0.012, 10)
  })
})

describe('runUat (mock runner): normal flow', () => {
  it('runs all 13 turns, records answer, time, tool calls and cost, and reports an exact total', async () => {
    const runner = createMockRunner({
      Q3: { text: 'a3', toolCalls: [{ name: 'search_products' }], ms: 4000, usd: 0.003 },
      Q6: { text: 'a6', toolCalls: [{ name: 'web_search' }, { name: 'web_search' }], ms: 9000, usd: 0.006 },
    })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(report.stopped).toBeNull()
    expect(report.turns).toHaveLength(13)
    expect(report.notRun).toEqual([])
    expect(report.turns.find(t => t.id === 'Q6')).toMatchObject({ answer: 'a6', ms: 9000, toolCalls: 2, toolNames: ['web_search', 'web_search'], usd: 0.006, cost: 'known' })
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(true)
    expect(report.cost.totalUsd).toBeCloseTo(0.009, 10)
    expect(report.cost.totalUsd).toBe(report.cost.knownUsd)
  })

  it('gives a turn only the earlier turns of its own conversation as history', async () => {
    const seen: Record<string, ChatMessage[]> = {}
    const runner: TurnRunner = async ({ turn, history }) => {
      seen[turn.id] = [...history]
      return { text: `answer to ${turn.id}`, toolCalls: [], ms: 1, usd: 0 }
    }
    await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(seen['Q11.1']).toEqual([])
    expect(seen['Q11.2']).toEqual([
      { role: 'user', content: UAT_TURNS.find(t => t.id === 'Q11.1')!.text },
      { role: 'assistant', content: 'answer to Q11.1' },
    ])
    expect(seen.Q12).toEqual([])
    expect(seen.Q4).toEqual([])
  })

  it('holds the reservation while the runner is running', async () => {
    const guard = new BudgetGuard(1)
    const during: number[] = []
    const runner: TurnRunner = async () => { during.push(guard.openReservedUsd); return ok(0.004) }
    await runUat({ turns: UAT_TURNS.slice(0, 3), runner, guard, maxUsdPerTurn: 0.01 })
    expect(during).toEqual([0.01, 0.01, 0.01])
    expect(guard.openReservedUsd).toBe(0)
  })
})

describe('runUat: budget', () => {
  it('no cap: the runner is never called and the run stops before the first turn', async () => {
    const { runner, calls } = counting(() => ok())
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(null), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual([])
    expect(report.stopped).toMatchObject({ reason: 'budget-refused', atTurn: 'Q1' })
    expect(report.turns).toEqual([])
    expect(report.notRun).toHaveLength(13)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('stops before the call that could pass the cap (old behaviour kept)', async () => {
    const { runner, calls } = counting(() => ok(0.02))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(0.05), maxUsdPerTurn: 0.02 })
    expect(calls).toHaveLength(2)
    expect(report.turns).toHaveLength(2)
    expect(report.stopped?.reason).toBe('budget-refused')
    expect(report.cost.knownUsd).toBeCloseTo(0.04, 10)
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('a cost below the reservation frees the surplus: two turns of 0.01 under a 0.04 reservation fit a 0.05 cap', async () => {
    const { runner, calls } = counting(() => ok(0.01))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(0.05), maxUsdPerTurn: 0.04 })
    expect(calls).toHaveLength(2)
    expect(report.cost.knownUsd).toBeCloseTo(0.02, 10)
    expect(report.stopped?.reason).toBe('budget-refused')
  })

  it('a cost exactly at the reservation reconciles and the run goes on', async () => {
    const { runner, calls } = counting(() => ok(0.02))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.02 })
    expect(calls).toHaveLength(13)
    expect(report.stopped).toBeNull()
    expect(report.turns.some(t => t.exceededReservation)).toBe(false)
  })

  it('a cost above the reservation is flagged, kept in the totals, and no further turn runs', async () => {
    const { runner, calls } = counting(id => ok(id === 'Q3' ? 0.05 : 0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.02 })
    expect(calls).toEqual(['Q1', 'Q2', 'Q3'])
    expect(report.turns.find(t => t.id === 'Q3')).toMatchObject({ usd: 0.05, cost: 'known', exceededReservation: true })
    expect(report.stopped).toMatchObject({ reason: 'cost-exceeded-reservation', atTurn: 'Q3' })
    expect(report.notRun).toHaveLength(10)
    expect(report.notRun[0]).toEqual({ id: 'Q4', reason: 'cost-exceeded-reservation' })
    expect(report.cost.knownUsd).toBeCloseTo(0.052, 10)
    expect(report.cost.costAccounted).toBe(true)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('a per-turn maximum that is NaN, infinite, negative or 0 stops the run before any call', async () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, -1, 0]) {
      const { runner, calls } = counting(() => ok())
      const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(10), maxUsdPerTurn: bad })
      expect(calls, String(bad)).toEqual([])
      expect(report.stopped?.reason, String(bad)).toBe('budget-refused')
    }
  })

  it('a cap of 0 runs nothing: the runner is never called', async () => {
    const { runner, calls } = counting(() => ok())
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(0), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual([])
    expect(report.stopped?.reason).toBe('budget-refused')
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('a reported cost of exactly 0 is valid and the run completes with a total of 0', async () => {
    const { runner, calls } = counting(() => ok(0))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toHaveLength(13)
    expect(report.stopped).toBeNull()
    expect(report.cost).toMatchObject({ knownUsd: 0, costAccounted: true, complete: true, totalUsd: 0 })
  })

  it('a reported cost that is NaN, negative, infinite, a string, null or undefined stops the run with the reservation open', async () => {
    for (const bad of [Number.NaN, -1, Infinity, -Infinity, '0.01', null, undefined]) {
      const { runner, calls } = counting(() => ({ text: 'x', toolCalls: [], ms: 1, usd: bad as unknown as number }))
      const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
      expect(calls, String(bad)).toEqual(['Q1'])
      expect(report.stopped?.reason, String(bad)).toBe('invalid-cost')
      expect(report.turns[0], String(bad)).toMatchObject({ cost: 'unknown', usd: null })
      expect(report.cost.unresolvedReservedUsd, String(bad)).toBeCloseTo(0.01, 10)
      expect(report.cost.costAccounted, String(bad)).toBe(false)
      expect(report.cost.totalUsd, String(bad)).toBeNull()
    }
  })

  it('floating-point edge: three turns of 0.1 fit a cap of 0.3 and a fourth does not', async () => {
    const { runner, calls } = counting(() => ok(0.1))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(0.3), maxUsdPerTurn: 0.1 })
    expect(calls).toHaveLength(3)
    expect(report.cost.knownUsd).toBeCloseTo(0.3, 10)
    expect(report.stopped?.reason).toBe('budget-refused')
  })
})

describe('runUat: failures and unknown cost', () => {
  it('an ordinary runner error leaves the cost unknown, keeps the reservation open and stops the run', async () => {
    const { runner, calls } = counting(id => { if (id === 'Q2') throw new Error('socket hang up'); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual(['Q1', 'Q2'])
    expect(report.turns.find(t => t.id === 'Q2')).toMatchObject({ cost: 'unknown', usd: null, toolCalls: null, toolNames: null, error: 'socket hang up' })
    expect(report.stopped).toMatchObject({ reason: 'cost-unknown', atTurn: 'Q2' })
    expect(report.notRun).toHaveLength(11)
    expect(report.cost.unknownTurns).toEqual(['Q2'])
    expect(report.cost.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
    expect(report.cost.knownUsd).toBeCloseTo(0.001, 10)
    expect(report.cost.costAccounted).toBe(false)
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('an invalid reported cost stops the run and is reported as not reconciled', async () => {
    const { runner, calls } = counting(id => ok(id === 'Q2' ? Number.NaN : 0.001))
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toEqual(['Q1', 'Q2'])
    expect(report.turns.find(t => t.id === 'Q2')).toMatchObject({ cost: 'unknown', usd: null, answer: 'ok' })
    expect(report.stopped).toMatchObject({ reason: 'invalid-cost', atTurn: 'Q2' })
    expect(report.cost.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('only the typed RequestNotSent releases the reservation and lets the run go on; its cost is "none", not 0', async () => {
    const { runner, calls } = counting(id => { if (id === 'Q1') throw new RequestNotSent('offline'); return ok(0.001) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).toHaveLength(13)
    expect(report.turns[0]).toMatchObject({ id: 'Q1', cost: 'none', usd: null, error: 'offline' })
    expect(report.stopped).toBeNull()
    expect(report.cost.unresolvedReservedUsd).toBe(0)
    expect(report.cost.costAccounted).toBe(true)
    // A turn that carries an error makes the run incomplete, so no total is stated (changed from 0.012: rule "complete = no turn has an error").
    expect(report.cost.complete).toBe(false)
    expect(report.cost.totalUsd).toBeNull()
    expect(report.cost.knownUsd).toBeCloseTo(0.012, 10)
  })

  it('Q11.1 fails with an unknown cost: Q11.2 does not run (no follow-up without its history), earlier costs are kept', async () => {
    const { runner, calls } = counting(id => { if (id === 'Q11.1') throw new Error('boom'); return ok(0.002) })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(calls).not.toContain('Q11.2')
    expect(calls.at(-1)).toBe('Q11.1')
    expect(report.notRun.map(n => n.id)).toEqual(['Q11.2', 'Q12'])
    expect(report.cost.knownUsd).toBeCloseTo(0.02, 10)
    expect(report.cost.totalUsd).toBeNull()
  })

  it('Q11.1 provably not sent: Q11.2 is still not run, with the reason, and the other turns continue', async () => {
    const seen: Record<string, ChatMessage[]> = {}
    const runner: TurnRunner = async ({ turn, history }) => {
      seen[turn.id] = [...history]
      if (turn.id === 'Q11.1') throw new RequestNotSent()
      return ok(0.001)
    }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(seen['Q11.2']).toBeUndefined()
    expect(report.notRun).toEqual([{ id: 'Q11.2', reason: 'previous-turn-failed' }])
    expect(seen.Q12).toEqual([])
    expect(report.turns).toHaveLength(12)
  })
})

describe('summary and metrics', () => {
  it('percentile is nearest-rank and null for an empty list', () => {
    expect(percentile([], 90)).toBeNull()
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9)
    expect(percentile([5], 90)).toBe(5)
  })

  it('summarize counts answered turns, tool calls, p90 and cost; a provably-not-sent turn adds nothing, the cost is accounted, but the run is incomplete so no total is stated', async () => {
    const runner: TurnRunner = async ({ turn }) => {
      if (turn.id === 'Q1') throw new RequestNotSent('offline')
      const n = Number(turn.id.replace(/\D/g, '').slice(0, 2)) || 1
      return { text: 't', toolCalls: n % 2 === 0 ? [{ name: 'web_search' }] : [], ms: 100 * n, usd: 0.001 }
    }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    const s = summarize(report)
    expect(s.turns).toBe(13)
    expect(s.errors).toBe(1)
    expect(s.answered).toBe(12)
    expect(s.costAccounted).toBe(true)
    // Changed from complete=true / totalUsd=0.012: a run with an errored turn is not complete (rule "complete = no turn has an error").
    expect(s.complete).toBe(false)
    expect(s.totalUsd).toBeNull()
    expect(s.knownUsd).toBeCloseTo(0.012, 10)
    expect(s.knownSubtotalUsd).toBeCloseTo(0.012, 10)
    expect(s.totalToolCalls).toBe(s.turnsWithToolCall)
    expect(s.p90Ms).not.toBeNull()
  })

  it('summarize never reports an exact total when a turn has an unknown cost', async () => {
    const { runner } = counting(id => { if (id === 'Q3') throw new Error('timeout'); return ok(0.004) })
    const s = summarize(await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 }))
    expect(s.costAccounted).toBe(false)
    expect(s.complete).toBe(false)
    expect(s.totalUsd).toBeNull()
    expect(s.knownUsd).toBeCloseTo(0.008, 10)
    expect(s.unknownCostTurns).toBe(1)
    expect(s.unresolvedReservedUsd).toBeCloseTo(0.01, 10)
    expect(s.stoppedReason).toBe('cost-unknown')
    expect(s.errors).toBe(1)
    expect(s.notRun).toBe(10)
  })

  it('toolCallRate uses only the labelled ids and is null when none of them ran', async () => {
    const runner = createMockRunner({
      Q6: { toolCalls: [{ name: 'web_search' }] },
      Q12: { toolCalls: [] },
    })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), maxUsdPerTurn: 0.01 })
    expect(toolCallRate(report, new Set(['Q6', 'Q12']))).toEqual({ rate: 0.5, fresh: 2, withTool: 1 })
    expect(toolCallRate(report, new Set())).toEqual({ rate: null, fresh: 0, withTool: 0 })
    expect(toolCallRate(report, new Set(['not-a-turn']))).toEqual({ rate: null, fresh: 0, withTool: 0 })
  })
})
