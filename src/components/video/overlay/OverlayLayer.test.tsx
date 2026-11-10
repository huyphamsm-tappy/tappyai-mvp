// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import { OverlayLayer } from './OverlayLayer'
import { useVideoTimeMs } from './hooks'
import { defaultTextLayer, type OverlayDoc } from '@/lib/media/video/overlay/schema'
import { useRef } from 'react'

afterEach(cleanup)

const doc: OverlayDoc = {
  schema_version: 1,
  layers: [
    { ...defaultTextLayer('a'), text: 'Xin chào Đà Nẵng!', start_ms: 1000, end_ms: 4000, x: 0.5, y: 0.3 },
    { ...defaultTextLayer('b'), text: 'Cả clip', start_ms: 0, end_ms: 6000 },
  ],
}

describe('OverlayLayer (playback)', () => {
  it('draws only the layers whose window contains the playing time (start inclusive, end exclusive)', () => {
    const at = (t: number) => { const { container, unmount } = render(<OverlayLayer doc={doc} timeMs={t} frameWidth={360} />); const texts = [...container.querySelectorAll('[data-layer-text]')].map(n => n.textContent); unmount(); return texts }
    expect(at(0)).toEqual(['Cả clip'])
    expect(at(999)).toEqual(['Cả clip'])
    expect(at(1000)).toEqual(['Xin chào Đà Nẵng!', 'Cả clip'])
    expect(at(3999)).toEqual(['Xin chào Đà Nẵng!', 'Cả clip'])
    expect(at(4000)).toEqual(['Cả clip'])
    expect(at(6000)).toEqual([])
  })

  it('uses the same geometry as the download: centre by fraction, font size from the frame width', () => {
    render(<OverlayLayer doc={doc} timeMs={2000} frameWidth={360} />)
    const box = document.querySelector('[data-layer-id="a"]') as HTMLElement
    expect(box.style.left).toBe('50%')
    expect(box.style.top).toBe('30%')
    expect(box.style.width).toBe('80%')
    expect((box.querySelector('[data-layer-text]') as HTMLElement).style.fontSize).toBe('25px')
  })

  it('never takes a click or a tap (the player keeps them) and has an accessible name', () => {
    render(<OverlayLayer doc={doc} timeMs={2000} frameWidth={360} />)
    const group = screen.getByRole('group', { name: 'Chữ trên video' })
    expect(group.style.pointerEvents).toBe('none')
  })

  it('renders nothing visible without a document, and the text is text (no markup is interpreted)', () => {
    const { container, rerender } = render(<OverlayLayer doc={null} timeMs={0} frameWidth={360} />)
    expect(container.querySelectorAll('[data-layer-id]')).toHaveLength(0)
    rerender(<OverlayLayer doc={{ schema_version: 1, layers: [{ ...defaultTextLayer('x'), text: '<img src=x onerror=alert(1)>' }] }} timeMs={0} frameWidth={360} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('draws nothing until it knows the frame width (it cannot size text yet)', () => {
    const { container } = render(<OverlayLayer doc={doc} timeMs={2000} />)
    expect(container.querySelectorAll('[data-layer-id]')).toHaveLength(0)
  })

  it('does not draw the watermark: that belongs to the download only', () => {
    const { container } = render(<OverlayLayer doc={doc} timeMs={2000} frameWidth={360} />)
    expect(container.textContent).not.toMatch(/Explore on TappyAI|@/)
  })
})

describe('useVideoTimeMs', () => {
  function Probe({ video }: { video: HTMLVideoElement }) {
    const ref = useRef<HTMLVideoElement | null>(video)
    const ms = useVideoTimeMs(ref)
    return <span data-testid="t">{ms}</span>
  }
  it('follows the video clock on timeupdate and seeks', () => {
    const video = document.createElement('video')
    let t = 0
    Object.defineProperty(video, 'currentTime', { get: () => t, configurable: true })
    Object.defineProperty(video, 'paused', { get: () => true, configurable: true })
    render(<Probe video={video} />)
    expect(screen.getByTestId('t').textContent).toBe('0')
    t = 2.345
    act(() => { video.dispatchEvent(new Event('timeupdate')) })
    expect(screen.getByTestId('t').textContent).toBe('2345')
    t = 5
    act(() => { video.dispatchEvent(new Event('seeked')) })
    expect(screen.getByTestId('t').textContent).toBe('5000')
  })

  it('stops listening when unmounted', () => {
    const video = document.createElement('video')
    const remove = vi.spyOn(video, 'removeEventListener')
    const { unmount } = render(<Probe video={video} />)
    unmount()
    expect(remove).toHaveBeenCalledWith('timeupdate', expect.any(Function))
  })
})
