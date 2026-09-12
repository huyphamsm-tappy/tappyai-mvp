// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

// ── `ask_tappy_place` · phase `click` on the review DETAIL page ─────────────
//
// The third of the three surfaces that offer "Hỏi Tappy về chỗ này". Same event,
// same shape, its own `source_surface` — so the product can see which entry point
// people actually use, and join each click to the verdict `/api/chat` reaches.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/reviews/review-42',
  useSearchParams: () => new URLSearchParams(),
}))
// Media, music and the action buttons that reach for Supabase or the share sheet are not what this
// file guards; each is a marker.
vi.mock('@/components/explore/VideoPlayer', () => ({ __esModule: true, default: () => null, isFeedAudioUnlocked: () => true }))
vi.mock('@/modules/music', () => ({ useMusicTrack: () => ({ track: null }), getPreviewUrl: () => null }))
vi.mock('./ReviewCommentButton', () => ({ __esModule: true, default: () => null }))
vi.mock('./ReviewShareButton', () => ({ __esModule: true, default: () => null }))
vi.mock('./ReviewLikeButton', () => ({ __esModule: true, default: () => null }))
vi.mock('./ReviewSaveButton', () => ({ __esModule: true, default: () => null }))
vi.mock('../ReviewMusicCard', () => ({ __esModule: true, default: () => null }))

const trackMock = vi.fn()
vi.mock('@/lib/tracking/tracker', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

import ReviewDetailView from './ReviewDetailView'

afterEach(() => { cleanup(); trackMock.mockClear() })

const REVIEW = {
  id: 'review-42',
  user_id: 'u1',
  place_name: 'GÓC HUẾ - Nguyễn Thái Bình',
  place_address: '155 Nguyễn Thái Bình, Quận 1, TP.HCM' as string | null,
  rating: 5,
  body: 'Bún bò chuẩn vị Huế',
  photos: ['https://example.com/p.jpg'],
  is_verified: null,
  like_count: 3,
  music: null,
  created_at: '2026-09-12T08:00:00.000Z',
  content_type: 'photo',
  media_url: null,
  thumbnail: null,
  source_type: 'upload',
  source_url: null,
  profiles: { full_name: 'Huy', avatar_url: null },
}

function renderDetail(over: Partial<typeof REVIEW> = {}) {
  return render(
    <ReviewDetailView reviewId="review-42" review={{ ...REVIEW, ...over }} initialLiked={false} initialSaved={false} commentCount={0} />,
  )
}
const bridge = (c: HTMLElement) => c.querySelector<HTMLAnchorElement>('a[href^="/chat?q="]')
const press = (a: HTMLAnchorElement) => { a.addEventListener('click', e => e.preventDefault()); fireEvent.click(a) }

describe('review detail — the bridge and its click event', () => {
  it('offers the bridge with ctx=<review id> and emits ONE ask_tappy_place · source_surface review_detail', () => {
    const { container } = renderDetail()
    const a = bridge(container)
    expect(a, 'the detail page must offer a way to ask Tappy about the place').toBeTruthy()
    expect(new URL(a!.getAttribute('href')!, 'http://localhost').searchParams.get('ctx')).toBe('review-42')
    expect(trackMock, 'rendering is not a click').not.toHaveBeenCalled()
    press(a!)
    expect(trackMock).toHaveBeenCalledTimes(1)
    expect(trackMock).toHaveBeenCalledWith('ask_tappy_place', {
      phase: 'click', review_id: 'review-42', source_surface: 'review_detail', clip_target_status: 'unknown', has_address: true,
    })
  })

  it('has_address follows the row — null address reads as false', () => {
    const { container } = renderDetail({ place_address: null })
    press(bridge(container)!)
    expect(trackMock.mock.calls[0][1]).toMatchObject({ has_address: false })
  })

  it('carries no place name, address, caption or author — ids and enums only', () => {
    const { container } = renderDetail()
    press(bridge(container)!)
    const payload = JSON.stringify(trackMock.mock.calls[0][1])
    for (const leak of ['GÓC HUẾ', 'Nguyễn Thái Bình', 'Bún bò', 'Huy']) expect(payload, leak).not.toContain(leak)
    expect(Object.keys(trackMock.mock.calls[0][1]).sort()).toEqual(['clip_target_status', 'has_address', 'phase', 'review_id', 'source_surface'])
  })

  it('a share-only post has no bridge and therefore emits nothing', () => {
    const { container } = renderDetail({ place_name: 'Chia sẻ' })
    expect(bridge(container)).toBeNull()
    expect(trackMock).not.toHaveBeenCalled()
  })
})
