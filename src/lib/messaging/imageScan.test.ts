import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanChatImage, imageScanEnabled, BLOCKED_CATEGORIES } from './imageScan'

/**
 * Chat picture scan (OpenAI omni-moderation, free). Only three categories block; any scan that cannot be completed is 'unavailable'
 * (the route then refuses the upload), and the scan can only be switched off by saying so explicitly.
 */

const ENV = { OPENAI_API_KEY: 'sk-test' }
const bytes = new Uint8Array([1, 2, 3])
const answer = (categories: Record<string, boolean>, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => ({ results: [{ categories }] }) }) as unknown as Response)

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('scanChatImage', () => {
  it('sends the picture once, as a data URL, to the omni moderation model with the bearer key', async () => {
    const f = answer({ sexual: false })
    await scanChatImage(bytes, 'image/webp', { env: ENV, fetchImpl: f as never })
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/moderations')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    const sent = JSON.parse(init.body as string)
    expect(sent.model).toBe('omni-moderation-latest')
    expect(sent.input[0].image_url.url).toBe(`data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`)
  })

  it.each(BLOCKED_CATEGORIES)('%s blocks', async (c) => {
    expect(await scanChatImage(bytes, 'image/png', { env: ENV, fetchImpl: answer({ [c]: true }) as never })).toBe('blocked')
  })

  it('a picture with no blocked category passes, even when other categories are flagged (e.g. harassment text in a meme is for reports, not for this gate)', async () => {
    expect(await scanChatImage(bytes, 'image/png', { env: ENV, fetchImpl: answer({ sexual: false, harassment: true }) as never })).toBe('ok')
  })

  it.each([
    ['provider error', answer({}, false, 500)],
    ['no results', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response)],
    ['network failure', vi.fn(async () => { throw new Error('boom') })],
    ['unreadable body', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } }) as unknown as Response)],
  ])('%s is unavailable (never "ok")', async (_n, f) => {
    expect(await scanChatImage(bytes, 'image/png', { env: ENV, fetchImpl: f as never })).toBe('unavailable')
  })

  it('no key is unavailable and calls nothing; switching off is explicit and calls nothing', async () => {
    const f = answer({})
    expect(await scanChatImage(bytes, 'image/png', { env: {}, fetchImpl: f as never })).toBe('unavailable')
    expect(await scanChatImage(bytes, 'image/png', { env: { CHAT_IMAGE_SCAN_ENABLED: 'false' }, fetchImpl: f as never })).toBe('off')
    expect(f).not.toHaveBeenCalled()
  })

  it('the scan is ON unless CHAT_IMAGE_SCAN_ENABLED is exactly "false"', () => {
    expect(imageScanEnabled({})).toBe(true)
    expect(imageScanEnabled({ CHAT_IMAGE_SCAN_ENABLED: '0' })).toBe(true)
    expect(imageScanEnabled({ CHAT_IMAGE_SCAN_ENABLED: 'FALSE' })).toBe(false)
  })
})
