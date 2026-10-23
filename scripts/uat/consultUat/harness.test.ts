// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { UAT_TURNS } from './questions'
import {
  BudgetGuard, BudgetRefusal, createMockRunner, percentile, runUat, summarize, toolCallRate,
  type ChatMessage, type TurnRunner,
} from './harness'

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

describe('BudgetGuard', () => {
  it('refuses every call when no cap was supplied', () => {
    const g = new BudgetGuard(null)
    expect(() => g.reserve(0)).toThrow(BudgetRefusal)
  })

  it('checks the running total before a call, not after', () => {
    const g = new BudgetGuard(0.05)
    g.reserve(0.02); g.record(0.02)
    g.reserve(0.02); g.record(0.02)
    expect(() => g.reserve(0.02)).toThrow(BudgetRefusal)
    expect(g.spent).toBeCloseTo(0.04, 10)
  })

  it('rejects a non-finite or negative estimate', () => {
    const g = new BudgetGuard(1)
    expect(() => g.reserve(Number.NaN)).toThrow(BudgetRefusal)
    expect(() => g.reserve(-1)).toThrow(BudgetRefusal)
  })
})

describe('runUat (mock runner)', () => {
  it('runs all 13 turns, records answer, time, tool calls and cost', async () => {
    const runner = createMockRunner({
      Q3: { text: 'a3', toolCalls: [{ name: 'search_products' }], ms: 4000, usd: 0.003 },
      Q6: { text: 'a6', toolCalls: [{ name: 'web_search' }, { name: 'web_search' }], ms: 9000, usd: 0.006 },
    })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), estimateUsdPerTurn: 0.01 })
    expect(report.stoppedBy).toBeNull()
    expect(report.turns).toHaveLength(13)
    const q6 = report.turns.find(t => t.id === 'Q6')
    expect(q6).toMatchObject({ answer: 'a6', ms: 9000, toolCalls: 2, toolNames: ['web_search', 'web_search'], usd: 0.006 })
    expect(report.spentUsd).toBeCloseTo(0.009, 10)
  })

  it('gives a turn only the earlier turns of its own conversation as history', async () => {
    const seen: Record<string, ChatMessage[]> = {}
    const runner: TurnRunner = async ({ turn, history }) => {
      seen[turn.id] = [...history]
      return { text: `answer to ${turn.id}`, toolCalls: [], ms: 1, usd: 0 }
    }
    await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), estimateUsdPerTurn: 0.01 })
    expect(seen['Q11.1']).toEqual([])
    expect(seen['Q11.2']).toEqual([
      { role: 'user', content: UAT_TURNS.find(t => t.id === 'Q11.1')!.text },
      { role: 'assistant', content: 'answer to Q11.1' },
    ])
    expect(seen.Q12).toEqual([])
    expect(seen.Q4).toEqual([])
  })

  it('makes no call and stops at once when no cap was supplied', async () => {
    let calls = 0
    const runner: TurnRunner = async () => { calls++; return { text: '', toolCalls: [], ms: 0, usd: 0 } }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(null), estimateUsdPerTurn: 0.01 })
    expect(calls).toBe(0)
    expect(report.stoppedBy).toBe('budget')
    expect(report.turns).toEqual([])
  })

  it('stops before the call that could pass the cap', async () => {
    let calls = 0
    const runner: TurnRunner = async () => { calls++; return { text: 'x', toolCalls: [], ms: 1, usd: 0.02 } }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(0.05), estimateUsdPerTurn: 0.02 })
    expect(calls).toBe(2)
    expect(report.turns).toHaveLength(2)
    expect(report.stoppedBy).toBe('budget')
  })

  it('records a failing turn as an error and goes on with the next one', async () => {
    const runner: TurnRunner = async ({ turn }) => {
      if (turn.id === 'Q2') throw new Error('provider down')
      return { text: 'ok', toolCalls: [], ms: 5, usd: 0 }
    }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), estimateUsdPerTurn: 0.01 })
    expect(report.turns).toHaveLength(13)
    expect(report.turns.find(t => t.id === 'Q2')).toMatchObject({ error: 'provider down', answer: '', toolCalls: 0 })
    expect(report.turns.find(t => t.id === 'Q3')?.error).toBeUndefined()
  })
})

describe('summary and metrics', () => {
  it('percentile is nearest-rank and null for an empty list', () => {
    expect(percentile([], 90)).toBeNull()
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9)
    expect(percentile([5], 90)).toBe(5)
  })

  it('summarize counts answered turns, tool calls, p90 and cost, leaving errors out of the time and cost', async () => {
    const runner: TurnRunner = async ({ turn }) => {
      if (turn.id === 'Q1') throw new Error('boom')
      const n = Number(turn.id.replace(/\D/g, '').slice(0, 2)) || 1
      return { text: 't', toolCalls: n % 2 === 0 ? [{ name: 'web_search' }] : [], ms: 100 * n, usd: 0.001 }
    }
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), estimateUsdPerTurn: 0.01 })
    const s = summarize(report)
    expect(s.turns).toBe(13)
    expect(s.errors).toBe(1)
    expect(s.answered).toBe(12)
    expect(s.totalUsd).toBeCloseTo(0.012, 10)
    expect(s.totalToolCalls).toBe(s.turnsWithToolCall)
    expect(s.p90Ms).not.toBeNull()
  })

  it('toolCallRate uses only the labelled ids and is null when none of them ran', async () => {
    const runner = createMockRunner({
      Q6: { toolCalls: [{ name: 'web_search' }] },
      Q12: { toolCalls: [] },
    })
    const report = await runUat({ turns: UAT_TURNS, runner, guard: new BudgetGuard(1), estimateUsdPerTurn: 0.01 })
    expect(toolCallRate(report, new Set(['Q6', 'Q12']))).toEqual({ rate: 0.5, fresh: 2, withTool: 1 })
    expect(toolCallRate(report, new Set())).toEqual({ rate: null, fresh: 0, withTool: 0 })
    expect(toolCallRate(report, new Set(['not-a-turn']))).toEqual({ rate: null, fresh: 0, withTool: 0 })
  })
})
