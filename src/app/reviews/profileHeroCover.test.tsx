// @vitest-environment jsdom
// Phase 7 closeout 8B — the Explore profile hero uses the profile's own cover photo when it has one, else the gradient.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

vi.mock('@/components/media/SafeImage', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/image', () => ({ default: (p: any) => <img src={typeof p.src === 'string' ? p.src : ''} alt={p.alt || ''} /> }))
vi.mock('next/link', () => ({ default: (p: any) => <a href={typeof p.href === 'string' ? p.href : '#'}>{p.children}</a> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/explore/VideoPlayer', () => ({ default: () => <div /> }))
vi.mock('@/lib/explore/behaviorTracker', () => ({ attachWatchTracker: () => () => {} }))
vi.mock('@/components/LinkPoster', () => ({ default: () => null }))
vi.mock('@/lib/ui/gridFill', () => ({ trailingFillerCount: () => 0 }))
vi.mock('@/lib/userMemory', () => ({ getUserPreferences: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => { const b: any = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [] }) }; return b } }) }))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: vi.fn() }) }))

import { ProfileTab } from './ProfileTab'

const mockFetch = (cover: string | null) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (url.startsWith('/api/users/')) return { ok: true, json: async () => ({ full_name: 'A', avatar_url: null, follower_count: 0, following_count: 0, review_count: 0, cover_url: cover }) } as Response
  return { ok: true, json: async () => ({ reviews: [] }) } as Response
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Explore profile hero background', () => {
  it('uses the cover photo when the profile has one', async () => {
    mockFetch('https://storage.googleapis.com/tappyai-media-prod/covers/u1.webp')
    const { container } = render(<ProfileTab userId="u1" viewerId={null} />)
    await waitFor(() => expect(container.querySelector('[data-profile-hero-bg="cover"]')).toBeTruthy())
    expect((container.querySelector('[data-profile-hero-bg]') as HTMLElement).style.backgroundImage).toContain('covers/u1.webp')
  })
  it('keeps the gradient without a cover, and ignores an unsafe value', async () => {
    mockFetch('javascript:alert(1)')
    const { container } = render(<ProfileTab userId="u2" viewerId={null} />)
    await waitFor(() => expect(container.querySelector('[data-profile-hero-bg]')).toBeTruthy())
    expect(container.querySelector('[data-profile-hero-bg="gradient"]')).toBeTruthy()
  })
})
