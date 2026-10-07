import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── The stage split must stay measurable, and stay content-free ─────────────
//
// Production measurement on 7e15dfe put the whole TTFB variance (1.8s → 13.7s)
// inside "model request sent → first token", with every application stage
// measured well under it. These marks are the only way to see inside that
// interval from the server side.
//
// Two ways this quietly stops working, neither of which breaks a build:
//   1. a field is dropped or renamed, and the log still looks healthy;
//   2. someone "enriches" the record with the prompt or the answer to make it
//      easier to read, turning a diagnostic line into a content leak.
//
// Source-level assertions because this route has no executable harness — the
// mechanism `accountStatus.test.ts` and `preModelParallel.test.ts` already use.

const SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')
const CODE = SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Does the record carry this field, written EITHER way?
 *
 * Half of this literal uses ES6 shorthand (`intent,` `forcedTool,`), so a
 * `name:` regex reports those as missing — and, worse, would report a shorthand
 * `text,` leak as absent. Both forms have to be recognised for the
 * presence checks and the leak checks to mean anything.
 */
function hasField(record: string, name: string): boolean {
  return new RegExp(`(^|[{,\\s])${name}\\s*(:|,|\\r?\\n|\\})`).test(record)
}

/** The object literal starting at `from`, brace-matched out of the source. */
function literalAt(from: number, what: string): string {
  expect(from, `${what} must exist`).toBeGreaterThan(-1)
  const open = CODE.lastIndexOf('{', from)
  let depth = 0
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === '{') depth++
    else if (CODE[i] === '}') { depth--; if (depth === 0) return CODE.slice(open, i + 1) }
  }
  throw new Error(`unterminated ${what} literal`)
}

/**
 * Everything the `tappyai_usage` line emits.
 *
 * P1-3 split the one literal in two: `usageEvent` is the typed, allow-listed record that goes to
 * the cost pipeline, and the console line spreads it and adds console-only diagnostics. Both are
 * emitted on the same line, so both are in scope here — and they have to be, or the split would
 * silently drop every assertion below about the diagnostics half. Concatenating them keeps this
 * file measuring WHAT IS LOGGED rather than how the object happens to be assembled.
 */
function usageRecord(): string {
  const event = literalAt(CODE.indexOf("type: 'tappyai_usage'"), 'the usageEvent record')
  const printed = literalAt(CODE.indexOf('...usageEvent,'), 'the console line')
  return `${event}\n${printed}`
}

describe('the stage split is emitted', () => {
  const STAGES = ['preModelMs', 'ttftMs', 'generationMs'] as const

  it.each(STAGES)('%s is a field of the tappyai_usage record', (field) => {
    // Scoped to the record, so a stray mention in a comment or an unused local
    // cannot satisfy it.
    expect(hasField(usageRecord(), field), `${field} must be emitted`).toBe(true)
  })

  it('identifies which provider and role served the turn', () => {
    expect(hasField(usageRecord(), 'providerId')).toBe(true)
    expect(hasField(usageRecord(), 'modelRole')).toBe(true)
  })

  it('measures every stage from the same t0', () => {
    // preModelMs and ttftMs must both be relative to startTime, or the timeline
    // does not compose and generationMs cannot be derived from it.
    expect(CODE).toMatch(/preModelMs\s*=\s*Date\.now\(\)\s*-\s*startTime/)
    expect(usageRecord()).toMatch(/ttftMs\s*:[\s\S]{0,80}firstTokenAt\s*-\s*startTime/)
  })
})

describe('a turn that produced no text is reported as such, not as a fast one', () => {
  it('leaves ttftMs null rather than falling back to elapsed time', () => {
    expect(usageRecord()).toMatch(/ttftMs\s*:\s*firstTokenAt\s*===\s*null\s*\?\s*null/)
  })

  it('leaves generationMs null in the same case', () => {
    expect(usageRecord()).toMatch(/generationMs\s*:\s*firstTokenAt\s*===\s*null\s*\?\s*null/)
  })

  it('never back-fills generationMs from elapsedMs', () => {
    const g = /generationMs\s*:[^,\n]*/.exec(usageRecord())?.[0] ?? ''
    expect(g, 'generationMs must come from firstTokenAt, not elapsed').not.toMatch(/elapsedMs|startTime/)
  })
})

describe('first-token detection counts only real text', () => {
  it('records the mark on a text delta', () => {
    expect(CODE).toMatch(/chunk\.type\s*===\s*'text-delta'/)
  })

  it('records it once — the FIRST delta, not the last', () => {
    expect(CODE).toMatch(/firstTokenAt\s*===\s*null\s*&&\s*chunk\.type\s*===\s*'text-delta'/)
  })

  it('does not start the clock on a tool-call chunk', () => {
    // A tool turn emits its first text long after the model began answering.
    // Counting a tool chunk would report a provider round-trip as model latency.
    const hook = /onChunk\s*:\s*\(\{\s*chunk\s*\}\)\s*=>\s*\{[\s\S]*?\}/.exec(CODE)?.[0] ?? ''
    expect(hook, 'the onChunk hook must exist').not.toBe('')
    expect(hook).not.toMatch(/tool-call|tool-result|reasoning/)
  })
})

