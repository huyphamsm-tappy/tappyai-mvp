import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sanitizePayload, ALLOWED_PAYLOAD_KEYS, type UsageEvent } from '@/lib/observability/events'
import { recordEvent, flushPending, pendingStats, resetPending } from '@/lib/observability/pending'

// ── P1-3: the chat turn reaches the cost pipeline ────────────────────────────
//
// WHAT WAS WRONG. `UsageEvent` described itself as "the record the cost model is built from", but
// /api/chat only ever `console.log`-ed. The structured channel existed and was empty, and the two
// halves could not be told apart from inside the code: everything compiled, every test passed, and
// no cost data was ever produced.
//
// WHAT IS ALREADY PROVEN ELSEWHERE, and deliberately not repeated here:
//   • timeClientEmit fires its completion callback exactly once, and not on abort
//     (emitTiming.test.ts — "fires onComplete exactly once").
//   • recordEvent never throws; flushPending never rejects, drains when disabled, and cannot
//     double-send (pending.test.ts).
//
// WHAT THIS FILE ADDS is the JOIN — the part that was missing and is therefore untested:
//   A. every cost field survives the privacy boundary (the silent-drop failure);
//   B. buffering and draining behave for a chat-shaped record;
//   C. the route records once, from the same object it prints, and drains the buffer.

/** A record shaped exactly as route.ts builds one, on a tool turn. */
const CHAT_TURN: UsageEvent = {
  type: 'tappyai_usage',
  intent: 'tool',
  finishReason: 'stop',
  promptTokens: 6772,
  completionTokens: 697,
  totalTokens: 7469,
  cacheReadTokens: 27636,
  cacheCreationTokens: 0,
  llmCalls: 2,
  memoryExtract: 0,
  toolCalls: 1,
  elapsedMs: 12666,
  providerId: 'claude',
  modelRole: 'smart',
  preModelMs: 640,
  ttftMs: 1811,
  modelFinishMs: 11120,
  ttuaMs: 12480,
  postModelMs: 1546,
  toolMs: 2934,
}

/** The fields a cost model cannot be built without. */
const COST_FIELDS = [
  'promptTokens', 'completionTokens', 'totalTokens',
  'cacheReadTokens', 'cacheCreationTokens',
  'llmCalls', 'toolCalls', 'memoryExtract',
  'providerId', 'modelRole',
] as const

const ROUTE_SRC = readFileSync('src/app/api/chat/route.ts', 'utf8')

describe('P1-3 · A · every cost field survives the privacy boundary', () => {
  // THE FAILURE THIS CATCHES: a field added to UsageEvent but not to ALLOWED_PAYLOAD_KEYS is
  // dropped by sanitizePayload with no error anywhere. The type checks, the event is recorded, the
  // sink is called — and the number simply is not in the log. Nothing else in the suite notices.
  it.each(COST_FIELDS)('%s reaches the wire', (field) => {
    expect(sanitizePayload(CHAT_TURN)).toHaveProperty(field)
  })

  it('no field of a chat-shaped record is silently dropped', () => {
    const dropped = Object.keys(CHAT_TURN).filter(k => !(k in sanitizePayload(CHAT_TURN)))
    expect(dropped).toEqual([])
  })

  it('the latency marks reach the wire too — they attribute cost, not just latency', () => {
    const out = sanitizePayload(CHAT_TURN)
    for (const k of ['preModelMs', 'ttftMs', 'modelFinishMs', 'ttuaMs', 'postModelMs', 'toolMs']) {
      expect(out).toHaveProperty(k)
    }
  })

  it('a null counter is preserved as null, never coerced to 0', () => {
    // "the provider reported nothing" and "the provider reported zero" are different facts about
    // spend, and collapsing them would make cache-hit rate unreadable.
    const out = sanitizePayload({ ...CHAT_TURN, cacheReadTokens: null, toolMs: null })
    expect(out.cacheReadTokens).toBeNull()
    expect(out.toolMs).toBeNull()
  })

  it('carries nothing resembling user content', () => {
    // A second, independent check to the allow-list's own: assert on the ACTUAL emitted keys.
    const contentish = /(text|message|content|utterance|body|query|email|url|secret|password)/i
    const offenders = Object.keys(sanitizePayload(CHAT_TURN)).filter(k => contentish.test(k))
    expect(offenders).toEqual([])
  })

  it('a rogue field cannot ride along on a chat record', () => {
    const out = sanitizePayload({ ...CHAT_TURN, lastUserMessage: 'quán phở ngon quận 1' } as unknown)
    expect(out).not.toHaveProperty('lastUserMessage')
    expect(ALLOWED_PAYLOAD_KEYS.has('lastUserMessage')).toBe(false)
  })
})

