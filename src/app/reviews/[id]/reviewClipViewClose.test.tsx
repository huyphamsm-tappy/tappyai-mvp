// @vitest-environment jsdom
/**
 * Closing the route-level clip viewer must never leave the product.
 *
 * 🚨 The first version of this used `window.history.length > 1`. A browser's blank new tab already
 * counts as a history entry, so a SHARED LINK opened in a fresh tab measured 2, called
 * `router.back()`, and landed the user on `about:blank`. Caught in a real browser, not in review —
 * which is why the rule is now tested directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

const { push, back } = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, back, replace: vi.fn(), refresh: vi.fn() }) }))
// Only the close affordance matters here; the viewer itself is covered by its own tests.
vi.mock('@/app/reviews/ProfileTab', () => ({
  ClipViewer: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>close</button>,
}))

import ReviewClipView from './ReviewClipView'

const REVIEW = { id: 'r1', content_type: 'video', media_url: 'https://x/a.mp4' } as any

function withReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, configurable: true })
}

beforeEach(() => { cleanup(); push.mockClear(); back.mockClear() })

describe('ReviewClipView — close', () => {
  it('goes back when an app page loaded this one', () => {
    withReferrer(`${window.location.origin}/profile/favorites`)
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(back).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('🚨 a shared link in a fresh tab (no referrer) goes to the feed, NOT back off-site', () => {
    withReferrer('')
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(push).toHaveBeenCalledWith('/reviews')
    expect(back).not.toHaveBeenCalled()
  })

  it('🚨 a link opened from another site goes to the feed, not back to that site', () => {
    withReferrer('https://zalo.me/some-chat')
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(push).toHaveBeenCalledWith('/reviews')
    expect(back).not.toHaveBeenCalled()
  })

  it('a malformed referrer is treated as "not ours" rather than throwing', () => {
    withReferrer('not a url')
    const { getByText } = render(<ReviewClipView review={REVIEW} me="me" />)
    fireEvent.click(getByText('close'))
    expect(push).toHaveBeenCalledWith('/reviews')
  })
})
