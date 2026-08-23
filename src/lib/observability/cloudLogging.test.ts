import { describe, it, expect, vi } from 'vitest'
import {
  createCloudLoggingSink,
  createNoopSink,
  loggingEnabled,
  LOGGING_SCOPE,
  DEFAULT_MAX_BATCH,
} from './cloudLogging'
import { severityOf, EVENT_TYPES, type ObservabilityEvent } from './events'
import { getLogSink } from './index'

const usage: ObservabilityEvent = {
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
}

function okFetch() {
  return vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
}

function sink(fetchImpl: typeof fetch, over: Partial<Parameters<typeof createCloudLoggingSink>[0]> = {}) {
  return createCloudLoggingSink({
    projectId: 'proj',
    logId: 'tappyai',
    enabled: true,
    getAccessToken: async () => 'tok',
    fetchImpl,
    now: () => 1_700_000_000_000,
    makeTimeoutSignal: () => new AbortController().signal,
    ...over,
  })
}

function bodyOf(f: ReturnType<typeof okFetch>) {
  const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
  return JSON.parse(String(call[1].body))
}

// ── The kill switch ─────────────────────────────────────────────────────────

describe('kill switch', () => {
  it('is OFF when the variable is unset — merging the sink is a production no-op', () => {
    expect(loggingEnabled({} as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it("is OFF for 'false'", () => {
    expect(loggingEnabled({ GCP_LOGGING_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it("is ON only for the exact string 'true'", () => {
    expect(loggingEnabled({ GCP_LOGGING_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    // A dashboard typo must not silently enable a write path.
    for (const v of ['TRUE', 'True', '1', 'yes', ' true', 'true ']) {
      expect(loggingEnabled({ GCP_LOGGING_ENABLED: v } as unknown as NodeJS.ProcessEnv)).toBe(false)
    }
  })

  it('getLogSink returns a no-op sink that never calls fetch when disabled', async () => {
    const f = okFetch()
    const s = getLogSink({} as unknown as NodeJS.ProcessEnv, null, f)
    s.log(usage)
    await s.flush()
    expect(f).not.toHaveBeenCalled()
    expect(s.stats().written).toBe(0)
  })

  it('a sink constructed with enabled:false is a no-op even with a token source', async () => {
    const f = okFetch()
    const s = sink(f, { enabled: false })
    s.log(usage)
    await s.flush()
    expect(f).not.toHaveBeenCalled()
  })

  it('a sink with no credential source is a no-op rather than a per-event failure', async () => {
    const f = okFetch()
    const s = sink(f, { getAccessToken: null })
    s.log(usage)
    await s.flush()
    expect(f).not.toHaveBeenCalled()
  })
})

// ── Never on the request path, never throwing ───────────────────────────────

describe('non-blocking and failure-tolerant', () => {
  it('log() performs no I/O', () => {
    const f = okFetch()
    const s = sink(f)
    for (let i = 0; i < 10; i++) s.log(usage)
    expect(f).not.toHaveBeenCalled()
    expect(s.stats().buffered).toBe(10)
  })

  it('flush() resolves when the credential source rejects', async () => {
    const f = okFetch()
    const s = sink(f, { getAccessToken: async () => { throw new Error('wif down') } })
    s.log(usage)
    await expect(s.flush()).resolves.toBeUndefined()
    expect(s.stats().failedFlushes).toBe(1)
    expect(s.stats().written).toBe(0)
  })

  it('flush() resolves when the endpoint returns a non-2xx', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch
    const s = sink(f)
    s.log(usage)
    await expect(s.flush()).resolves.toBeUndefined()
    expect(s.stats().failedFlushes).toBe(1)
  })

  it('flush() resolves when fetch throws (network/timeout)', async () => {
    const f = vi.fn(async () => { throw new Error('aborted') }) as unknown as typeof fetch
    const s = sink(f)
    s.log(usage)
    await expect(s.flush()).resolves.toBeUndefined()
    expect(s.stats().failedFlushes).toBe(1)
  })

  it('flush() is a no-op when there is nothing buffered', async () => {
    const f = okFetch()
    await sink(f).flush()
    expect(f).not.toHaveBeenCalled()
  })

  it('does NOT re-queue after a failure — a dead endpoint must not become a retry storm', async () => {
    const f = vi.fn(async () => { throw new Error('down') }) as unknown as typeof fetch
    const s = sink(f)
    s.log(usage)
    await s.flush()
    expect(s.stats().buffered).toBe(0)
  })
})

// ── Batching and the buffer ceiling ────────────────────────────────────────

describe('batching', () => {
  it('writes at most maxBatch entries per flush and keeps the remainder', async () => {
    const f = okFetch()
    const s = sink(f, { maxBatch: 3 })
    for (let i = 0; i < 5; i++) s.log(usage)
    await s.flush()
    expect(bodyOf(f).entries).toHaveLength(3)
    expect(s.stats().buffered).toBe(2)
  })

  it('drops the OLDEST entries on overflow and reports the count', async () => {
    const f = okFetch()
    const s = sink(f, { maxBuffer: 2, maxBatch: DEFAULT_MAX_BATCH })
    s.log({ ...usage, elapsedMs: 1 })
    s.log({ ...usage, elapsedMs: 2 })
    s.log({ ...usage, elapsedMs: 3 })
    expect(s.stats().buffered).toBe(2)
    expect(s.stats().dropped).toBe(1)

    await s.flush()
    const entries = bodyOf(f).entries
    // The two survivors are the NEWEST, plus one overflow report.
    expect(entries.map((e: { jsonPayload: { elapsedMs?: number } }) => e.jsonPayload.elapsedMs))
      .toEqual([2, 3, undefined])
    const report = entries[entries.length - 1].jsonPayload
    expect(report).toMatchObject({ type: 'system_error', scope: 'observability', code: 'buffer_overflow', dropped: 1 })
    expect(s.stats().dropped).toBe(0)
  })
})

// ── Request shape ──────────────────────────────────────────────────────────

describe('write request', () => {
  it('targets the correct log name, resource and endpoint, with partialSuccess', async () => {
    const f = okFetch()
    const s = sink(f)
    s.log(usage)
    await s.flush()

    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://logging.googleapis.com/v2/entries:write')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')

    const body = bodyOf(f)
    expect(body.logName).toBe('projects/proj/logs/tappyai')
    expect(body.resource).toEqual({ type: 'global' })
    // One bad entry must not discard the batch.
    expect(body.partialSuccess).toBe(true)
  })

  it('encodes the log id so a stray slash cannot retarget the write', async () => {
    const f = okFetch()
    const s = sink(f, { logId: 'a/b' })
    s.log(usage)
    await s.flush()
    expect(bodyOf(f).logName).toBe('projects/proj/logs/a%2Fb')
  })

  it('maps severity from the event kind, not from the caller', async () => {
    const f = okFetch()
    const s = sink(f)
    s.log(usage)
    s.log({ type: 'tts_failure', stage: 'synthesis', status: 500 })
    await s.flush()
    const entries = bodyOf(f).entries
    expect(entries[0].severity).toBe('INFO')
    expect(entries[1].severity).toBe('ERROR')
  })

  it('every declared event type has a severity', () => {
    for (const t of EVENT_TYPES) {
      expect(['INFO', 'WARNING', 'ERROR']).toContain(severityOf({ type: t } as ObservabilityEvent))
    }
  })
})

// ── Least privilege ────────────────────────────────────────────────────────

describe('scope', () => {
  it('requests the write-only logging scope, never cloud-platform', () => {
    expect(LOGGING_SCOPE).toBe('https://www.googleapis.com/auth/logging.write')
    expect(LOGGING_SCOPE).not.toContain('cloud-platform')
  })
})

describe('noop sink', () => {
  it('accepts events and flushes without effect', async () => {
    const s = createNoopSink()
    s.log(usage)
    await expect(s.flush()).resolves.toBeUndefined()
    expect(s.stats()).toEqual({ buffered: 0, dropped: 0, written: 0, failedFlushes: 0 })
  })
})