describe('P1-3 · B · buffering and draining a chat-shaped record', () => {
  beforeEach(() => resetPending())

  it('one turn buffers exactly one event', () => {
    recordEvent(CHAT_TURN)
    expect(pendingStats().buffered).toBe(1)
  })

  it('recording cannot throw, so it can never break the reply it observes', () => {
    expect(() => recordEvent(CHAT_TURN)).not.toThrow()
    // Even a value that resists handling — the reply must still ship.
    expect(() => recordEvent(undefined as unknown as UsageEvent)).not.toThrow()
  })

  it('a flush with logging switched off still drains, so a backlog cannot build up', async () => {
    recordEvent(CHAT_TURN)
    recordEvent(CHAT_TURN)
    await expect(flushPending(null, {} as NodeJS.ProcessEnv)).resolves.toBeUndefined()
    expect(pendingStats().buffered).toBe(0)
  })

  it('a flush whose transport throws still resolves — chat never sees an observability failure', async () => {
    recordEvent(CHAT_TURN)
    const exploding = (() => { throw new Error('network down') }) as unknown as typeof fetch
    await expect(
      flushPending(null, { GCP_LOGGING_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv, exploding),
    ).resolves.toBeUndefined()
  })
})

describe('P1-3 · C · how the route is wired', () => {
  // STRUCTURAL guards. They do not replace the behavioural coverage above and in
  // emitTiming.test.ts — they pin the two properties that behaviour cannot show from outside the
  // handler: that there is exactly ONE record per turn, and that the printed line and the recorded
  // event cannot drift apart.

  it('records the usage event exactly once — one turn, one cost record', () => {
    expect(ROUTE_SRC.match(/recordEvent\(/g) ?? []).toHaveLength(1)
  })

  it('records the SAME object it prints, so the two can never disagree', () => {
    // Built once as `usageEvent`, recorded as-is, and spread into the console line. If someone
    // reverts to two separate literals, a field added to one and not the other goes unnoticed —
    // which is exactly what the event type's "mirrors the console line" promise depends on.
    expect(ROUTE_SRC).toContain('recordEvent(usageEvent)')
    expect(ROUTE_SRC).toContain('...usageEvent,')
  })

  it('the record is emitted from the client-emit completion, not from onFinish', () => {
    // onFinish fires when GENERATION ends; on a buffered turn the reply is withheld through the
    // enrichment tail, so a record shipped there would miss ttua/postModel entirely — and would
    // still be emitted for a turn the client aborted.
    expect(ROUTE_SRC).toContain('const logUsage = (ttuaMs: number | null) =>')
    expect(ROUTE_SRC).toMatch(/pipeThrough\(timeClientEmit\(startTime, Date\.now, \(t\) => logUsage\(t\.ttuaMs\)\)\)/)
    // Exactly one INVOCATION. (`const logUsage = (` is the definition and does not match.)
    expect(ROUTE_SRC.match(/logUsage\(/g) ?? []).toHaveLength(1)
  })

  it('drains the buffer at the start of the handler, without awaiting it', () => {
    // Recording without flushing here would overflow the 200-entry buffer on a chat-dominant
    // workload and measure a small, biased sample. Awaiting it would put log latency in front of
    // the user's reply.
    expect(ROUTE_SRC).toContain('void flushPending(req)')
  })
})
