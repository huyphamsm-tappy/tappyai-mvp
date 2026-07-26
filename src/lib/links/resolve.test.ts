import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveLink } from './resolve'
import { POSTER_PLACEHOLDER } from './platforms'

const realFetch = global.fetch

afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks() })
beforeEach(() => { vi.restoreAllMocks() })

function mockFetch(handler: (url: string) => { ok: boolean; json: () => unknown }) {
  global.fetch = vi.fn(async (input: unknown) => {
    const url = String(input)
    const r = handler(url)
    return { ok: r.ok, json: async () => r.json() } as Response
  }) as unknown as typeof fetch
}

describe('resolveLink — YouTube', () => {
  it('returns a deterministic hqdefault thumbnail (never empty) + oembed title', async () => {
    mockFetch(() => ({ ok: true, json: () => ({ title: 'Great clip', author_name: 'Chan' }) }))
    const r = await resolveLink('https://youtu.be/dQw4w9WgXcQ')
    expect(r).not.toBeNull()
    expect(r!.source_type).toBe('youtube')
    expect(r!.thumbnail).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(r!.title).toBe('Great clip')
    expect(r!.author).toBe('Chan')
  })
  it('still yields a non-empty thumbnail when oembed fails', async () => {
    mockFetch(() => ({ ok: false, json: () => ({}) }))
    const r = await resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(r!.thumbnail).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(r!.title).toBe('')
  })
  it('returns null for a YouTube URL with no parseable id', async () => {
    const r = await resolveLink('https://www.youtube.com/@channel')
    expect(r).toBeNull()
  })
})

describe('resolveLink — TikTok', () => {
  it('uses the oembed thumbnail when available', async () => {
    mockFetch(() => ({ ok: true, json: () => ({ thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg', title: 'dance', author_name: '@u' }) }))
    const r = await resolveLink('https://www.tiktok.com/@user/video/7222222222222222222')
    expect(r!.source_type).toBe('tiktok')
    expect(r!.thumbnail).toBe('https://p16.tiktokcdn.com/x.jpg')
    expect(r!.title).toBe('dance')
    expect(r!.author).toBe('@u')
  })
  it('falls back to the TikTok placeholder when oembed returns no thumbnail (never empty)', async () => {
    mockFetch(() => ({ ok: true, json: () => ({ thumbnail_url: null, title: '', author_name: '' }) }))
    const r = await resolveLink('https://www.tiktok.com/@user/video/7222222222222222222')
    expect(r!.thumbnail).toBe(POSTER_PLACEHOLDER.tiktok)
  })
  it('falls back to the TikTok placeholder when oembed request fails', async () => {
    mockFetch(() => ({ ok: false, json: () => ({}) }))
    const r = await resolveLink('https://www.tiktok.com/@user/video/7222222222222222222')
    expect(r!.thumbnail).toBe(POSTER_PLACEHOLDER.tiktok)
  })
})

describe('resolveLink — dropped platforms', () => {
  it('returns null for Facebook and Instagram (unsupported in V1)', async () => {
    expect(await resolveLink('https://www.facebook.com/watch?v=1')).toBeNull()
    expect(await resolveLink('https://www.instagram.com/reel/abc/')).toBeNull()
    expect(await resolveLink('https://example.com/video')).toBeNull()
  })
})
