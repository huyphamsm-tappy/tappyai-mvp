import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveLink } from './resolve'

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

describe('resolveLink — dropped platforms (V1 = YouTube only)', () => {
  it('returns null for TikTok (removed in V1) — no outbound fetch', async () => {
    global.fetch = vi.fn(async () => { throw new Error('resolver must not fetch for unsupported sources') }) as unknown as typeof fetch
    expect(await resolveLink('https://www.tiktok.com/@user/video/7222222222222222222')).toBeNull()
  })
  it('returns null for Facebook and Instagram and unknown', async () => {
    expect(await resolveLink('https://www.facebook.com/watch?v=1')).toBeNull()
    expect(await resolveLink('https://www.instagram.com/reel/abc/')).toBeNull()
    expect(await resolveLink('https://example.com/video')).toBeNull()
  })
})
