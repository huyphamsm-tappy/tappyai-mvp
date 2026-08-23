import { describe, it, expect, vi } from 'vitest'
import { createCloudLoggingSink } from './cloudLogging'
import { ALLOWED_PAYLOAD_KEYS, EVENT_TYPES, type ObservabilityEvent } from './events'

// ── The privacy guard ────────────────────────────────────────────────────────
//
// The rule this file enforces: nothing that reaches Cloud Logging may carry a
// prompt, a completion, an utterance, a TTS string, a credential, a token
// value, an object key or anything else that resolves back to a person.
//
// It is enforced by ALLOW-LIST, not by blocklist. A blocklist ("must not
// contain the word prompt") passes the moment someone names a field `p`. An
// allow-list fails the moment a field appears that nobody added here on
// purpose — which is exactly when a human should be looking.

/** The single source of truth lives in events.ts; the sink enforces it at runtime. */
const ALLOWED_KEYS = ALLOWED_PAYLOAD_KEYS

/**
 * Names that are unambiguously counters. Only these may be excused from the
 * content-name check, and only because a separate test proves each one holds a
 * number in every event shape.
 */
const COUNTER_SUFFIX = /Tokens$/

/**
 * One fully-populated instance of every event type, including every optional
 * field, so the allow-list is tested against the widest shape each can take.
 */
const SAMPLES: Record<ObservabilityEvent['type'], ObservabilityEvent> = {
  tappyai_usage: {
    type: 'tappyai_usage', intent: 'tool', finishReason: 'stop',
    promptTokens: 1, completionTokens: 2, totalTokens: 3,
    cacheReadTokens: 4, cacheCreationTokens: 5, llmCalls: 1,
    memoryExtract: 0, toolCalls: 1, elapsedMs: 10,
  },
  tts_metrics: {
    type: 'tts_metrics', requests: 1, cacheHits: 1, cacheMisses: 0,
    charactersSynthesized: 100, errors: 0, hitRate: 1, avgSynthesisMs: 12,
  },
  tts_failure: { type: 'tts_failure', stage: 'synthesis', status: 500, language: 'vi' },
  media_failure: { type: 'media_failure', operation: 'put', provider: 'gcs', status: 403, kind: 'video' },
  wif_failure: { type: 'wif_failure', stage: 'sts', status: 400, reason: 'unauthorized_client', identitySource: 'header' },
  ai_provider_failure: { type: 'ai_provider_failure', providerId: 'claude', role: 'smart', status: 429, kind: 'RateLimitError' },
  request_error: { type: 'request_error', route: '/api/chat', status: 500, code: 'rate_limit' },
  system_error: { type: 'system_error', scope: 'observability', code: 'buffer_overflow' },
}

function capture(events: ObservabilityEvent[]) {
  const f = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
  const s = createCloudLoggingSink({
    projectId: 'proj', logId: 'tappyai', enabled: true,
    getAccessToken: async () => 'SECRET_BEARER_VALUE',
    fetchImpl: f, now: () => 0,
    makeTimeoutSignal: () => new AbortController().signal,
    maxBatch: 100,
  })
  for (const e of events) s.log(e)
  return { sink: s, fetchImpl: f }
}

async function bodyFor(events: ObservabilityEvent[]) {
  const { sink, fetchImpl } = capture(events)
  await sink.flush()
  const call = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
  return String(call[1].body)
}

describe('privacy: allow-listed fields only', () => {
  it('covers every declared event type — the sample table cannot silently fall behind', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...EVENT_TYPES].sort())
  })

  it('emits no field outside the allow-list, for any event type', async () => {
    const raw = await bodyFor(Object.values(SAMPLES))
    const body = JSON.parse(raw) as { entries: { jsonPayload: Record<string, unknown> }[] }
    expect(body.entries).toHaveLength(EVENT_TYPES.length)

    const seen = new Set<string>()
    for (const entry of body.entries) for (const k of Object.keys(entry.jsonPayload)) seen.add(k)

    const unexpected = [...seen].filter((k) => !ALLOWED_KEYS.has(k))
    expect(unexpected).toEqual([])
  })

  it('carries no field whose NAME suggests free-form content', () => {
    // A second, independent check on the allow-list itself: even a deliberately
    // added field must not be a content channel.
    //
    // `promptTokens` and friends match `prompt` and `token` while being pure
    // COUNTS, so names that are unambiguously numeric are exempt — but the
    // exemption is PROVEN below rather than asserted, otherwise it would be a
    // hole named "add the suffix and the guard goes quiet".
    const contentish = /(text|prompt|message|content|utterance|body|query|email|name|url|key|token|secret|password|payload)/i
    const offenders = [...ALLOWED_KEYS].filter((k) => contentish.test(k) && !COUNTER_SUFFIX.test(k))
    expect(offenders).toEqual([])
    // A name like `promptText` must still be caught.
    expect(contentish.test('promptText') && !COUNTER_SUFFIX.test('promptText')).toBe(true)
  })

  it('every counter-named field really is numeric in every event shape', () => {
    // This is what makes the exemption above safe: a field can only be excused
    // for being a count if it is, in fact, always a number.
    const violations: string[] = []
    for (const sample of Object.values(SAMPLES)) {
      for (const [k, v] of Object.entries(sample as unknown as Record<string, unknown>)) {
        if (!COUNTER_SUFFIX.test(k)) continue
        if (typeof v !== 'number' && v !== null) violations.push(`${k}=${typeof v}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('privacy: the credential never reaches the payload', () => {
  it('sends the bearer token as a header and never inside the body', async () => {
    const { sink, fetchImpl } = capture([SAMPLES.tappyai_usage])
    await sink.flush()
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]

    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer SECRET_BEARER_VALUE')
    expect(String(init.body)).not.toContain('SECRET_BEARER_VALUE')
  })
})

describe('privacy: a caller cannot smuggle extra fields through', () => {
  it('DROPS fields that got past the type system', async () => {
    // TypeScript rejects an extra property at the call site. This proves the
    // RUNTIME guarantee for a value that got past it anyway — an `as` cast, or
    // a value that crossed a JSON boundary.
    const smuggled = {
      type: 'system_error', scope: 'test', code: 'x',
      utterance: 'xin chào, tôi tên là ...',
      prompt: 'SYSTEM PROMPT TEXT',
    } as unknown as ObservabilityEvent

    const raw = await bodyFor([smuggled])
    expect(raw).not.toContain('xin chào')
    expect(raw).not.toContain('SYSTEM PROMPT TEXT')

    const payload = (JSON.parse(raw) as { entries: { jsonPayload: Record<string, unknown> }[] }).entries[0].jsonPayload
    expect(Object.keys(payload).sort()).toEqual(['code', 'scope', 'type'])
  })

  it('drops nested objects even when the key itself is allow-listed', async () => {
    // `reason` is allow-listed as a bounded string. An object smuggled into it
    // could carry anything, so only primitives are copied.
    const nested = {
      type: 'wif_failure', stage: 'sts',
      reason: { secret: 'user utterance' },
    } as unknown as ObservabilityEvent

    const raw = await bodyFor([nested])
    expect(raw).not.toContain('user utterance')
    const payload = (JSON.parse(raw) as { entries: { jsonPayload: Record<string, unknown> }[] }).entries[0].jsonPayload
    expect(payload).toEqual({ type: 'wif_failure', stage: 'sts' })
  })
})
