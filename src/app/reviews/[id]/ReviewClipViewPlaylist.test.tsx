// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// ── Owner screenshot 27/11/2026: an account with 3 clips opened one clip as "1 / 1" and could not swipe to the others ──
// The route hands the viewer exactly the clip the URL names (a shared link never opens a feed). After that first paint the
// viewer asks the PUBLIC feed of the same creator (the one their profile grid already uses) and swaps in the playlist, keeping
// the same clip active. Nothing private is requested; a failed read leaves the single clip exactly as before.

const h = vi.hoisted(() => ({ viewer: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: h.back, replace: h.replace, push: vi.fn() }) }))
vi.mock('@/lib/nav/inAppBack', () => ({ goBack: vi.fn() }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }) }))
vi.mock('@/app/reviews/ProfileTab', () => ({
  ClipViewer: (p: Record<string, unknown>) => { h.viewer(p); return <div data-testid="viewer" /> },
}))

import ReviewClipView from './ReviewClipView'
import type { Review } from '@/app/reviews/feedShared'

const rv = (id: string, over: Record<string, unknown> = {}) => ({ id, user_id: 'creator-1', content_type: 'video', media_url: `https://m/${id}.mp4`, ...over }) as unknown as Review
const lastProps = () => h.viewer.mock.calls[h.viewer.mock.calls.length - 1][0] as { posts: Review[]; startIndex: number }
const feed = (ids: string[]) => ({ ok: true, json: async () => ({ reviews: ids.map(id => rv(id)) }) })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { h.viewer.mockClear(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

describe('ReviewClipView playlist', () => {
  it('first paints ONLY the clip the URL names (no waiting, no feed handed by the server)', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<ReviewClipView review={rv('b')} me="creator-1" />)
    expect(lastProps().posts.map(p => p.id)).toEqual(['b'])
    expect(lastProps().startIndex).toBe(0)
  })

  it('🚨 then swaps in the creator\'s other clips and keeps the opened one active (3 clips, opened the middle one)', async () => {
    fetchMock.mockResolvedValue(feed(['a', 'b', 'c']))
    const opened = rv('b', { comment_count: 7, liked_by_me: true })
    render(<ReviewClipView review={opened} me="creator-1" />)
    await waitFor(() => expect(lastProps().posts.map(p => p.id)).toEqual(['a', 'b', 'c']))
    expect(lastProps().startIndex).toBe(1)
    // the opened clip keeps the server's richer row (like/save/comment state), not the feed's copy
    expect(lastProps().posts[1]).toBe(opened)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/reviews\/feed\?userId=creator-1&limit=50&lang=vi/)
  })

  it('a clip the public feed does not list (held / hidden for others) still opens, first, followed by the feed', async () => {
    fetchMock.mockResolvedValue(feed(['a', 'c']))
    render(<ReviewClipView review={rv('z')} me="creator-1" />)
    await waitFor(() => expect(lastProps().posts.map(p => p.id)).toEqual(['z', 'a', 'c']))
    expect(lastProps().startIndex).toBe(0)
  })

  it('a failed or refused read leaves the single clip as it was', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<ReviewClipView review={rv('b')} me={null} />)
    await new Promise(r => setTimeout(r, 20))
    expect(lastProps().posts.map(p => p.id)).toEqual(['b'])
    fetchMock.mockRejectedValue(new Error('network'))
    h.viewer.mockClear()
    render(<ReviewClipView review={rv('b2')} me={null} />)
    await new Promise(r => setTimeout(r, 20))
    expect(lastProps().posts.map(p => p.id)).toEqual(['b2'])
  })

  it('a clip with no author id asks for nothing', () => {
    render(<ReviewClipView review={rv('b', { user_id: undefined })} me={null} />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a feed with only this clip changes nothing (no needless remount)', async () => {
    fetchMock.mockResolvedValue(feed(['b']))
    render(<ReviewClipView review={rv('b')} me={null} />)
    await new Promise(r => setTimeout(r, 20))
    expect(lastProps().posts.map(p => p.id)).toEqual(['b'])
    expect(h.viewer).toHaveBeenCalledTimes(1)
  })
})
