// @vitest-environment jsdom
//
// The unlock contract itself, which nothing covered before: whether page audio reports as locked
// until a real click, and whether the borrowed track for an attached-sound clip actually STARTS
// on that click. The existing attachedSoundMute tests assert the video stays muted — correct, but
// silent about whether any sound ever plays.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const createdAudios: HTMLAudioElement[] = []

beforeEach(() => {
  cleanup()
  vi.resetModules() // fresh module → the unlock flag starts false in every test
  createdAudios.length = 0
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  vi.stubGlobal('Audio', function () {
    const el = document.createElement('audio')
    el.play = vi.fn().mockResolvedValue(undefined)
    createdAudios.push(el as HTMLAudioElement)
    return el
  } as unknown as typeof Audio)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const click = () => window.dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('feed audio unlock', () => {
  it('reports locked until a real click, then unlocked', async () => {
    const { isFeedAudioUnlocked } = await import('./VideoPlayer')
    expect(isFeedAudioUnlocked()).toBe(false)
    click()
    expect(isFeedAudioUnlocked()).toBe(true)
  })

  it('a plain clip autoplays MUTED and unmutes on the unlocking click', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container } = render(<VideoPlayer url="https://x/a.mp4" active />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    expect(video.muted).toBe(true)

    click()
    expect(video.muted).toBe(false)
  })

  it('an attached-sound clip STARTS its borrowed track on the unlocking click', async () => {
    // The half the old tests left open: the video correctly stays muted, but the companion Audio
    // must actually play — otherwise the clip is simply silent.
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container } = render(<VideoPlayer url="https://x/a.mp4" active hasSound soundUrl="https://x/s.mp3" />)
    const video = container.querySelector('video') as HTMLVideoElement
    // jsdom never flips `paused` because play() is mocked, and the companion deliberately refuses
    // to start while the video is paused. Make the element report what a playing clip reports.
    Object.defineProperty(video, 'paused', { value: false, configurable: true })
    video.dispatchEvent(new Event('canplay'))

    expect(createdAudios).toHaveLength(1)
    const audio = createdAudios[0]
    ;(audio.play as ReturnType<typeof vi.fn>).mockClear()

    click()

    expect(audio.play).toHaveBeenCalled()
    expect(video.muted).toBe(true) // the borrowed track owns the audio; the video stays muted
  })

  it('falls back to muted playback when the browser rejects an unmuted play', async () => {
    // iOS can refuse the unmute. The clip must keep PLAYING rather than stalling silently.
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const play = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
      .mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.play = play

    const { container } = render(<VideoPlayer url="https://x/a.mp4" active />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    click()

    await Promise.resolve(); await Promise.resolve()
    expect(video.muted).toBe(true)   // dropped back to muted
    expect(play.mock.calls.length).toBeGreaterThan(1) // and retried
  })
})
