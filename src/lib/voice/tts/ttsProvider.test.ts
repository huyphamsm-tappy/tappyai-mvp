// The Google Cloud TTS provider, its cache, and the gate that keeps it switched off.
//
// THE SHAPE OF THE RISK HERE IS COST, NOT CORRECTNESS. Cloud TTS bills per character, so the two
// things that matter are (a) never synthesizing the same utterance twice, and (b) never synthesizing
// at all while the voice is unchosen. Both are asserted, including the negative cases — a cache that
// silently misses is indistinguishable from no cache except on the invoice.
//
// FAIL-SAFE, NOT FAIL-QUIET: no voice selected means throw. The tempting alternative — pick the
// first candidate — would ship whichever name happened to be listed first as Tappy's voice, which is
// exactly the decision this code is not allowed to make.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createGoogleTtsProvider,
  TtsNotConfiguredError,
  TtsSynthesisError,
} from './googleTts'
import { ttsCacheKey, createTtsCache, normalizeForTts } from './cache'
import { createTtsMetrics } from './metrics'

const VOICE = { vi: 'vi-VN-Neural2-A', en: 'en-US-Neural2-F' }
const AUDIO_B64 = Buffer.from('fake-mp3-bytes').toString('base64')

function mockFetchOk() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) })
    return { ok: true, status: 200, json: async () => ({ audioContent: AUDIO_B64 }) } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const deps = (over: Record<string, unknown> = {}) => ({
  getAccessToken: async () => 'ya29.voice-token',
  selectedVoice: VOICE as Record<string, string | null>,
  ...over,
})

describe('normalizing text before it is billed', () => {
  it('collapses whitespace so trivially different strings share one synthesis', () => {
    expect(normalizeForTts('  Xin   chào\n bạn ')).toBe('Xin chào bạn')
  })

  it('does NOT lowercase — casing changes pronunciation and emphasis', () => {
    expect(normalizeForTts('TAPPY')).toBe('TAPPY')
    expect(normalizeForTts('TAPPY')).not.toBe(normalizeForTts('tappy'))
  })
})

describe('the cache key', () => {
  const base = { text: 'Xin chào', language: 'vi', voiceName: 'vi-VN-Neural2-A', speakingRate: 1, pitch: 0 }

  it('is stable for the same configuration', () => {
    expect(ttsCacheKey(base)).toBe(ttsCacheKey({ ...base }))
  })

  it('treats whitespace-only differences as the same utterance', () => {
    expect(ttsCacheKey({ ...base, text: 'Xin    chào ' })).toBe(ttsCacheKey(base))
  })

  // Each of these changes the AUDIO, so each must change the key. Sharing a key across any of them
  // means yesterday's voice keeps playing after the configuration changes.
  it.each([
    ['text', { text: 'Chào bạn' }],
    ['language', { language: 'en' }],
    ['voice', { voiceName: 'vi-VN-Chirp3-HD-Aoede' }],
    ['speaking rate', { speakingRate: 1.25 }],
    ['pitch', { pitch: 2 }],
  ])('changes when the %s changes', (_label, patch) => {
    expect(ttsCacheKey({ ...base, ...patch })).not.toBe(ttsCacheKey(base))
  })

  it('is not the raw text, so it cannot leak an utterance through a key', () => {
    expect(ttsCacheKey(base)).not.toContain('Xin chào')
  })
})

describe('synthesis', () => {
  let metrics: ReturnType<typeof createTtsMetrics>
  beforeEach(() => { metrics = createTtsMetrics() })

  it('asks Google for the configured voice and returns audio', async () => {
    const { fetchImpl, calls } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics }))
    const out = await p.synthesize({ text: 'Xin chào', language: 'vi' })

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('texttospeech.googleapis.com')
    const body = calls[0].body as { voice: { name: string; languageCode: string }; input: { text: string } }
    expect(body.voice.name).toBe('vi-VN-Neural2-A')
    expect(body.voice.languageCode).toBe('vi-VN')
    expect(out.voiceName).toBe('vi-VN-Neural2-A')
    expect(out.cacheHit).toBe(false)
    expect(out.characters).toBe('Xin chào'.length)
  })

  it('picks the voice from the MESSAGE language, not a default', async () => {
    const { fetchImpl, calls } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics }))
    await p.synthesize({ text: 'Hello there', language: 'en' })
    expect((calls[0].body as { voice: { name: string } }).voice.name).toBe('en-US-Neural2-F')
  })

  it('never sends a credential in the request body', async () => {
    const { fetchImpl, calls } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics }))
    await p.synthesize({ text: 'Xin chào', language: 'vi' })
    expect(JSON.stringify(calls[0].body)).not.toContain('ya29')
  })
})

