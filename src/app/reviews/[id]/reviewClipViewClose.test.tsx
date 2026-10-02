// @vitest-environment jsdom
/**
 * Closing the route-level clip viewer must never leave the product — and must return to the
 * ACTUAL parent when there is one.
 *
 * 🚨 The first version of this used `window.history.length > 1`. A browser's blank new tab already
 * counts as a history entry, so a SHARED LINK opened in a fresh tab measured 2, called
 * `router.back()`, and landed the user on `about:blank`.
 *
 * 🚨 The second version used `document.referrer`, which the browser sets once per document load
 * and never on a client-side navigation — so Profile → (tap a clip) → close pushed the FEED,
 * because the tab's referrer was still empty from when `/profile` was opened (Phase 7, item 7).
 *
 * The signal is now the per-tab in-app history depth that `lib/nav/inAppBack` keeps from the
 * router's own pathname changes. Both failure modes are pinned here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { recordNavigation } from '@/lib/nav/inAppBack'

const { push, back, replace } = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, back, replace, refresh: vi.fn() }) }))
// Only the close affordance matters here; the viewer itself is covered by its own tests.
vi.mock('@/app/reviews/ProfileTab', () => ({
  ClipViewer: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>close</button>,
}))

import ReviewClipView from './ReviewClipView'

const REVIEW = { id: 'r1', content_type: 'video', media_url: 'https://x/a.mp4' } as any

function withReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true })
}

beforeEach(() => { cleanup(); push.mockClear(); back.mockClear(); replace.mockClear(); sessionStorage.clear() })

describe('ReviewClipView — close', () => {
  it('goes back when an app page led here — Profile → clip → close returns to Profile', () => {
    // The tab opened on /profile (so the document referrer is EMPTY) and client-navigated here.
    withReferrer('')
    recordNavigation('/profile', { popped: false })
    recordNavigation('/reviews/r1', { popped: false })
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('🚨 a shared link in a fresh tab goes to the feed, NOT back off-site', () => {
    withReferrer('')
    recordNavigation('/reviews/r1', { popped: false })
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(replace).toHaveBeenCalledWith('/reviews')
    expect(back).not.toHaveBeenCalled()
  })

  it('🚨 a link opened from another site goes to the feed, not back to that site', () => {
    withReferrer('https://zalo.me/some-chat')
    recordNavigation('/reviews/r1', { popped: false })
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(replace).toHaveBeenCalledWith('/reviews')
    expect(back).not.toHaveBeenCalled()
  })

  it('the referrer no longer decides anything: a same-origin referrer with no in-app entry still falls back', () => {
    withReferrer(`${window.location.origin}/profile/favorites`)
    recordNavigation('/reviews/r1', { popped: false })
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(replace).toHaveBeenCalledWith('/reviews')
    expect(back).not.toHaveBeenCalled()
  })
})
