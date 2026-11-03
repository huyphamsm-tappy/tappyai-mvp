// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { distanceFromEnd, isNearEnd, useStickToBottom, STICK_THRESHOLD_PX } from './useStickToBottom'

afterEach(cleanup)

describe('stick-to-bottom helpers', () => {
  it('measures the distance from the end and the near-end threshold', () => {
    expect(distanceFromEnd({ scrollTop: 2338, scrollHeight: 3371, clientHeight: 550 })).toBe(483) // the measured film-answer shortfall
    expect(isNearEnd({ scrollTop: 2338, scrollHeight: 3371, clientHeight: 550 })).toBe(false)
    expect(isNearEnd({ scrollTop: 2821, scrollHeight: 3371, clientHeight: 550 })).toBe(true)
    expect(isNearEnd({ scrollTop: 2821 - STICK_THRESHOLD_PX - 1, scrollHeight: 3371, clientHeight: 550 })).toBe(false)
  })
})

// A scroll box whose content grows AFTER the last "message change" — the real failure (action bar, chips, late photos).
let observers: Array<() => void> = []
class FakeRO {
  cb: () => void
  constructor(cb: () => void) { this.cb = cb; observers.push(cb) }
  observe() {}
  unobserve() {}
  disconnect() { observers = observers.filter(o => o !== this.cb) }
}

function Harness({ onApi }: { onApi: (a: ReturnType<typeof useStickToBottom>) => void }) {
  const api = useStickToBottom()
  onApi(api)
  return <div ref={api.scrollRef}><div ref={api.contentRef} /></div>
}

describe('useStickToBottom', () => {
  it('re-pins to the end after the content grows, and stops following once the reader scrolls away', () => {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeRO
    let api!: ReturnType<typeof useStickToBottom>
    render(<Harness onApi={a => { api = a }} />)
    const box = api.scrollRef.current as HTMLDivElement
    let sh = 1000
    Object.defineProperty(box, 'scrollHeight', { get: () => sh, configurable: true })
    Object.defineProperty(box, 'clientHeight', { get: () => 500, configurable: true })
    // content grows (the action bar + chips appear): the observer re-pins
    sh = 1480
    act(() => { observers.forEach(o => o()) })
    expect(box.scrollTop).toBe(1480)
    // the reader scrolls up to read an older answer: growth no longer drags them down
    box.dispatchEvent(new Event('wheel'))
    box.scrollTop = 200
    box.dispatchEvent(new Event('scroll'))
    sh = 1900
    act(() => { observers.forEach(o => o()) })
    expect(box.scrollTop).toBe(200)
    // a scroll the BROWSER makes (scroll anchoring) is not the reader's: it must not unpin on its own
    const realNow = Date.now()
    const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 5000) // no gesture for a while
    api.pinned.current = true
    box.scrollTop = 900
    box.dispatchEvent(new Event('scroll'))
    expect(api.pinned.current).toBe(true)
    spy.mockRestore()
    api.pinned.current = false
    // sending a message pins again
    act(() => { api.pin() })
    expect(box.scrollTop).toBe(1900)
  })
})
