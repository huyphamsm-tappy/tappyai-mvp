// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode, createRef } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import VideoPlayer, { type VideoPlayerHandle } from './VideoPlayer'

/**
 * ============================================================================
 * THE SESSION MUST SURVIVE A REACT REMOUNT
 * ============================================================================
 *
 * 🚨 THE BUG THIS PINS, AND WHY IT HID FOR SO LONG.
 *
 * React 18 StrictMode mounts, unmounts and remounts every component in dev. The
 * player's teardown effect called `session.dispose()`, and the session was
 * created in the RENDER BODY behind a `if (ref.current === null)` guard — which
 * the remount does not re-run. So the ref kept pointing at a disposed session
 * for the rest of the page's life.
 *
 * `DefaultPlaybackSession` ignores every input once disposed, so
 * `onUserPauseToggle()` became a silent no-op and NO CLIP COULD BE PAUSED IN
 * DEV — the feed as well as Explore. Production, which does not double-invoke,
 * was fine. A bug that is invisible in the build you ship and present in the one
 * you develop against is exactly the kind that survives review, so it gets a
 * test that runs under StrictMode rather than a comment.
 */

// jsdom implements neither. The player calls both from its effects.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true })
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true })
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const renderPlayer = (strict: boolean) => {
  const ref = createRef<VideoPlayerHandle>()
  const el = (
    <VideoPlayer ref={ref} url="https://example.com/clip.mp4" sourceType="upload" active />
  )
  render(strict ? <StrictMode>{el}</StrictMode> : el)
  return ref
}

describe('under StrictMode, which is how dev runs', () => {
  it('hands the feed a session that is NOT disposed', () => {
    const ref = renderPlayer(true)
    expect(ref.current, 'the handle must exist').toBeTruthy()
    // 🚨 This is the assertion that would have caught it. Before the fix the
    // remount left the ref pointing at the session the unmount had disposed.
    expect(ref.current!.isDisposed()).toBe(false)
  })

  it('accepts a user pause — the input a disposed session silently swallows', () => {
    const ref = renderPlayer(true)
    expect(ref.current!.isUserPaused()).toBe(false)

    act(() => { ref.current!.onUserPauseToggle() })
    expect(ref.current!.isUserPaused(), 'pause must register').toBe(true)

    act(() => { ref.current!.onUserPauseToggle() })
    expect(ref.current!.isUserPaused(), 'and resume must clear it').toBe(false)
  })

  it('keeps the pause STICKY, so autoplay cannot undo it', () => {
    // The 300ms watchdog exists to re-start a clip the browser stopped. It must
    // not re-start one the user stopped — `isAutoplayEligible` is what it asks.
    const ref = renderPlayer(true)
    expect(ref.current!.isAutoplayEligible()).toBe(true)

    act(() => { ref.current!.onUserPauseToggle() })
    expect(ref.current!.isAutoplayEligible(), 'a user-paused clip is not eligible to autoplay').toBe(false)
  })
})

describe('without StrictMode, which is how production runs', () => {
  it('behaves identically — the fix changed the lifecycle, not the semantics', () => {
    const ref = renderPlayer(false)
    expect(ref.current!.isDisposed()).toBe(false)

    act(() => { ref.current!.onUserPauseToggle() })
    expect(ref.current!.isUserPaused()).toBe(true)
    expect(ref.current!.isAutoplayEligible()).toBe(false)
  })
})

describe('a real unmount still tears the session down', () => {
  it('disposes when the card actually goes away', () => {
    const ref = createRef<VideoPlayerHandle>()
    const { unmount } = render(
      <VideoPlayer ref={ref} url="https://example.com/clip.mp4" sourceType="upload" active />,
    )
    const handle = ref.current!
    expect(handle.isDisposed()).toBe(false)

    unmount()

    // 🔑 Recreating on demand must not turn dispose into a no-op: leaving live
    // sessions behind on every scrolled-past card is the leak the teardown
    // effect exists to prevent.
    expect(handle.isDisposed(), 'unmount still disposes').toBe(true)
  })
})

describe('the feed talks to a stable facade', () => {
  it('exposes the whole PlaybackSession surface', () => {
    // The feed expresses intent through this object and never sees a controller
    // or an element; a missing method would be a silent capability loss.
    const ref = renderPlayer(true)
    for (const method of [
      'getPlaybackState', 'isUserPaused', 'isAutoplayEligible', 'isAudioUnlocked',
      'isDocumentVisible', 'isDisposed', 'setActive', 'setInRenderWindow',
      'onUserPauseToggle', 'onAudioUnlocked', 'onVisibilityChange', 'onPageHide', 'dispose',
    ] as const) {
      expect(typeof ref.current![method], method).toBe('function')
    }
    expect(typeof ref.current!.slideId).toBe('string')
  })
})