describe('retry metadata is reported as unavailable, not invented', () => {
  it("records retryCount as the literal 'unknown'", () => {
    // The AI SDK accepts maxRetries but reports no attempt count to onFinish.
    // A number here would be fabricated, and would make a retry-caused delay
    // indistinguishable from provider queueing.
    expect(usageRecord()).toMatch(/retryCount\s*:\s*'unknown'/)
  })

  it('does not derive a retry count from anything else', () => {
    const r = /retryCount\s*:[^,\n]*/.exec(usageRecord())?.[0] ?? ''
    expect(r).not.toMatch(/steps|length|\+|\?/)
  })
})

describe('the client-emit side and step/tool split are emitted (Phase 0)', () => {
  // TTUA (first content the client can SEE), the enrichment/emit tail, and the
  // per-step/per-tool split are the marks that separate a buffered turn (whole
  // reply withheld to the end) from a live one — the whole point of the phase.
  const NEW_MARKS = ['ttuaMs', 'modelFinishMs', 'postModelMs', 'firstStepFinishMs', 'toolMs'] as const

  it.each(NEW_MARKS)('%s is a field of the tappyai_usage record', (field) => {
    expect(hasField(usageRecord(), field), `${field} must be emitted`).toBe(true)
  })

  it('ships the record from the client-emit transform, not onFinish', () => {
    // On a buffered turn the first visible byte leaves AFTER onFinish, so the one
    // record must be emitted once the stream has flushed — through a byte-identical
    // pass-through, never by rewriting the stream.
    expect(CODE).toMatch(/timeClientEmit\(/)
    expect(CODE).toMatch(/\.pipeThrough\(/)
  })

  it('keeps modelFinishMs as the generation-complete mark (T9), distinct from total', () => {
    expect(usageRecord()).toMatch(/modelFinishMs\s*:\s*modelFinishAt\s*===\s*null\s*\?\s*null/)
  })

  it('measures the step boundary and tool time from SDK hooks, never inferred', () => {
    expect(CODE).toMatch(/onStepFinish\s*:/)
    expect(CODE).toMatch(/firstStepFinishMs\s*=\s*Date\.now\(\)\s*-\s*startTime/)
    // toolMs accrues around execute(); it is a measured duration, not derived.
    expect(CODE).toMatch(/toolMs\s*\+=\s*Date\.now\(\)\s*-/)
  })
})

describe('the record stays free of prompt and response content', () => {
  const FORBIDDEN = ['text', 'content', 'prompt', 'systemPrompt', 'messages', 'answer', 'query', 'lastText']

  it.each(FORBIDDEN)('does not log `%s`', (field) => {
    // Field NAMES, not substrings: `promptTokens` is a count and must stay.
    // Shorthand-aware — half this literal is written `{ intent, forcedTool }`,
    // so a `text:` regex would miss a `text,` leak entirely.
    expect(hasField(usageRecord(), field), `${field} must never be logged`).toBe(false)
  })

  it('logs only counts for prompt and completion size', () => {
    const rec = usageRecord()
    expect(hasField(rec, 'promptTokens')).toBe(true)
    expect(hasField(rec, 'completionTokens')).toBe(true)
  })

  it('carries no template interpolation that could embed user text', () => {
    expect(usageRecord()).not.toMatch(/\$\{/)
  })
})

describe('the existing tappyai_usage shape is unchanged', () => {
  // Anything already consumed downstream must survive. Adding fields is safe;
  // dropping or renaming one silently breaks whatever reads these logs.
  const PRE_EXISTING = [
    'type', 'intent', 'finishReason', 'promptTokens', 'completionTokens', 'totalTokens',
    'cacheReadTokens', 'cacheCreationTokens', 'llmCalls', 'memoryExtract', 'toolCalls',
    'elapsedMs', 'worthExtract', 'forcedTool',
  ]

  it.each(PRE_EXISTING)('%s is still emitted', (field) => {
    expect(hasField(usageRecord(), field), `${field} must survive`).toBe(true)
  })

  it('is still a single console.log of one JSON object', () => {
    // Anchored on the SPREAD, which is what the console line now opens with. The old pattern
    // looked for `type: 'tappyai_usage'` after any amount of anything, so it matched a console.log
    // elsewhere in the file followed by the type string further down — it would have passed even
    // if the usage line had been deleted outright.
    expect(CODE).toMatch(/console\.log\(JSON\.stringify\(\{\s*\.\.\.usageEvent,/)
    expect(CODE.match(/console\.log\(JSON\.stringify\(\{\s*\.\.\.usageEvent,/g) ?? []).toHaveLength(1)
  })

  it('still reports total elapsed time from t0', () => {
    // P1-3 hoisted the clock read into `const now = Date.now()` so elapsedMs and postModelMs are
    // measured from the SAME instant — before, they were two separate Date.now() calls and the
    // record could disagree with itself by a millisecond. The property under test is unchanged:
    // total elapsed is measured from t0.
    expect(usageRecord()).toMatch(/elapsedMs\s*:\s*now\s*-\s*startTime/)
    expect(CODE).toMatch(/const now = Date\.now\(\)/)
  })
})
