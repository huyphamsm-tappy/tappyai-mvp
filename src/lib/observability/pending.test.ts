import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  recordEvent,
  flushPending,
  recordTtsMetricsDelta,
  pendingStats,
  resetPending,
  resetTtsDelta,
  MAX_PENDING,
} from './pending'
import type { ObservabilityEvent } from './events'

const ON = { GCP_LOGGING_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv
const OFF = {} as unknown as NodeJS.ProcessEnv

const req = { headers: new Headers({ 'x-vercel-oidc-token': 'oidc-token' }) }

function ttsEvent(characters: number): ObservabilityEvent {
  return { type: 'tts_request', language: 'vi', characters, cacheHit: false, elapsedMs: 5 }
}

/** STS then impersonation then the log write — the real three-call shape. */
function wifFetch(logStatus = 200) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('sts.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'federated' }), { status: 200 })
    }
    if (String(url).includes('iamcredentials')) {
      return new Response(JSON.stringify({ accessToken: 'impersonated' }), { status: 200 })
    }
    return new Response('{}', { status: logStatus })
  }) as unknown as typeof fetch
}

function logCall(f: typeof fetch) {
  const calls = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
  return calls.find((c) => String(c[0]).includes('logging.googleapis.com'))
}

beforeEach(() => {
  resetPending()
  resetTtsDelta()
})

describe('recordEvent', () => {
  it('buffers without I/O', () => {
    const f = wifFetch()
    recordEvent(ttsEvent(10))
    recordEvent(ttsEvent(20))
    expect(pendingStats().buffered).toBe(2)
    expect(f).not.toHaveBeenCalled()
  })

  it('drops the OLDEST past the ceiling and counts them', () => {
    for (let i = 0; i < MAX_PENDING + 3; i++) recordEvent(ttsEvent(i))
    expect(pendingStats()).toEqual({ buffered: MAX_PENDING, dropped: 3 })
  })

  it('never throws, even on a value that resists handling', () => {
    expect(() => recordEvent(undefined as unknown as ObservabilityEvent)).not.toThrow()
  })
})

describe('flushPending', () => {
  it('delivers buffered events through the WIF chain', async () => {
    const f = wifFetch()
    recordEvent(ttsEvent(120))
    await flushPending(req, ON, f)

    const call = logCall(f)
    expect(call).toBeDefined()
    const body = JSON.parse(String(call![1].body))
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0].jsonPayload).toMatchObject({ type: 'tts_request', characters: 120, language: 'vi' })
    expect(pendingStats().buffered).toBe(0)
  })

  it('is inert when the kill switch is off — and does not hoard a backlog', async () => {
    const f = wifFetch()
    recordEvent(ttsEvent(1))
    recordEvent(ttsEvent(2))
    await flushPending(req, OFF, f)

    expect(f).not.toHaveBeenCalled()
    // Draining matters: otherwise the first request after the switch is turned
    // on would ship a pile of stale events.
    expect(pendingStats().buffered).toBe(0)
  })

  it('resolves — never rejects — when the log write fails', async () => {
    const f = wifFetch(500)
    recordEvent(ttsEvent(1))
    await expect(flushPending(req, ON, f)).resolves.toBeUndefined()
  })

  it('resolves when the credential exchange fails', async () => {
    const f = vi.fn(async () => new Response('denied', { status: 403 })) as unknown as typeof fetch
    recordEvent(ttsEvent(1))
    await expect(flushPending(req, ON, f)).resolves.toBeUndefined()
  })

  it('resolves when fetch throws outright', async () => {
    const f = vi.fn(async () => { throw new Error('network down') }) as unknown as typeof fetch
    recordEvent(ttsEvent(1))
    await expect(flushPending(req, ON, f)).resolves.toBeUndefined()
  })

  it('does nothing when there is nothing buffered', async () => {
    const f = wifFetch()
    await flushPending(req, ON, f)
    expect(f).not.toHaveBeenCalled()
  })

  it('clears the buffer before awaiting, so a concurrent flush cannot double-send', async () => {
    const f = wifFetch()
    recordEvent(ttsEvent(1))
    const first = flushPending(req, ON, f)
    // Second flush observes an already-empty buffer.
    const second = flushPending(req, ON, f)
    await Promise.all([first, second])
    const logWrites = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .filter((c) => String(c[0]).includes('logging.googleapis.com'))
    expect(logWrites).toHaveLength(1)
  })
})

describe('recordTtsMetricsDelta', () => {
  it('emits the full counters on first report', () => {
    recordTtsMetricsDelta({ requests: 3, cacheHits: 1, cacheMisses: 2, charactersSynthesized: 300, errors: 0, totalLatencyMs: 900 })
    expect(pendingStats().buffered).toBe(1)
  })

  it('emits only the CHANGE on subsequent reports — cumulative counters must not double-count', async () => {
    const f = wifFetch()
    recordTtsMetricsDelta({ requests: 3, charactersSynthesized: 300 })
    recordTtsMetricsDelta({ requests: 5, charactersSynthesized: 500 })
    await flushPending(req, ON, f)

    const body = JSON.parse(String(logCall(f)![1].body))
    expect(body.entries).toHaveLength(2)
    expect(body.entries[0].jsonPayload).toMatchObject({ requests: 3, charactersSynthesized: 300 })
    expect(body.entries[1].jsonPayload).toMatchObject({ requests: 2, charactersSynthesized: 200 })
    // Summing every delta reproduces the true total.
    const total = body.entries.reduce((n: number, e: { jsonPayload: { charactersSynthesized: number } }) => n + e.jsonPayload.charactersSynthesized, 0)
    expect(total).toBe(500)
  })

  it('emits nothing when no counter moved', () => {
    recordTtsMetricsDelta({ requests: 2, charactersSynthesized: 200 })
    resetPending()
    recordTtsMetricsDelta({ requests: 2, charactersSynthesized: 200 })
    expect(pendingStats().buffered).toBe(0)
  })

  it('treats a counter that went BACKWARDS as a fresh instance, never a negative delta', async () => {
    const f = wifFetch()
    recordTtsMetricsDelta({ requests: 9, charactersSynthesized: 900 })
    resetPending()
    // A new instance starts its counters from zero again.
    recordTtsMetricsDelta({ requests: 2, charactersSynthesized: 200 })
    await flushPending(req, ON, f)

    const payload = JSON.parse(String(logCall(f)![1].body)).entries[0].jsonPayload
    expect(payload.requests).toBe(2)
    expect(payload.charactersSynthesized).toBe(200)
    // A negative would silently subtract from the fleet total.
    expect(payload.charactersSynthesized).toBeGreaterThan(0)
  })

  it('never carries the synthesized TEXT — only counts', async () => {
    const f = wifFetch()
    recordTtsMetricsDelta({ charactersSynthesized: 42 })
    await flushPending(req, ON, f)
    const raw = String(logCall(f)![1].body)
    const payload = JSON.parse(raw).entries[0].jsonPayload
    expect(typeof payload.charactersSynthesized).toBe('number')
    expect(Object.keys(payload).sort()).toEqual(
      ['cacheHits', 'cacheMisses', 'charactersSynthesized', 'errors', 'requests', 'totalLatencyMs', 'type'],
    )
  })
})
