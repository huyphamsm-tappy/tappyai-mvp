import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanChatImage, imageScanEnabled, BLOCKED_CATEGORIES } from './imageScan'
import type { ModerationOutcome } from '@/lib/ai/llm/providers/openaiModeration'

/**
 * Chat picture scan decisions. Only three categories block; any scan that cannot be completed is 'unavailable' (the route then refuses the upload), and the scan can only be
 * switched off by saying so explicitly. The provider call itself is tested in providers/openaiModeration.test.ts.
 */

const bytes = new Uint8Array([1, 2, 3])
const ok = (categories: Record<string, boolean>) => vi.fn(async (): Promise<ModerationOutcome> => ({ status: 'ok', categories }))
const unavailable = (reason: 'no_key' | 'http_error' | 'bad_answer' | 'failed') => vi.fn(async (): Promise<ModerationOutcome> => ({ status: 'unavailable', reason }))

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('scanChatImage', () => {
  it('hands the clean bytes and their type to the provider adapter once', async () => {
    const m = ok({ sexual: false })
    await scanChatImage(bytes, 'image/webp', { env: {}, moderate: m })
    expect(m).toHaveBeenCalledTimes(1)
    expect(m).toHaveBeenCalledWith(bytes, 'image/webp')
  })

  it.each(BLOCKED_CATEGORIES)('%s blocks', async (c) => {
    expect(await scanChatImage(bytes, 'image/png', { env: {}, moderate: ok({ [c]: true }) })).toBe('blocked')
  })

  it('a picture with no blocked category passes, even when other categories are flagged (e.g. harassment text in a meme is for reports, not for this gate)', async () => {
    expect(await scanChatImage(bytes, 'image/png', { env: {}, moderate: ok({ sexual: false, harassment: true }) })).toBe('ok')
  })

  it.each(['no_key', 'http_error', 'bad_answer', 'failed'] as const)('an adapter answer of %s is unavailable (never "ok")', async (reason) => {
    expect(await scanChatImage(bytes, 'image/png', { env: {}, moderate: unavailable(reason) })).toBe('unavailable')
  })

  it('switching off is explicit and calls nothing', async () => {
    const m = ok({})
    expect(await scanChatImage(bytes, 'image/png', { env: { CHAT_IMAGE_SCAN_ENABLED: 'false' }, moderate: m })).toBe('off')
    expect(m).not.toHaveBeenCalled()
  })

  it('the scan is ON unless CHAT_IMAGE_SCAN_ENABLED is exactly "false"', () => {
    expect(imageScanEnabled({})).toBe(true)
    expect(imageScanEnabled({ CHAT_IMAGE_SCAN_ENABLED: '0' })).toBe(true)
    expect(imageScanEnabled({ CHAT_IMAGE_SCAN_ENABLED: 'FALSE' })).toBe(false)
  })
})
