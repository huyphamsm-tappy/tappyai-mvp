import { describe, it, expect } from 'vitest'
import { deriveChatRoutingHints, CHAT_HINT_FIELDS, type ChatTurnFacts } from './chatHints'
import { deriveSignals } from './signals'

// ── STEP 6: the planning signal gap ──────────────────────────────────────────
//
// P1 shipped the router but route.ts passed no hints, so a planning turn was
// observed as an ordinary tool dialogue and the empty-premium-tier finding
// never surfaced in shadow telemetry.
//
// This maps facts the chat route ALREADY computed onto the routing contract.
// It re-detects nothing: planningIntent, hasImage, budget and lang are inputs,
// not things this function works out for itself.

const facts = (over: Partial<ChatTurnFacts> = {}): ChatTurnFacts => ({
  noToolTurn: false,
  planningIntent: null,
  hasImage: false,
  hasBudget: false,
  lang: 'vi',
  ...over,
})

describe('task class comes from signals the route already has', () => {
  it('a no-tool turn is conversational', () => {
    expect(deriveChatRoutingHints(facts({ noToolTurn: true })).task).toBe('conversational')
  })

  it('an ordinary tool turn is a tool dialogue', () => {
    expect(deriveChatRoutingHints(facts()).task).toBe('tool_dialogue')
  })

  it.each(['trip', 'evening'] as const)('a %s plan is a planning turn', (kind) => {
    expect(deriveChatRoutingHints(facts({ planningIntent: kind })).task).toBe('planning')
  })

  it('a no-tool turn stays conversational even if planning words appear', () => {
    // noToolTurn is the real capability shape (maxSteps:1, no tools declared).
    // Claiming `planning` there would ask the router for a model to do work
    // this turn is not configured to do.
    expect(deriveChatRoutingHints(facts({ noToolTurn: true, planningIntent: 'trip' })).task).toBe('conversational')
  })
})

describe('capability and risk', () => {
  it('an image turn requires vision, whichever method carries it', () => {
    expect(deriveChatRoutingHints(facts({ hasImage: true })).needsVision).toBe(true)
    expect(deriveChatRoutingHints(facts()).needsVision).toBe(false)
  })

  it('money on the line is elevated risk', () => {
    // Same trigger moneyGuard uses: a turn carrying a budget makes a wrong
    // number cost the user something concrete.
    expect(deriveChatRoutingHints(facts({ hasBudget: true })).risk).toBe('elevated')
    expect(deriveChatRoutingHints(facts()).risk).toBe('routine')
  })

  it('passes the response language through untouched', () => {
    expect(deriveChatRoutingHints(facts({ lang: 'en' })).lang).toBe('en')
  })

  it('a streamed chat turn is interactive', () => {
    expect(deriveChatRoutingHints(facts()).latencyBudget).toBe('interactive')
  })
})

describe('complexity is NOT duplicated here', () => {
  it('leaves complexity to the task-class default rather than restating it', () => {
    expect(deriveChatRoutingHints(facts({ planningIntent: 'trip' })).complexity).toBeUndefined()
  })

  it('so a planning turn still lands on high complexity end-to-end', () => {
    const hints = deriveChatRoutingHints(facts({ planningIntent: 'trip' }))
    const s = deriveSignals({ method: 'stream', hasTools: true, approxInputTokens: 5000, hints })
    expect(s.taskClass).toBe('planning')
    expect(s.complexity).toBe('high')
  })

  it('and a plain tool turn lands on medium', () => {
    const s = deriveSignals({ method: 'stream', hasTools: true, approxInputTokens: 5000, hints: deriveChatRoutingHints(facts()) })
    expect(s.complexity).toBe('medium')
  })
})

describe('hints cannot carry anything the router must not see', () => {
  it('emits only the closed hint field set', () => {
    for (const f of [facts(), facts({ noToolTurn: true }), facts({ planningIntent: 'trip', hasImage: true, hasBudget: true })]) {
      const keys = Object.keys(deriveChatRoutingHints(f))
      for (const k of keys) expect(CHAT_HINT_FIELDS).toContain(k)
    }
  })

  it('has no provider or model field', () => {
    const keys = Object.keys(deriveChatRoutingHints(facts()))
    expect(keys).not.toContain('providerId')
    expect(keys).not.toContain('modelId')
    expect(keys).not.toContain('provider')
    expect(keys).not.toContain('model')
  })

  it('has no field that could carry user text, tool output or memory', () => {
    for (const f of CHAT_HINT_FIELDS) {
      expect(f).not.toMatch(/text|prompt|message|content|query|memory|result/i)
    }
  })

  it('accepts no free-text input at all — the fact set is booleans and enums', () => {
    const f = facts() as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(f)) {
      if (k === 'lang') { expect(typeof v).toBe('string'); continue }
      if (k === 'planningIntent') { expect(v === null || v === 'trip' || v === 'evening').toBe(true); continue }
      expect(typeof v).toBe('boolean')
    }
  })
})

describe('determinism', () => {
  it('same facts produce identical hints, 200 times', () => {
    const f = facts({ planningIntent: 'evening', hasBudget: true, lang: 'en' })
    const first = JSON.stringify(deriveChatRoutingHints(f))
    for (let i = 0; i < 200; i++) expect(JSON.stringify(deriveChatRoutingHints(f))).toBe(first)
  })
})
