// @vitest-environment jsdom
/**
 * The viewer's own mute choice (owner 26/11/2026: "watch the clip without hearing it"): a speaker button on the clip.
 * While muted nothing makes sound whatever the browser's autoplay unlock says; the choice is remembered on this device.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

beforeEach(() => {
  cleanup()
  vi.resetModules()
  try { localStorage.clear() } catch { /* jsdom */ }
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

const unlock = () => window.dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('feed mute toggle', () => {
  it('muting silences an already playing clip, unmuting brings the sound back, and the choice is remembered', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container, getByTestId } = render(<VideoPlayer url="https://x/a.mp4" active />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    unlock()
    expect(video.muted).toBe(false) // unlocked: sound on

    fireEvent.click(getByTestId('video-mute-toggle'))
    expect(video.muted).toBe(true)
    expect(localStorage.getItem('tappy.feed.muted')).toBe('1')

    unlock() // a later tap must NOT bring the sound back while the viewer chose silence
    expect(video.muted).toBe(true)

    fireEvent.click(getByTestId('video-mute-toggle'))
    expect(video.muted).toBe(false)
    expect(localStorage.getItem('tappy.feed.muted')).toBe('0')
  })

  it('a remembered choice mutes the next clip from the first frame, even after the audio is unlocked', async () => {
    localStorage.setItem('tappy.feed.muted', '1')
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container } = render(<VideoPlayer url="https://x/b.mp4" active />)
    const video = container.querySelector('video') as HTMLVideoElement
    unlock()
    video.dispatchEvent(new Event('canplay'))
    expect(video.muted).toBe(true)
  })
})
