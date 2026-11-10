// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribeSpeechWithOpenAI, OPENAI_TRANSCRIBE_MODEL, TRANSCRIBE_USD_PER_MINUTE } from './openaiTranscribe'
import { runWithSpendGate, SpendRefusal, type SpendGate, type SpendReservation, type SpendSettleStatus } from '@/lib/ai/budget/spendGate'

// The speech-to-text adapter: request shape, the spend gate BEFORE the request, and every non-answer is `unavailable` (fail closed). No network: fetch is injected.
const ENV = { OPENAI_API_KEY: 'sk-test' }
const audio = new Uint8Array([1, 2, 3, 4])
const ok = (text: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text }) }) as unknown as Response)

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('transcribeSpeechWithOpenAI', () => {
  it('posts the audio as multipart form-data to the transcription endpoint with the bearer key and returns the text', async () => {
    const f = ok('xin chào các bạn')
    const r = await transcribeSpeechWithOpenAI(audio, { durationMs: 20_000 }, { env: ENV, fetchImpl: f as never })
    expect(r).toEqual({ status: 'ok', text: 'xin chào các bạn' })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect(init.cache).toBe('no-store')
    const form = init.body as FormData
    expect(form.get('model')).toBe(OPENAI_TRANSCRIBE_MODEL)
    expect(form.get('response_format')).toBe('json')
    const file = form.get('file') as File
    expect(file.name).toBe('audio.mp4')
    expect(file.size).toBe(4)
  })

  it('silence / music (an empty text) is an OK empty transcript, not an error', async () => {
    expect(await transcribeSpeechWithOpenAI(audio, { durationMs: 5000 }, { env: ENV, fetchImpl: ok('   ') as never })).toEqual({ status: 'ok', text: '' })
  })

  it.each([
    ['provider error', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response), 'http_error'],
    ['no text field', ok(undefined), 'bad_answer'],
    ['network failure', vi.fn(async () => { throw new Error('boom') }), 'failed'],
    ['unreadable body', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad') } }) as unknown as Response), 'failed'],
  ])('%s is unavailable', async (_n, f, reason) => {
    expect(await transcribeSpeechWithOpenAI(audio, { durationMs: 5000 }, { env: ENV, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason })
  })

  it('no key calls nothing', async () => {
    const f = ok('x')
    expect(await transcribeSpeechWithOpenAI(audio, { durationMs: 5000 }, { env: {}, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason: 'no_key' })
    expect(f).not.toHaveBeenCalled()
  })

  it('a file over the provider limit, or an empty one, is refused without calling it', async () => {
    const f = ok('x')
    expect(await transcribeSpeechWithOpenAI(new Uint8Array(0), { durationMs: 5000 }, { env: ENV, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason: 'bad_input' })
    expect(await transcribeSpeechWithOpenAI(new Uint8Array(25 * 1024 * 1024 + 1), { durationMs: 5000 }, { env: ENV, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason: 'bad_input' })
    expect(f).not.toHaveBeenCalled()
  })
})

class Gate implements SpendGate {
  calls: string[] = []; reserved: number[] = []; refuse = false
  reserve(label: string, maxUsd: number): SpendReservation {
    if (this.refuse) { this.calls.push('refused'); throw new SpendRefusal('over the cap', 'budget') }
    this.calls.push(`reserve:${label}`); this.reserved.push(maxUsd)
    return { id: 1, maxUsd, label }
  }
  settle(_r: SpendReservation, actual: unknown): SpendSettleStatus { this.calls.push(`settle:${String(actual)}`); return 'ok' }
  release() { this.calls.push('release') }
  markUnknown() { this.calls.push('unknown') }
}
const KEYS = ['BENCH_SPEND_GATE', 'BENCH_SPEND_TURN_CAP_USD', 'BENCH_SPEND_RUN_CAP_USD']
const on = () => { process.env.BENCH_SPEND_GATE = '1'; process.env.BENCH_SPEND_TURN_CAP_USD = '0.05'; process.env.BENCH_SPEND_RUN_CAP_USD = '0.65' }
afterEach(() => { for (const k of KEYS) delete process.env[k] })

describe('the spend gate comes BEFORE the paid request', () => {
  it('reserves the worst case (whole minutes + 1 spare) before it sends, and settles after', async () => {
    on()
    const g = new Gate()
    let reservedBeforeSend = false
    const f = vi.fn(async () => { reservedBeforeSend = g.calls.length > 0; return { ok: true, status: 200, json: async () => ({ text: 'hi' }) } as unknown as Response })
    const r = await runWithSpendGate(g, () => transcribeSpeechWithOpenAI(audio, { durationMs: 61_000 }, { env: ENV, fetchImpl: f as never }))
    expect(r.status).toBe('ok')
    expect(reservedBeforeSend).toBe(true)
    expect(g.reserved).toEqual([3 * TRANSCRIBE_USD_PER_MINUTE])
    expect(g.calls[g.calls.length - 1]).toMatch(/^settle:/)
  })

  it('a refusal means NO request is made, and the answer is unavailable (retry later), not an exception', async () => {
    on()
    const g = new Gate(); g.refuse = true
    const f = ok('x')
    const r = await runWithSpendGate(g, () => transcribeSpeechWithOpenAI(audio, { durationMs: 10_000 }, { env: ENV, fetchImpl: f as never }))
    expect(r).toEqual({ status: 'unavailable', reason: 'spend_refused' })
    expect(f).not.toHaveBeenCalled()
  })

  it('gate ON with nothing injected refuses (no gate, no call)', async () => {
    on()
    const f = ok('x')
    expect(await transcribeSpeechWithOpenAI(audio, { durationMs: 10_000 }, { env: ENV, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason: 'spend_refused' })
    expect(f).not.toHaveBeenCalled()
  })

  it('a request that failed after being sent is settled at the reserved worst case (never released)', async () => {
    on()
    const g = new Gate()
    await runWithSpendGate(g, () => transcribeSpeechWithOpenAI(audio, { durationMs: 10_000 }, { env: ENV, fetchImpl: vi.fn(async () => { throw new Error('x') }) as never }))
    expect(g.calls).toContain(`settle:${2 * TRANSCRIBE_USD_PER_MINUTE}`)
    expect(g.calls).not.toContain('release')
  })
})
