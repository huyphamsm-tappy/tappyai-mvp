import { describe, it, expect, vi, beforeEach } from 'vitest'
import { moderateImageWithOpenAI } from './openaiModeration'

/** The moderation adapter: request shape, and every non-answer is `unavailable` (never a made-up "clear"). */

const ENV = { OPENAI_API_KEY: 'sk-test' }
const bytes = new Uint8Array([1, 2, 3])
const answer = (categories: Record<string, boolean>, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => ({ results: [{ categories }] }) }) as unknown as Response)

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('moderateImageWithOpenAI', () => {
  it('sends the picture once, as a data URL, to the omni moderation model with the bearer key, never from the data cache', async () => {
    const f = answer({ sexual: false })
    const r = await moderateImageWithOpenAI(bytes, 'image/webp', { env: ENV, fetchImpl: f as never })
    expect(r).toEqual({ status: 'ok', categories: { sexual: false } })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/moderations')
    expect(init.cache).toBe('no-store')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const sent = JSON.parse(init.body as string)
    expect(sent.model).toBe('omni-moderation-latest')
    expect(sent.input[0].image_url.url).toBe(`data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`)
  })

  it.each([
    ['provider error', answer({}, false, 500), 'http_error'],
    ['no results', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response), 'bad_answer'],
    ['network failure', vi.fn(async () => { throw new Error('boom') }), 'failed'],
    ['unreadable body', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } }) as unknown as Response), 'failed'],
  ])('%s is unavailable', async (_n, f, reason) => {
    expect(await moderateImageWithOpenAI(bytes, 'image/png', { env: ENV, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason })
  })

  it('no key is unavailable and calls nothing', async () => {
    const f = answer({})
    expect(await moderateImageWithOpenAI(bytes, 'image/png', { env: {}, fetchImpl: f as never })).toEqual({ status: 'unavailable', reason: 'no_key' })
    expect(f).not.toHaveBeenCalled()
  })
})
