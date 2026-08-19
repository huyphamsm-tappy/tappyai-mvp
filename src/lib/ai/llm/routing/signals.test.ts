import { describe, it, expect } from 'vitest'
import { deriveSignals, estimateTokens, SIGNAL_FIELDS } from './signals'

// ── Signal derivation (P1) ───────────────────────────────────────────────────
// Deterministic, no LLM, no I/O. Everything here already exists in the codebase
// or is knowable from the call itself — deriving it costs nothing extra.

const base = { method: 'generate' as const, hasTools: false, approxInputTokens: 100 }

describe('defaults come from the CALL, not from a vendor', () => {
  it('vision() is a vision task that needs vision', () => {
    const s = deriveSignals({ ...base, method: 'vision' })
    expect(s.taskClass).toBe('vision')
    expect(s.needsVision).toBe(true)
    expect(s.needsStreaming).toBe(false)
  })

  it('stream() with tools is a tool dialogue that needs both', () => {
    const s = deriveSignals({ ...base, method: 'stream', hasTools: true })
    expect(s.taskClass).toBe('tool_dialogue')
    expect(s.needsTools).toBe(true)
    expect(s.needsStreaming).toBe(true)
  })

  it('stream() without tools is conversational and needs no tools', () => {
    const s = deriveSignals({ ...base, method: 'stream', hasTools: false })
    expect(s.taskClass).toBe('conversational')
    expect(s.needsTools).toBe(false)
    expect(s.needsStreaming).toBe(true)
  })

  it('generate() is short generation, batched', () => {
    const s = deriveSignals(base)
    expect(s.taskClass).toBe('short_generation')
    expect(s.latencyBudget).toBe('batch')
  })

  it('a streamed turn is interactive — a human is waiting on it', () => {
    expect(deriveSignals({ ...base, method: 'stream' }).latencyBudget).toBe('interactive')
  })
})

describe('caller hints express the JOB', () => {
  it('an explicit task class wins over the derived one', () => {
    expect(deriveSignals({ ...base, hints: { task: 'extraction' } }).taskClass).toBe('extraction')
  })

  it('planning defaults to high complexity — derived, never "planning means vendor X"', () => {
    expect(deriveSignals({ ...base, hints: { task: 'planning' } }).complexity).toBe('high')
  })

  it('an explicit complexity overrides the task-class default', () => {
    const s = deriveSignals({ ...base, hints: { task: 'planning', complexity: 'medium' } })
    expect(s.complexity).toBe('medium')
  })

  it('risk defaults to routine and is caller-declared', () => {
    expect(deriveSignals(base).risk).toBe('routine')
    expect(deriveSignals({ ...base, hints: { risk: 'elevated' } }).risk).toBe('elevated')
  })

  it('language defaults to the product default and is overridable', () => {
    expect(deriveSignals(base).lang).toBe('vi')
    expect(deriveSignals({ ...base, hints: { lang: 'en' } }).lang).toBe('en')
  })

  it('a hint may ADD the vision requirement (chat streams images via stream())', () => {
    expect(deriveSignals({ ...base, method: 'stream', hints: { needsVision: true } }).needsVision).toBe(true)
  })

  it('a hint can never WAIVE a requirement the method itself implies', () => {
    // vision() needs vision whatever the caller claims. Requirements may only
    // be added by hints, never relaxed — otherwise a hint becomes a downgrade.
    expect(deriveSignals({ ...base, method: 'vision', hints: { needsVision: false } }).needsVision).toBe(true)
  })

  it('hints cannot inject a provider or model — there is no field for it', () => {
    const s = deriveSignals({ ...base, hints: { task: 'extraction' } }) as unknown as Record<string, unknown>
    expect(Object.keys(s).sort()).toEqual([...SIGNAL_FIELDS].sort())
    expect(Object.keys(s)).not.toContain('providerId')
    expect(Object.keys(s)).not.toContain('modelId')
  })
})

describe('signals carry no raw content', () => {
  it('exposes only the closed field set', () => {
    expect([...SIGNAL_FIELDS].sort()).toEqual([
      'approxInputTokens', 'complexity', 'lang', 'latencyBudget', 'maxOutputTokens',
      'needsStreaming', 'needsStructuredOutput', 'needsTools', 'needsVision',
      'risk', 'securityVerdict', 'taskClass',
    ])
  })

  it('has no field that could hold a prompt, message or tool result', () => {
    for (const f of SIGNAL_FIELDS) {
      expect(f).not.toMatch(/text|prompt|message|content|query|result|input$/i)
    }
  })

  it('starts every request at securityVerdict "clean" — P1 does not classify yet', () => {
    expect(deriveSignals(base).securityVerdict).toBe('clean')
  })
})

describe('token estimation is conservative by design', () => {
  it('over-estimates rather than under-estimates', () => {
    // Vietnamese is denser per character than English. For a CONTEXT-WINDOW
    // filter, over-estimating fails toward a larger model; under-estimating
    // picks one the request overflows.
    expect(estimateTokens('a'.repeat(300))).toBeGreaterThanOrEqual(100)
  })

  it('is zero for empty input and never negative', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('x')).toBeGreaterThanOrEqual(0)
  })

  it('grows monotonically with length', () => {
    expect(estimateTokens('a'.repeat(1000))).toBeGreaterThan(estimateTokens('a'.repeat(100)))
  })
})

describe('determinism', () => {
  it('same input produces an identical signal set, 200 times', () => {
    const input = { ...base, method: 'stream' as const, hasTools: true, hints: { risk: 'elevated' as const } }
    const first = JSON.stringify(deriveSignals(input))
    for (let i = 0; i < 200; i++) expect(JSON.stringify(deriveSignals(input))).toBe(first)
  })

  it('maxOutputTokens reflects what the caller asked for', () => {
    expect(deriveSignals({ ...base, maxTokens: 4096 }).maxOutputTokens).toBe(4096)
  })
})
