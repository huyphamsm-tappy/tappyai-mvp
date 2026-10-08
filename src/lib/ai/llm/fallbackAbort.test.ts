// Phase 8 M1 — role `agent`: a timed-out (or failed) primary is ABORTED before the one retry starts, so the original request never
// keeps running — and billing — beside the retry. Other roles keep the Phase 7 behaviour (pinned in fallback.test.ts).
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { LanguageModelV1 } from 'ai'
import { withFallback, generateAbortingPrimary } from './fallback'

const model = (name: string, impl: Partial<LanguageModelV1>): LanguageModelV1 => ({
  specificationVersion: 'v1', provider: name, modelId: name, defaultObjectGenerationMode: 'json',
  doGenerate: async () => { throw new Error('unused') }, doStream: async () => { throw new Error('unused') }, ...impl,
}) as LanguageModelV1
const opts = (signal?: AbortSignal) => ({ inputFormat: 'messages', mode: { type: 'regular' }, prompt: [], abortSignal: signal }) as never
const ok = (text: string) => ({ text, finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 }, rawCall: { rawPrompt: null, rawSettings: {} } })

afterEach(() => vi.restoreAllMocks())

describe('generateAbortingPrimary (role agent)', () => {
  it('timeout → the primary signal is aborted BEFORE the retry is called; the result is marked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const order: string[] = []
    let primarySignal: AbortSignal | undefined
    const primary = model('luna', {
      doGenerate: (o) => {
        primarySignal = (o as { abortSignal?: AbortSignal }).abortSignal
        primarySignal?.addEventListener('abort', () => order.push('primary_aborted'))
        return new Promise(() => { /* hangs: never answers */ })
      },
    })
    const retry = model('luna', { doGenerate: async () => { order.push('retry_called'); return ok('retry') as never } })
    const r = await generateAbortingPrimary(primary, retry, { firstPartMs: 20, generateMs: 20, label: 'agent', fallbackKind: 'luna_retry', abortPrimaryOnTimeout: true }, opts())
    expect(primarySignal?.aborted).toBe(true)
    expect(order).toEqual(['primary_aborted', 'retry_called'])
    expect((r.providerMetadata as { tappy: Record<string, unknown> }).tappy).toMatchObject({ fellBack: true, primaryAborted: true })
  })

  it('the caller aborting cancels the primary and does NOT retry', async () => {
    const ctrl = new AbortController()
    let primarySignal: AbortSignal | undefined
    const retry = vi.fn(async () => ok('retry') as never)
    const primary = model('luna', { doGenerate: (o) => { primarySignal = (o as { abortSignal?: AbortSignal }).abortSignal; return new Promise((_, rej) => primarySignal!.addEventListener('abort', () => rej(new Error('aborted')))) } })
    const p = generateAbortingPrimary(primary, model('luna', { doGenerate: retry }), { firstPartMs: 5_000, label: 'agent', abortPrimaryOnTimeout: true }, opts(ctrl.signal))
    ctrl.abort()
    await expect(p).rejects.toThrow()
    expect(primarySignal?.aborted).toBe(true)
    expect(retry).not.toHaveBeenCalled()
  })

  it('primary answers in time → no abort, no retry', async () => {
    let primarySignal: AbortSignal | undefined
    const retry = vi.fn(async () => ok('retry') as never)
    const primary = model('luna', { doGenerate: async (o) => { primarySignal = (o as { abortSignal?: AbortSignal }).abortSignal; return ok('primary') as never } })
    const r = await withFallback(primary, model('luna', { doGenerate: retry }), { firstPartMs: 1000, label: 'agent', abortPrimaryOnTimeout: true }).doGenerate(opts())
    expect(r.text).toBe('primary')
    expect(primarySignal?.aborted).toBe(false)
    expect(retry).not.toHaveBeenCalled()
  })

  it('other roles are unchanged: without the option the primary is not given a cancellable signal of ours', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let primarySignal: AbortSignal | undefined
    const primary = model('luna', { doGenerate: (o) => { primarySignal = (o as { abortSignal?: AbortSignal }).abortSignal; return new Promise(() => {}) } })
    const r = await withFallback(primary, model('luna', { doGenerate: async () => ok('retry') as never }), { firstPartMs: 20, label: 'consult' }).doGenerate(opts())
    expect(r.text).toBe('retry')
    expect(primarySignal).toBeUndefined()
  })
})
