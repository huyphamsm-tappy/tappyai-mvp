import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSystem, buildSystemSimple } from './promptBuilder'
import { isSimpleQuery, classifyIntent } from './intent'
import { shouldExtractMemory } from './memoryGate'
import { deriveNeedProfile } from './consultative/needProfile'
import { renderNeedBrief } from './consultative/needBrief'
import { sanitizePayload, ALLOWED_PAYLOAD_KEYS, type UsageEvent } from '@/lib/observability/events'

// ── V3 Phase 2 — cost, asserted as PROPERTIES rather than intentions ─────────
//
// Everything here is about spend, and spend has exactly three levers in this
// application: which model serves a turn, how many tokens reach it, and how
// many times we pay for them. The suite is organised that way.
//
// Model IDENTITY is deliberately not re-asserted — providers/modelIdentity.test.ts
// owns it, and a second copy of that mapping is a copy that can drift.
//
// Two facts about the cost model this suite has to keep true, because neither is
// visible from any single call site:
//
//   · The prompt cache is keyed on a PREFIX. Anything stable that lands after
//     the breakpoint is re-billed at full rate on every request, and anything
//     request-shaped that lands before it destroys the prefix for everyone.
//   · A retried attempt re-bills the entire prompt and is INVISIBLE downstream:
//     `llmCalls` counts steps, `usage` reports the attempt that succeeded. So
//     the ceiling has to be a stated number, not an inherited default.

const code = (f: string) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

const ROUTE = 'src/app/api/chat/route.ts'
const user = (...t: string[]) => t.map(content => ({ role: 'user', content }))

// ═══════════════════════════════════════════════════════════════════════════
// 1 · MODEL SELECTION
// ═══════════════════════════════════════════════════════════════════════════

