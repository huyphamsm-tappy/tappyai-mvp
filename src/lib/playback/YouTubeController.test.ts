// @vitest-environment jsdom
/**
 * WEB-EXPLORE-YOUTUBE-001 — YouTubeController transport + security.
 *
 * Locks in the two things the ticket turns on:
 *  1. Real transport exists (play/pause/stop/seek actually reach the frame). Before
 *     this controller the bridge was write-only — only unMute/setVolume were ever
 *     sent — so YouTube clips could not be paused by any route.
 *  2. Inbound player state is accepted ONLY from the official YouTube origin and
 *     only from the frame we own. Without those checks any frame on the page could
 *     inject fake playback state (architecture v3 §4, mandatory).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { YouTubeController } from './YouTubeController'

const YT_ORIGIN = 'https://www.youtube.com'

let posted: string[] = []
let fakeWindow: Window
let frame: HTMLIFrameElement
let controller: YouTubeController

/** Deliver a message the way the browser would, so the controller's real listener runs. */
function deliver(data: unknown, opts: { origin?: string; source?: unknown } = {}) {
  const ev = new MessageEvent('message', {
    data: typeof data === 'string' ? data : JSON.stringify(data),
  })
  Object.defineProperty(ev, 'origin', { value: opts.origin ?? YT_ORIGIN })
  Object.defineProperty(ev, 'source', { value: 'source' in opts ? opts.source : fakeWindow })
  window.dispatchEvent(ev)
}

const sentFuncs = () => posted.map(p => { try { return JSON.parse(p).func } catch { return null } })

beforeEach(() => {
  posted = []
  fakeWindow = { postMessage: (msg: string) => { posted.push(msg) } } as unknown as Window
  frame = document.createElement('iframe')
  Object.defineProperty(frame, 'contentWindow', { value: fakeWindow })
  controller = new YouTubeController(() => frame)
})

afterEach(() => controller.dispose())

describe('YouTubeController — transport', () => {
  it('sends the real transport commands to the frame', () => {
    controller.play()
    controller.pause()
    controller.stop()
    controller.seek(42)

    const funcs = sentFuncs()
    expect(funcs).toContain('playVideo')
    expect(funcs).toContain('pauseVideo')
    expect(funcs).toContain('stopVideo')
    expect(funcs).toContain('seekTo')

    const seek = posted.map(p => JSON.parse(p)).find(m => m.func === 'seekTo')
    expect(seek.args).toEqual([42, true])
  })

  it('still applies audio unlock (unMute + setVolume)', () => {
    controller.applyAudioUnlocked()
    const funcs = sentFuncs()
    expect(funcs).toContain('unMute')
    expect(funcs).toContain('setVolume')
  })

  it('reports authoritative-state capability', () => {
    expect(controller.capabilities.stateIsAuthoritative).toBe(true)
    expect(controller.capabilities.canSeek).toBe(true)
  })

  it('starts idle and muted before the player reports anything', () => {
    expect(controller.getState().status).toBe('idle')
    expect(controller.getState().muted).toBe(true)
  })
})

describe('YouTubeController — real player synchronization', () => {
  it('adopts state from onStateChange (not from issued commands)', () => {
    deliver({ event: 'onStateChange', info: 1 })
    expect(controller.getState().status).toBe('playing')

    deliver({ event: 'onStateChange', info: 2 })
    expect(controller.getState().status).toBe('paused')

    deliver({ event: 'onStateChange', info: 3 })
    expect(controller.getState().status).toBe('buffering')

    deliver({ event: 'onStateChange', info: 0 })
    expect(controller.getState().status).toBe('ended')
  })

  it('does NOT infer state from a command — pause() alone must not report paused', () => {
    deliver({ event: 'onStateChange', info: 1 }) // really playing
    controller.pause()
    // No player event yet, so the real state is still "playing".
    expect(controller.getState().status).toBe('playing')
    deliver({ event: 'onStateChange', info: 2 })
    expect(controller.getState().status).toBe('paused')
  })

  it('takes position/duration/muted from infoDelivery', () => {
    deliver({ event: 'infoDelivery', info: { playerState: 1, currentTime: 12.5, duration: 60, muted: false } })
    const s = controller.getState()
    expect(s.status).toBe('playing')
    expect(s.positionSec).toBe(12.5)
    expect(s.durationSec).toBe(60)
    expect(s.muted).toBe(false)
  })
})

describe('YouTubeController — security (mandatory)', () => {
  it('IGNORES messages from a non-YouTube origin', () => {
    deliver({ event: 'onStateChange', info: 1 }) // legit → playing
    deliver({ event: 'onStateChange', info: 2 }, { origin: 'https://evil.example.com' })
    expect(controller.getState().status).toBe('playing') // spoof rejected
  })

  it('IGNORES messages from a different frame', () => {
    deliver({ event: 'onStateChange', info: 1 })
    deliver({ event: 'onStateChange', info: 0 }, { source: { postMessage() {} } })
    expect(controller.getState().status).toBe('playing') // wrong source rejected
  })

  it('IGNORES malformed payloads without throwing', () => {
    deliver({ event: 'onStateChange', info: 1 })
    expect(() => {
      deliver('this is not json{{{')
      deliver({ event: 'onStateChange', info: 'not-a-number' })
      deliver(null)
    }).not.toThrow()
    expect(controller.getState().status).toBe('playing')
  })

  it('stops listening after dispose()', () => {
    deliver({ event: 'onStateChange', info: 1 })
    controller.dispose()
    deliver({ event: 'onStateChange', info: 0 })
    expect(controller.getState().status).toBe('playing') // unchanged after dispose
  })
})