describe('the cache is what keeps the bill down', () => {
  it('synthesizes once and serves the repeat from cache', async () => {
    const { fetchImpl } = mockFetchOk()
    const metrics = createTtsMetrics()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics, cache: createTtsCache() }))

    const first = await p.synthesize({ text: 'Xin chào', language: 'vi' })
    const second = await p.synthesize({ text: 'Xin   chào  ', language: 'vi' })

    expect(first.cacheHit).toBe(false)
    expect(second.cacheHit).toBe(true)
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1)
    const s = metrics.snapshot()
    expect(s.cacheHits).toBe(1)
    expect(s.cacheMisses).toBe(1)
    // Billed once, not twice — the number the cache exists to hold down.
    expect(s.charactersSynthesized).toBe('Xin chào'.length)
  })

  it('does NOT reuse audio across languages', async () => {
    const { fetchImpl } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics(), cache: createTtsCache() }))
    await p.synthesize({ text: 'Hello', language: 'vi' })
    const second = await p.synthesize({ text: 'Hello', language: 'en' })
    expect(second.cacheHit).toBe(false)
  })

  it('does NOT serve audio made by a superseded voice', async () => {
    const { fetchImpl } = mockFetchOk()
    const cache = createTtsCache()
    const selected: Record<string, string | null> = { vi: 'vi-VN-Neural2-A', en: null }
    const p1 = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics(), cache, selectedVoice: selected }))
    await p1.synthesize({ text: 'Xin chào', language: 'vi' })

    // The owner changes the voice. Stale audio must not survive the change.
    selected.vi = 'vi-VN-Chirp3-HD-Aoede'
    const p2 = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics(), cache, selectedVoice: selected }))
    const after = await p2.synthesize({ text: 'Xin chào', language: 'vi' })
    expect(after.cacheHit).toBe(false)
    expect(after.voiceName).toBe('vi-VN-Chirp3-HD-Aoede')
  })
})

describe('it stays off until a voice is chosen', () => {
  it('throws rather than picking one, and bills nothing', async () => {
    const { fetchImpl } = mockFetchOk()
    const metrics = createTtsMetrics()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics, selectedVoice: { vi: null, en: null } }))

    await expect(p.synthesize({ text: 'Xin chào', language: 'vi' })).rejects.toThrow(TtsNotConfiguredError)
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
    expect(metrics.snapshot().charactersSynthesized).toBe(0)
  })

  it('is unconfigured per language, not globally', async () => {
    const { fetchImpl } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics(), selectedVoice: { vi: 'vi-VN-Neural2-A', en: null } }))
    await expect(p.synthesize({ text: 'Hello', language: 'en' })).rejects.toThrow(TtsNotConfiguredError)
    await expect(p.synthesize({ text: 'Xin chào', language: 'vi' })).resolves.toBeTruthy()
  })

  it('refuses an unsupported language instead of substituting one', async () => {
    const { fetchImpl } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics() }))
    await expect(p.synthesize({ text: 'こんにちは', language: 'ja' })).rejects.toThrow(TtsNotConfiguredError)
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
  })

  it('refuses empty text rather than paying for silence', async () => {
    const { fetchImpl } = mockFetchOk()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics() }))
    await expect(p.synthesize({ text: '   ', language: 'vi' })).rejects.toThrow(TtsSynthesisError)
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
  })
})

describe('failures are reported, never echoed', () => {
  it('does not leak the provider response body into the error', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 403,
      json: async () => ({ error: { message: 'PERMISSION_DENIED on project 1023373437508' } }),
    } as unknown as Response)) as unknown as typeof fetch
    const metrics = createTtsMetrics()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics }))

    await expect(p.synthesize({ text: 'Xin chào', language: 'vi' })).rejects.toThrow(TtsSynthesisError)
    try {
      await p.synthesize({ text: 'Xin chào', language: 'vi' })
    } catch (e) {
      expect((e as Error).message).not.toContain('1023373437508')
      expect((e as Error).message).not.toContain('PERMISSION_DENIED')
    }
    expect(metrics.snapshot().errors).toBeGreaterThan(0)
  })

  it('never caches a failure, so a retry really retries', async () => {
    // A failed call that poisoned the cache would make the error permanent for that utterance until
    // eviction — indistinguishable from a broken voice.
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      return calls === 1
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : ({ ok: true, status: 200, json: async () => ({ audioContent: AUDIO_B64 }) } as unknown as Response)
    }) as unknown as typeof fetch

    const cache = createTtsCache()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics: createTtsMetrics(), cache }))

    await expect(p.synthesize({ text: 'Xin chào', language: 'vi' })).rejects.toThrow()
    expect(cache.size).toBe(0)

    const retry = await p.synthesize({ text: 'Xin chào', language: 'vi' })
    expect(retry.cacheHit).toBe(false)
    expect(cache.size).toBe(1)
  })

  it('counts a failed call as zero characters billed', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)) as unknown as typeof fetch
    const metrics = createTtsMetrics()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics }))
    await expect(p.synthesize({ text: 'Xin chào', language: 'vi' })).rejects.toThrow()
    expect(metrics.snapshot().charactersSynthesized).toBe(0)
  })
})

describe('the metrics are real counters, not decoration', () => {
  it('starts at zero and moves only on real events', () => {
    const m = createTtsMetrics()
    expect(m.snapshot()).toMatchObject({ requests: 0, cacheHits: 0, cacheMisses: 0, charactersSynthesized: 0, errors: 0 })
  })

  it('reports a hit rate that reflects the counters', async () => {
    const { fetchImpl } = mockFetchOk()
    const metrics = createTtsMetrics()
    const p = createGoogleTtsProvider(deps({ fetchImpl, metrics, cache: createTtsCache() }))
    await p.synthesize({ text: 'a b', language: 'vi' })
    await p.synthesize({ text: 'a b', language: 'vi' })
    await p.synthesize({ text: 'a b', language: 'vi' })
    const s = metrics.snapshot()
    expect(s.requests).toBe(3)
    expect(s.cacheHits).toBe(2)
    expect(s.hitRate).toBeCloseTo(2 / 3, 5)
  })
})
