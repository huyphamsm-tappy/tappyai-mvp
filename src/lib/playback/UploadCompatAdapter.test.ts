// @vitest-environment jsdom
/**
 * WEB-EXPLORE-YOUTUBE-001 Phase 1 — UploadCompatAdapter delegation rule.
 *
 * Guards the highest risk in Phase 1 (implementation plan R1/R2): the adapter must
 * NOT command the <video> element directly. Upload pause/resume has to go through
 * the legacy component's own toggle so its user-intent flag stays correct —
 * otherwise the 300ms self-healing watchdog resumes the clip and "pause won't
 * stick" regresses.
 */
import { describe, it, expect, vi } from 'vitest'
import { UploadCompatAdapter, type LegacyUploadHandle } from './UploadCompatAdapter'

function mkVideo(over: Partial<HTMLVideoElement> = {}) {
  return { paused: false, ended: false, error: null, readyState: 4, muted: false, currentTime: 0, duration: 30, ...over } as unknown as HTMLVideoElement
}

function mkHandle(video: HTMLVideoElement | null) {
  const togglePlay = vi.fn()
  const handle: LegacyUploadHandle = { togglePlay, getVideo: () => video }
  return { handle, togglePlay }
}

describe('UploadCompatAdapter — delegation rule', () => {
  it('pauses a playing clip via the legacy toggle (never video.pause())', () => {
    const video = mkVideo({ paused: false })
    const { handle, togglePlay } = mkHandle(video)
    const videoPause = vi.fn()
    ;(video as unknown as { pause: () => void }).pause = videoPause

    new UploadCompatAdapter(() => handle).pause()

    expect(togglePlay).toHaveBeenCalledTimes(1)   // went through legacy intent path
    expect(videoPause).not.toHaveBeenCalled()     // did NOT command the element
  })

  it('resumes a paused clip via the legacy toggle', () => {
    const { handle, togglePlay } = mkHandle(mkVideo({ paused: true }))
    new UploadCompatAdapter(() => handle).play()
    expect(togglePlay).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: pausing an already-paused clip does nothing', () => {
    const { handle, togglePlay } = mkHandle(mkVideo({ paused: true }))
    new UploadCompatAdapter(() => handle).pause()
    expect(togglePlay).not.toHaveBeenCalled()     // a toggle here would RESUME it
  })

  it('is idempotent: playing an already-playing clip does nothing', () => {
    const { handle, togglePlay } = mkHandle(mkVideo({ paused: false }))
    new UploadCompatAdapter(() => handle).play()
    expect(togglePlay).not.toHaveBeenCalled()     // a toggle here would PAUSE it
  })

  it('stop() pauses via the toggle and resets position', () => {
    const video = mkVideo({ paused: false, currentTime: 12 })
    const { handle, togglePlay } = mkHandle(video)
    new UploadCompatAdapter(() => handle).stop()
    expect(togglePlay).toHaveBeenCalledTimes(1)
    expect(video.currentTime).toBe(0)
  })

  it('applyAudioUnlocked is a no-op — legacy owns audio unlock', () => {
    const { handle, togglePlay } = mkHandle(mkVideo())
    expect(() => new UploadCompatAdapter(() => handle).applyAudioUnlocked()).not.toThrow()
    expect(togglePlay).not.toHaveBeenCalled()
  })
})

describe('UploadCompatAdapter — state reporting', () => {
  it('reads state from the element (authoritative)', () => {
    const { handle } = mkHandle(mkVideo({ paused: false, muted: false, currentTime: 5, duration: 30 }))
    const s = new UploadCompatAdapter(() => handle).getState()
    expect(s.status).toBe('playing')
    expect(s.muted).toBe(false)
    expect(s.positionSec).toBe(5)
    expect(s.durationSec).toBe(30)
    expect(new UploadCompatAdapter(() => handle).capabilities.stateIsAuthoritative).toBe(true)
  })

  it('maps paused / buffering / ended', () => {
    const paused = new UploadCompatAdapter(() => mkHandle(mkVideo({ paused: true })).handle)
    expect(paused.getState().status).toBe('paused')

    const buffering = new UploadCompatAdapter(() => mkHandle(mkVideo({ paused: false, readyState: 1 })).handle)
    expect(buffering.getState().status).toBe('buffering')

    const ended = new UploadCompatAdapter(() => mkHandle(mkVideo({ ended: true })).handle)
    expect(ended.getState().status).toBe('ended')
  })

  it('degrades safely when there is no element yet', () => {
    const adapter = new UploadCompatAdapter(() => mkHandle(null).handle)
    expect(adapter.getState().status).toBe('idle')
    expect(() => { adapter.play(); adapter.pause(); adapter.stop(); adapter.seek(3) }).not.toThrow()
  })
})
