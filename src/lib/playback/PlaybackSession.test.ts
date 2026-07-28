// @vitest-environment jsdom
/**
 * WEB-EXPLORE-YOUTUBE-001 Phase 1 — PlaybackSession lifecycle policy.
 *
 * Pins the §5 lifecycle table exactly, for ANY substrate (the whole point of the
 * abstraction is that these rules stop being provider-specific):
 *
 *   active + visible + !userPaused   -> play()
 *   active + userPaused              -> no play (respect the user)
 *   active + hidden                  -> pause() as a SYSTEM pause
 *   in window, not active            -> pause()
 *   outside window                   -> stop()
 *   pagehide                         -> stop()
 */
import { describe, it, expect, vi } from 'vitest'
import { DefaultPlaybackSession } from './PlaybackSession'
import type { PlaybackController, TransportState } from './types'

function mkController() {
  const calls: string[] = []
  const state: TransportState = { status: 'idle', muted: true }
  const controller: PlaybackController = {
    play: () => { calls.push('play') },
    pause: () => { calls.push('pause') },
    stop: () => { calls.push('stop') },
    seek: () => { calls.push('seek') },
    applyAudioUnlocked: () => { calls.push('audio') },
    getState: () => state,
    capabilities: { canReportPosition: true, canSeek: true, stateIsAuthoritative: true },
    dispose: () => { calls.push('dispose') },
  }
  return { controller, calls }
}

const mk = () => {
  const { controller, calls } = mkController()
  return { session: new DefaultPlaybackSession('slide-1', controller), calls }
}

describe('PlaybackSession — activation', () => {
  it('plays when it becomes the active slide', () => {
    const { session, calls } = mk()
    session.setActive(true)
    expect(calls).toContain('play')
  })

  it('pauses (not stops) when it stops being active but stays in the window', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0
    session.setActive(false)
    expect(calls).toEqual(['pause'])
  })

  it('stops when it leaves the render window', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0
    session.setInRenderWindow(false)
    expect(calls).toEqual(['stop'])
  })

  it('never re-sends the same command', () => {
    const { session, calls } = mk()
    session.setActive(true)
    session.setActive(true)
    expect(calls.filter(c => c === 'play')).toHaveLength(1)
  })
})

describe('PlaybackSession — user pause is sticky', () => {
  it('pauses on user toggle and does NOT auto-resume', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0

    session.onUserPauseToggle()
    expect(calls).toEqual(['pause'])
    expect(session.isUserPaused()).toBe(true)
    expect(session.isAutoplayEligible()).toBe(false)

    // Lifecycle churn must not override the user's intent.
    session.onVisibilityChange(false)
    session.onVisibilityChange(true)
    expect(calls.filter(c => c === 'play')).toHaveLength(0)
    expect(session.isUserPaused()).toBe(true)
  })

  it('resumes on a second toggle', () => {
    const { session, calls } = mk()
    session.setActive(true)
    session.onUserPauseToggle()
    calls.length = 0
    session.onUserPauseToggle()
    expect(calls).toContain('play')
    expect(session.isUserPaused()).toBe(false)
  })

  it('ignores a pause toggle on a non-active slide', () => {
    const { session, calls } = mk()
    session.onUserPauseToggle()
    expect(session.isUserPaused()).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('PlaybackSession — visibility is a SYSTEM pause', () => {
  it('pauses when hidden and resumes when visible again', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0

    session.onVisibilityChange(false)
    expect(calls).toEqual(['pause'])
    expect(session.isUserPaused()).toBe(false) // system pause, not user intent

    calls.length = 0
    session.onVisibilityChange(true)
    expect(calls).toContain('play')
  })

  it('stops on pagehide', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0
    session.onPageHide()
    expect(calls).toEqual(['stop'])
  })
})

describe('PlaybackSession — audio unlock', () => {
  it('applies sound to the active, visible clip', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0
    session.onAudioUnlocked()
    expect(calls).toContain('audio')
    expect(session.isAudioUnlocked()).toBe(true)
  })

  it('does not apply sound to an inactive clip', () => {
    const { session, calls } = mk()
    session.onAudioUnlocked()
    expect(calls).not.toContain('audio')
  })
})

describe('PlaybackSession — teardown', () => {
  it('stops and disposes the controller', () => {
    const { session, calls } = mk()
    session.setActive(true)
    calls.length = 0
    session.dispose()
    expect(calls).toEqual(['stop', 'dispose'])
  })

  it('issues nothing after dispose', () => {
    const { session, calls } = mk()
    session.dispose()
    calls.length = 0
    session.setActive(true)
    session.onUserPauseToggle()
    expect(calls).toHaveLength(0)
  })
})
