import { describe, it, expect } from 'vitest'
import { parseUsage, stagesOf, summarize, percentile, render } from './latencyReport.mjs'

const rec = (o: Record<string, unknown> = {}) => ({ type: 'tappyai_usage', intent: 'tool', preModelMs: 2000, firstStepFinishMs: 2600, toolMs: 3500, modelFinishMs: 9000, postModelMs: 2500, ttftMs: 7000, elapsedMs: 11500, ...o })

describe('latency report', () => {
  it('finds usage records inside noisy log lines and ignores everything else', () => {
    const text = [
      'ordinary line',
      `2026-11-21T10:00:00Z info ${JSON.stringify(rec())} trailing noise`,
      JSON.stringify({ type: 'tappyai_turn_cost', usd: 1 }),
      JSON.stringify(rec({ elapsedMs: 3000 })),
    ].join('\n')
    const r = parseUsage(text)
    expect(r.length).toBe(2)
    expect(r[1].elapsedMs).toBe(3000)
  })

  it('derives the stages from the marks', () => {
    expect(stagesOf(rec())).toEqual({ prepare: 2000, firstModelRound: 600, tools: 3500, writeAnswer: 6400, tail: 2500, firstText: 7000, total: 11500 })
  })

  it('leaves a stage empty when a mark is missing or inconsistent, instead of inventing it', () => {
    const s = stagesOf(rec({ firstStepFinishMs: null, modelFinishMs: 1000, preModelMs: 2000 }))
    expect(s.firstModelRound).toBeNull()
    expect(s.writeAnswer).toBeNull()
    expect(s.prepare).toBe(2000)
  })

  it('percentiles and the summary count only the records that have the mark', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9)
    const s = summarize([rec({ elapsedMs: 4000 }), rec({ elapsedMs: 8000 }), rec({ elapsedMs: undefined })])
    expect(s.count).toBe(3)
    const total = (s.stages as Record<string, { n: number; max: number }>).total
    expect(total.n).toBe(2)
    expect(total.max).toBe(8000)
  })

  it('renders a readable table, optionally grouped', () => {
    const out = render([rec(), rec({ intent: 'chitchat', elapsedMs: 2800 })], 'intent')
    expect(out).toContain('intent = tool')
    expect(out).toContain('intent = chitchat')
    expect(out).toContain('TỔNG đến byte cuối')
  })
})
