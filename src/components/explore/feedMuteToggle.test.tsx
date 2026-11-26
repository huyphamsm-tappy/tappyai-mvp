// @vitest-environment jsdom
/**
 * The viewer's own mute choice (owner 26/11/2026): a speaker button on EACH clip. It silences that clip only; other clips keep their
 * sound, and the browser's autoplay unlock never brings the sound back while the viewer chose silence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

beforeEach(() => {
  cleanup()
  vi.resetModules()
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  window.HTMLMediaElement.prototype.pause = vi.fn()
})

const unlock = () => act(() => { window.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

describe('per-clip mute toggle', () => {
  it('muting silences a playing clip, later taps do not bring the sound back, unmuting does', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container, getByTestId } = render(<VideoPlayer url="https://x/a.mp4" active />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    unlock()
    expect(video.muted).toBe(false)

    fireEvent.click(getByTestId('video-mute-toggle'))
    expect(video.muted).toBe(true)
    unlock()
    expect(video.muted).toBe(true)

    fireEvent.click(getByTestId('video-mute-toggle'))
    expect(video.muted).toBe(false)
  })

  it('the choice survives leaving the clip and coming back (the player is unmounted when swiped away)', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const first = render(<VideoPlayer url="https://x/a.mp4" active />)
    ;(first.container.querySelector('video') as HTMLVideoElement).dispatchEvent(new Event('canplay'))
    unlock()
    fireEvent.click(first.getByTestId('video-mute-toggle')) // mute clip A
    first.unmount()

    const other = render(<VideoPlayer url="https://x/b.mp4" active />) // clip B keeps its sound
    const vb = other.container.querySelector('video') as HTMLVideoElement
    vb.dispatchEvent(new Event('canplay'))
    expect(vb.muted).toBe(false)
    other.unmount()

    const back = render(<VideoPlayer url="https://x/a.mp4" active />) // back to clip A: still silent
    const va = back.container.querySelector('video') as HTMLVideoElement
    va.dispatchEvent(new Event('canplay'))
    unlock()
    expect(va.muted).toBe(true)
  })

  it('before the first tap the button says the clip is silent, and its tap turns the sound ON (not off)', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container, getByTestId } = render(<VideoPlayer url="https://x/c.mp4" active />)
    const video = container.querySelector('video') as HTMLVideoElement
    video.dispatchEvent(new Event('canplay'))
    expect(video.muted).toBe(true) // browser autoplay rule
    expect(getByTestId('video-mute-toggle').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(getByTestId('video-mute-toggle'))
    expect(video.muted).toBe(false)
    expect(getByTestId('video-mute-toggle').getAttribute('aria-pressed')).toBe('false')
  })

  it('muting one clip leaves the other clip with its sound', async () => {
    const { default: VideoPlayer } = await import('./VideoPlayer')
    const { container, getAllByTestId } = render(<><VideoPlayer url="https://x/a.mp4" active /><VideoPlayer url="https://x/b.mp4" active /></>)
    const [a, b] = Array.from(container.querySelectorAll('video')) as HTMLVideoElement[]
    a.dispatchEvent(new Event('canplay')); b.dispatchEvent(new Event('canplay'))
    unlock()
    expect([a.muted, b.muted]).toEqual([false, false])

    fireEvent.click(getAllByTestId('video-mute-toggle')[0])
    expect([a.muted, b.muted]).toEqual([true, false])
  })
})
