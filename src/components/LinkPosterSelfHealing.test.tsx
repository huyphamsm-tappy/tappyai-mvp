// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

// Isolate the resilience logic from the platform poster/placeholder rules.
vi.mock('@/lib/links/platforms', () => ({
  posterFor: () => 'https://cdn/poster.jpg',
  placeholderFor: () => 'https://local/placeholder.svg',
}))

import LinkPoster from './LinkPoster'

const POSTER = 'https://cdn/poster.jpg'
const PLACEHOLDER = 'https://local/placeholder.svg'
const review = { photos: ['x'], content_type: 'photo' }

const img = (c: HTMLElement) => c.querySelector('img')!
const src = (c: HTMLElement) => img(c).getAttribute('src')

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

describe('LinkPoster — self-healing thumbnail', () => {
  it('1. a successful load shows the poster and never falls back', () => {
    const { container } = render(<LinkPoster review={review} />)
    expect(src(container)).toBe(POSTER)
    fireEvent.load(img(container))
    act(() => vi.advanceTimersByTime(30_000))
    expect(src(container)).toBe(POSTER)
  })

  it('2. the first failure retries (still the poster, not the placeholder)', () => {
    const { container } = render(<LinkPoster review={review} />)
    fireEvent.error(img(container))
    act(() => vi.advanceTimersByTime(400))   // backoff → remount, same url
    expect(src(container)).toBe(POSTER)
  })

  it('3. two failures still retry; the third falls back to the placeholder', () => {
    const { container } = render(<LinkPoster review={review} />)
    fireEvent.error(img(container))
    act(() => vi.advanceTimersByTime(400))
    expect(src(container)).toBe(POSTER)      // retry 1
    fireEvent.error(img(container))
    act(() => vi.advanceTimersByTime(800))
    expect(src(container)).toBe(POSTER)      // retry 2
    fireEvent.error(img(container))          // retries exhausted
    expect(src(container)).toBe(PLACEHOLDER)
  })

  it('4. an indefinitely stalled load times out, retries, then falls back', () => {
    const { container } = render(<LinkPoster review={review} />)
    act(() => vi.advanceTimersByTime(8_000))   // stall → schedule retry
    act(() => vi.advanceTimersByTime(400))     // retry 1
    expect(src(container)).toBe(POSTER)
    act(() => vi.advanceTimersByTime(8_000))   // stall → retry
    act(() => vi.advanceTimersByTime(800))     // retry 2
    expect(src(container)).toBe(POSTER)
    act(() => vi.advanceTimersByTime(8_000))   // stall → give up
    expect(src(container)).toBe(PLACEHOLDER)
  })

  it('5. a load that succeeds after a retry keeps the poster (no placeholder)', () => {
    const { container } = render(<LinkPoster review={review} />)
    fireEvent.error(img(container))
    act(() => vi.advanceTimersByTime(400))     // retry
    fireEvent.load(img(container))             // succeeds this time
    act(() => vi.advanceTimersByTime(30_000))
    expect(src(container)).toBe(POSTER)
  })

  it('6. unmount clears every pending timer (no work after unmount)', () => {
    const { container, unmount } = render(<LinkPoster review={review} />)
    fireEvent.error(img(container))            // schedules a retry timer
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)         // cleaned up
    expect(() => act(() => vi.advanceTimersByTime(30_000))).not.toThrow()
  })

  it('7. once on the placeholder it never retries again (no infinite loop)', () => {
    const { container } = render(<LinkPoster review={review} />)
    fireEvent.error(img(container)); act(() => vi.advanceTimersByTime(400))
    fireEvent.error(img(container)); act(() => vi.advanceTimersByTime(800))
    fireEvent.error(img(container))            // → placeholder
    expect(src(container)).toBe(PLACEHOLDER)
    fireEvent.error(img(container))            // the placeholder itself errors — must NOT retry
    act(() => vi.advanceTimersByTime(60_000))
    expect(src(container)).toBe(PLACEHOLDER)   // still placeholder, no churn
    expect(vi.getTimerCount()).toBe(0)
  })

  it('8. a successful load leaves no pending timers (no duplicate requests)', () => {
    const { container } = render(<LinkPoster review={review} />)
    fireEvent.load(img(container))
    expect(vi.getTimerCount()).toBe(0)         // stall timer cleared on load
    act(() => vi.advanceTimersByTime(30_000))
    expect(src(container)).toBe(POSTER)
  })
})
