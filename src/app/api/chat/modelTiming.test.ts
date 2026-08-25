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

/** The single `tappyai_usage` object literal, brace-matched out of the source. */
function usageRecord(): string {
  const anchor = CODE.indexOf("type: 'tappyai_usage'")
  expect(anchor, 'the tappyai_usage record must exist').toBeGreaterThan(-1)
  const open = CODE.lastIndexOf('{', anchor)
  let depth = 0
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === '{') depth++
    else if (CODE[i] === '}') { depth--; if (depth === 0) return CODE.slice(open, i + 1) }
  }
  throw new Error('unterminated tappyai_usage literal')
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
    expect(CODE).toMatch(/console\.log\(JSON\.stringify\(\{[\s\S]*?type:\s*'tappyai_usage'/)
  })

  it('still reports total elapsed time from t0', () => {
    expect(usageRecord()).toMatch(/elapsedMs\s*:\s*Date\.now\(\)\s*-\s*startTime/)
  })
})
