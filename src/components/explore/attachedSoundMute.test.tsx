// @vitest-environment jsdom
/**
 * Regression test for the attached-sound mute race (TikTok "use this sound").
 *
 * UAT failure (instrumented on production data): in the feed, the tap that opens
 * a clip unlocks page audio BEFORE the borrowed track's URL has resolved from
 * useMusicTrack. The old code decided muting by `soundUrl` only at play-start,
 * so the video began playing UNMUTED during the fetch gap and was never re-muted
 * once the companion audio arrived → the clip's own audio played on top of the
 * borrowed sound.
 *
 * Fix under test: the `hasSound` prop (known synchronously from the review row)
 * drives a continuously-enforced mute invariant — the video is muted from frame
 * one and stays muted through unlock and late soundUrl arrival; if the track
 * fetch fails (hasSound drops back to false) the video's own audio is restored
 * so the clip is never silent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const URL_B = 'https://x/video-b.mp4'
const SOUND = 'https://x/borrowed-sound.mp4'

let createdAudios: HTMLAudioElement[] = []

beforeEach(() => {
  cleanup() // unmount the previous test's tree — stale videos poison querySelector
  vi.resetModules() // fresh module → feedAudioUnlocked starts false each test
  createdAudios = []
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
  // Capture companion Audio instances (plain <audio> elements so the mocked
  // prototype methods and property setters all behave).
  vi.stubGlobal('Audio', function () {
    const el = document.createElement('audio')
    createdAudios.push(el as HTMLAudioElement)
    return el
  } as unknown as typeof Audio)
})

const unlock = () => window.dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('Attached-sound mute race (feed "use this sound")', () => {
  it('keeps the video muted through unlock-before-soundUrl and late companion arrival', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')

    // 1) Clip mounts knowing it borrows a sound (hasSound), but the track URL
    //    has NOT resolved yet — exactly the production ordering.
    const { rerender, container } = render(<VideoPlayer url={URL_B} active hasSound />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay')) // drives ensurePlaying deterministically
    expect(video.muted).toBe(true)

    // 2) The user's tap unlocks page audio while the fetch is still in flight.
    //    Old code: video started/stayed UNMUTED here → double audio. Must stay muted.
    unlock()
    expect(video.muted).toBe(true)

    // 3) The borrowed track resolves late → companion Audio is created with the
    //    right source and the video STAYS muted (companion owns the audio).
    rerender(<VideoPlayer url={URL_B} active hasSound soundUrl={SOUND} />)
    expect(createdAudios.length).toBe(1)
    expect(createdAudios[0].src).toBe(SOUND)
    video.dispatchEvent(new Event('canplay')) // another ensurePlaying tick
    expect(video.muted).toBe(true)
  })

  it('leaves normal clips (no attached sound) exactly as before: unlock unmutes', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')

    const { container } = render(<VideoPlayer url={URL_B} active />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    expect(video.muted).toBe(true) // locked → muted autoplay

    unlock()
    expect(video.muted).toBe(false) // unlocked → own audio, unchanged behavior
    expect(createdAudios.length).toBe(0) // no companion for normal clips
  })

  it('falls back to the video\'s own audio when the track fetch fails (never silent)', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')

    const { rerender, container } = render(<VideoPlayer url={URL_B} active hasSound />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    unlock()
    expect(video.muted).toBe(true) // borrowed sound still intended

    // Parent finished the fetch with no track → hasSound drops to false.
    rerender(<VideoPlayer url={URL_B} active hasSound={false} />)
    expect(video.muted).toBe(false) // one-shot fallback to the clip's own audio
  })
})
