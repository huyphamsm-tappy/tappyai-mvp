import { describe, it, expect, vi, afterEach } from 'vitest'
import type { LanguageModelV1, LanguageModelV1StreamPart } from 'ai'
import { withFallback } from './fallback'

const streamOf = (parts: LanguageModelV1StreamPart[], delayMs = 0) => new ReadableStream<LanguageModelV1StreamPart>({
  async start(c) { if (delayMs) await new Promise(r => setTimeout(r, delayMs)); for (const p of parts) c.enqueue(p); c.close() },
})
const finish: LanguageModelV1StreamPart = { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } }
const model = (name: string, impl: Partial<LanguageModelV1>): LanguageModelV1 => ({
  specificationVersion: 'v1', provider: name, modelId: name, defaultObjectGenerationMode: 'json',
  doGenerate: async () => { throw new Error('unused') }, doStream: async () => { throw new Error('unused') }, ...impl,
}) as LanguageModelV1
const read = async (s: ReadableStream<LanguageModelV1StreamPart>) => { const out: LanguageModelV1StreamPart[] = []; const r = s.getReader(); for (;;) { const n = await r.read(); if (n.done) return out; out.push(n.value) } }
const opts = { inputFormat: 'messages', mode: { type: 'regular' }, prompt: [] } as never

afterEach(() => vi.restoreAllMocks())

describe('withFallback — Luna fails → the default model answers', () => {
  const text = (t: string): LanguageModelV1StreamPart => ({ type: 'text-delta', textDelta: t })
  const good = model('haiku', { doStream: async () => ({ stream: streamOf([text('haiku'), finish]), rawCall: { rawPrompt: null, rawSettings: {} } }) })

  it('primary answers → its stream passes through untouched, no fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const primary = model('luna', { doStream: async () => ({ stream: streamOf([text('a'), text('b'), finish]), rawCall: { rawPrompt: null, rawSettings: {} } }) })
    const r = await withFallback(primary, good, { firstPartMs: 1000, label: 'consult' }).doStream(opts)
    const parts = await read(r.stream)
    expect(parts.filter(p => p.type === 'text-delta').map(p => (p as { textDelta: string }).textDelta).join('')).toBe('ab')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('primary throws (provider error) → fallback answers and the finish part is marked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const primary = model('luna', { doStream: async () => { throw new Error('401 invalid key') } })
    const parts = await read((await withFallback(primary, good, { firstPartMs: 1000, label: 'consult' }).doStream(opts)).stream)
    expect(parts[0]).toEqual(text('haiku'))
    expect((parts.at(-1) as { providerMetadata?: { tappy?: { fellBack?: boolean } } }).providerMetadata?.tappy?.fellBack).toBe(true)
    expect(String(warn.mock.calls[0][0])).toContain('tappyai_llm_fallback')
  })

  it('first part is an error → fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const primary = model('luna', { doStream: async () => ({ stream: streamOf([{ type: 'error', error: new Error('overloaded') }]), rawCall: { rawPrompt: null, rawSettings: {} } }) })
    const parts = await read((await withFallback(primary, good, { firstPartMs: 1000, label: 'consult' }).doStream(opts)).stream)
    expect(parts[0]).toEqual(text('haiku'))
  })

  it('nothing within the first-part timeout → fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const primary = model('luna', { doStream: async () => ({ stream: streamOf([text('late'), finish], 200), rawCall: { rawPrompt: null, rawSettings: {} } }) })
    const parts = await read((await withFallback(primary, good, { firstPartMs: 30, label: 'consult' }).doStream(opts)).stream)
    expect(parts[0]).toEqual(text('haiku'))
  })

  it('doGenerate: primary throws → fallback result, marked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const primary = model('luna', { doGenerate: async () => { throw new Error('timeout') } })
    const fb = model('haiku', { doGenerate: async () => ({ text: '{}', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, rawCall: { rawPrompt: null, rawSettings: {} } }) as never })
    const r = await withFallback(primary, fb, { firstPartMs: 1000, label: 'intent' }).doGenerate(opts)
    expect(r.text).toBe('{}')
    expect((r.providerMetadata as { tappy?: { fellBack?: boolean } }).tappy?.fellBack).toBe(true)
  })
})

describe('withFallback — the retry is the last try (owner 30/09: HAIKU_FALLBACK off, no Anthropic)', () => {
  it('a second failure is the error of the call: nothing else is called', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let calls = 0
    const failing = () => model('luna', { doGenerate: async () => { calls++; throw new Error('503') } })
    await expect(withFallback(failing(), failing(), { firstPartMs: 1000, label: 'fast', fallbackKind: 'luna_retry' }).doGenerate(opts)).rejects.toThrow('503')
    expect(calls).toBe(2)
  })

  it('a long single-shot answer is not cut at the first-part wait: generateMs governs doGenerate', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const slow = model('luna', { doGenerate: async () => { await new Promise(r => setTimeout(r, 60)); return { text: 'ok', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, rawCall: { rawPrompt: null, rawSettings: {} } } as never } })
    const r = await withFallback(slow, slow, { firstPartMs: 10, generateMs: 1000, label: 'smart' }).doGenerate(opts)
    expect((r as { text?: string }).text).toBe('ok')
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('🔑 SSRF: supportsImageUrls survives the wrapper (a spread drops the SDK getter)', () => {
    const withGetter = Object.create({ get supportsImageUrls() { return true } }, Object.getOwnPropertyDescriptors(model('luna', {})))
    expect({ ...withGetter }.supportsImageUrls).toBeUndefined() // the trap itself
    expect(withFallback(withGetter as LanguageModelV1, withGetter as LanguageModelV1, { firstPartMs: 10, label: 'vision' }).supportsImageUrls).toBe(true)
  })
})