describe('model selection — the routing rule is a rule, not a coincidence', () => {
  it('the route picks the role from planning intent, image, then query simplicity', () => {
    expect(code(ROUTE)).toMatch(
      /const role: ModelRole = \(planningIntent \|\| hasImage\) \? 'planning'\s*:\s*isSimpleQuery\([^)]*\) \? 'fast'\s*:\s*'smart'/,
    )
  })

  it('a short opening greeting is simple; a place request never is', () => {
    expect(isSimpleQuery('Chào bạn', true)).toBe(true)
    expect(isSimpleQuery('Tìm quán phở ngon ở Quận 1', true)).toBe(false)
  })

  it('🔑 "simple" requires the FIRST message — a later short turn carries context and does not', () => {
    // The cheap role is only safe when there is no conversation behind the turn.
    expect(isSimpleQuery('Chào bạn', false)).toBe(false)
  })

  it('a long message is never simple however harmless it looks', () => {
    expect(isSimpleQuery('a'.repeat(100), true)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2 · CACHE BOUNDARY — what may sit in front of the breakpoint
// ═══════════════════════════════════════════════════════════════════════════

describe('cache boundary — `shared` is the same bytes for everyone, forever', () => {
  const base = () => buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)

  it('no input the route can vary changes it', () => {
    const ref = base().shared
    const brief = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1, 6 người, 500k')))
    for (const v of [
      buildSystem(null, 'unknown', true, '', 'en', '', null, null, false),
      buildSystem({ min: 0, max: 500_000, type: 'under' }, 'offline', false, 'MEM', 'vi', 'PREFS', { lat: 1, lng: 2 }, 'trip', true, 'comparison'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, 'refinement'),
      buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, undefined, brief),
    ]) expect(v.shared).toBe(ref)
  })

  it('🔑 the need brief lands AFTER the breakpoint — it is per-request by construction', () => {
    const brief = renderNeedBrief(deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1, 6 người, 500k')))
    expect(brief.length).toBeGreaterThan(0)
    const built = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false, undefined, brief)
    expect(built.dynamic).toContain('HE THONG DA HIEU NHU CAU NAY')
    expect(built.shared).not.toContain('HE THONG DA HIEU NHU CAU NAY')
  })

  it('🔑 nothing request-shaped leaks into the cached prefix', () => {
    // Each of these WOULD fork a cache lineage per user, per minute or per turn.
    const built = buildSystem(
      { min: 0, max: 500_000, type: 'under' }, 'offline', false,
      'MEMORY-BLOCK-SENTINEL', 'vi', 'PREFS-SENTINEL',
      { lat: 10.77, lng: 106.7, address: 'ADDRESS-SENTINEL' }, 'trip', false, 'refinement',
      'CONSULTATIVE-SENTINEL',
    )
    for (const sentinel of [
      'MEMORY-BLOCK-SENTINEL', 'PREFS-SENTINEL', 'ADDRESS-SENTINEL', 'CONSULTATIVE-SENTINEL',
    ]) {
      expect(built.shared, `${sentinel} must not be cached`).not.toContain(sentinel)
      expect(built.dynamic, `${sentinel} must still reach the model`).toContain(sentinel)
    }
  })

  it('the clock is request-shaped and stays out of the prefix', () => {
    expect(base().shared).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(base().dynamic).toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('the cached prefix is big enough to be worth caching at all', () => {
    // Anthropic ignores the marker below its minimum cacheable size, so a
    // rulebook that shrank past it would silently stop being cached while every
    // other assertion here still passed.
    expect(base().shared.length).toBeGreaterThan(20_000)
  })

  it('the chitchat path shares no prefix and is not meant to', () => {
    // ~1k characters: far under the minimum cacheable size, so it is honestly
    // uncached rather than pretending to be a second lineage.
    expect(buildSystemSimple('vi', '').length).toBeLessThan(4_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3 · CONTEXT — only what the turn needs
// ═══════════════════════════════════════════════════════════════════════════

describe('context — the turn pays for what it uses and no more', () => {
  it('history is bounded, so a long conversation cannot grow the prompt without limit', () => {
    expect(code(ROUTE)).toContain('messages.slice(-10)')
  })

  it('🔑 a no-tool turn is sent NO tool definitions', () => {
    // Measured at ~2,400 of that path's ~2,657 input tokens, none of it
    // reachable: maxSteps is 1, so a tool call has no second step to answer in.
    expect(code(ROUTE)).toMatch(/tools: noToolTurn \? undefined :/)
    expect(code(ROUTE)).toMatch(/maxSteps: noToolTurn \? 1/)
  })

  it('a greeting takes the no-tool path', () => {
    expect(classifyIntent('Chào bạn')).toBe('chitchat')
  })

  it('the need brief is bounded and only sent when the turn is choosing something', () => {
    const nothing = deriveNeedProfile(user('Giá vàng SJC hôm nay bao nhiêu?'))
    expect(nothing.domain).toBeNull()
    const real = deriveNeedProfile(user('Tìm quán cafe yên tĩnh ở Quận 1, 6 người, 500k'))
    expect(renderNeedBrief(real).length).toBeLessThan(2_000)
    expect(code(ROUTE)).toMatch(/needProfile\.domain \? renderNeedBrief\(needProfile\)/)
  })

  it('prior assistant scaffolding is stripped before the model reads it back', () => {
    expect(code(ROUTE)).toContain('sanitizePriorAssistantContent')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4 · CALL COUNT — how many times we pay
// ═══════════════════════════════════════════════════════════════════════════

describe('duplicate-call prevention', () => {
  it('one AI.stream() per turn, and no generate() smuggled into the route', () => {
    const src = code(ROUTE)
    expect((src.match(/AI\.stream\(/g) || []).length).toBe(1)
    expect(src).not.toContain('AI.generate(')
  })

  it('the ONLY second model call is memory extraction, and it is gated', () => {
    const src = code(ROUTE)
    expect((src.match(/extractMemoryFromConversation\(/g) || []).length).toBe(1)
    expect(src).toMatch(/if \(authedUserId && worthExtract\)/)
  })

  it('🔑 the gate refuses turns that cannot store anything', () => {
    for (const text of ['Thời tiết Hà Nội thế nào?', 'Giá vàng SJC hôm nay']) {
      expect(shouldExtractMemory({ text, intent: 'tool', forcedTool: null })).toBe(false)
    }
    expect(shouldExtractMemory({ text: 'Chào bạn', intent: 'chitchat', forcedTool: null })).toBe(false)
  })

  it('and still pays for a turn that states a durable constraint, however short', () => {
    expect(shouldExtractMemory({ text: 'Tôi ăn chay.', intent: 'tool', forcedTool: null })).toBe(true)
  })

  it('an anonymous turn never pays for extraction at all', () => {
    expect(code(ROUTE)).toMatch(/memoryExtract: \(authedUserId && worthExtract\) \? 1 : 0/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5 · RETRY — the invisible multiplier
// ═══════════════════════════════════════════════════════════════════════════

describe('retry behaviour — the ceiling is stated, not inherited', () => {
  it('🔑 the chat stream names its own retry ceiling', () => {
    // Left unstated, this ran on the SDK default. A retried attempt re-bills the
    // whole prompt and is invisible in telemetry, so the number has to be one
    // somebody chose.
    expect(code(ROUTE)).toMatch(/maxRetries: \d+/)
  })

  it('the ceiling is a small number — an unbounded retry is a cost incident', () => {
    const m = code(ROUTE).match(/maxRetries: (\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeLessThanOrEqual(2)
  })

  it('the facade forwards it instead of dropping it on the floor', () => {
    const ai = code('src/lib/ai/llm/ai.ts')
    expect((ai.match(/maxRetries: opts\.maxRetries/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6 · COST TELEMETRY — the record has to be able to answer the question
// ═══════════════════════════════════════════════════════════════════════════

describe('cost event emission', () => {
  const TURN: UsageEvent = {
    type: 'tappyai_usage',
    intent: 'tool', finishReason: 'stop',
    promptTokens: 6772, completionTokens: 697, totalTokens: 7469,
    cacheReadTokens: 27636, cacheCreationTokens: 0,
    llmCalls: 2, memoryExtract: 0, toolCalls: 1, elapsedMs: 12666,
    providerId: 'claude', modelRole: 'smart', decisionDomain: 'shopping',
    preModelMs: 640, ttftMs: 1811, modelFinishMs: 11120, ttuaMs: 12480,
    postModelMs: 1546, toolMs: 2934,
  }

  it('🔑 cost per FEATURE is now answerable — the domain reaches the wire', () => {
    // `intent` is only chitchat|tool, so before this every weather lookup and
    // every laptop comparison were the same bucket at wildly different prices.
    expect(sanitizePayload(TURN).decisionDomain).toBe('shopping')
    expect(ALLOWED_PAYLOAD_KEYS.has('decisionDomain')).toBe(true)
  })

  it('a turn that chose nothing reports null, not a fabricated bucket', () => {
    expect(sanitizePayload({ ...TURN, decisionDomain: null }).decisionDomain).toBeNull()
  })

  it('no field of a chat-shaped record is silently dropped', () => {
    expect(Object.keys(TURN).filter(k => !(k in sanitizePayload(TURN)))).toEqual([])
  })

  it('the route puts the derived domain on the record, not a re-derived guess', () => {
    expect(code(ROUTE)).toMatch(/decisionDomain: needProfile\.domain/)
  })

  it('🔑 the domain is a CATEGORY — free-form content still cannot ride this field', () => {
    // The allow-list only decides field NAMES; the sanitizer still refuses
    // anything that is not a primitive, which is what stops a future refactor
    // putting the whole profile here.
    expect(sanitizePayload({ ...TURN, decisionDomain: { q: 'macbook pro' } as unknown as string }))
      .not.toHaveProperty('decisionDomain')
  })

  it('the record is emitted once per turn, after the last byte', () => {
    const src = code(ROUTE)
    expect((src.match(/recordEvent\(/g) || []).length).toBe(1)
    expect(src).toContain('timeClientEmit(')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7 · SAFEGUARDS — no single request can become a cost incident
// ═══════════════════════════════════════════════════════════════════════════

describe('abnormal usage protection', () => {
  it('generation is bounded on both axes, per turn shape', () => {
    const src = code(ROUTE)
    expect(src).toMatch(/maxTokens: noToolTurn \? 300/)
    expect(src).toMatch(/maxSteps: noToolTurn \? 1 : planningIntent \? 8/)
  })

  it('🔑 no turn shape may run unbounded steps', () => {
    const m = code(ROUTE).match(/maxSteps: [^\n]+/)
    expect(m).not.toBeNull()
    for (const n of m![0].match(/\b\d+\b/g) || []) expect(Number(n)).toBeLessThanOrEqual(8)
  })

  it('a dropped client stops the billing instead of running to maxDuration', () => {
    expect(code(ROUTE)).toContain('abortSignal: req.signal')
  })

  it('the flood guard runs BEFORE any model or tool work', () => {
    const src = code(ROUTE)
    expect(src.indexOf('rateLimit(')).toBeGreaterThan(-1)
    expect(src.indexOf('rateLimit(')).toBeLessThan(src.indexOf('AI.stream('))
  })

  it('the input budget is enforced before prompt construction', () => {
    const src = code(ROUTE)
    expect(src.indexOf('validateClientInput(')).toBeLessThan(src.indexOf('buildSystem('))
  })

  it('a blocked or over-quota caller costs no tokens', () => {
    const src = code(ROUTE)
    for (const gate of ['free_limit_reached', 'anon_limit_reached', 'getAccountRestriction(']) {
      expect(src.indexOf(gate), gate).toBeLessThan(src.indexOf('AI.stream('))
    }
  })
})
