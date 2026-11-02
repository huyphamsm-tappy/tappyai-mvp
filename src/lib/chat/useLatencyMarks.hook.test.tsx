// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLatencyMarks, type ClientLatencyTurn } from './useLatencyMarks'

type Props = { text: string; loading: boolean; revealing: boolean }
const records = (): ClientLatencyTurn[] => ((window as unknown as { __tappyLatency?: ClientLatencyTurn[] }).__tappyLatency ?? [])

describe('C2 browser latency hook (React)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    window.localStorage.setItem('tappy_latency', '1')
    ;(window as unknown as { __tappyLatency?: ClientLatencyTurn[] }).__tappyLatency = []
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); window.localStorage.removeItem('tappy_latency') })
  const frame = () => act(() => { vi.advanceTimersByTime(20) })

  it('H-1 a streamed reply: first visible text is marked while still loading, before done', () => {
    const { rerender, result } = renderHook((p: Props) => useLatencyMarks(p.text, p.loading, p.revealing), { initialProps: { text: '', loading: false, revealing: false } })
    rerender({ text: '', loading: true, revealing: false }); act(() => { vi.advanceTimersByTime(100) }); act(() => result.current.onResponse())
    rerender({ text: 'Xin chào', loading: true, revealing: false }); frame()
    act(() => { vi.advanceTimersByTime(900) })
    rerender({ text: 'Xin chào, đây là câu trả lời.', loading: false, revealing: false }); frame()
    const r = records(); expect(r).toHaveLength(1)
    expect(r[0].first_visible_text).not.toBeNull(); expect(r[0].done).not.toBeNull(); expect(r[0].first_visible_text!).toBeLessThan(r[0].done!)
    expect(r[0].headers).toBe(100)
  })
  it('H-2 a BUFFERED reply (text arrives in the same render the stream ends): the record waits for the text and is not closed with first_visible_text null', () => {
    const { rerender } = renderHook((p: Props) => useLatencyMarks(p.text, p.loading, p.revealing), { initialProps: { text: '', loading: false, revealing: false } })
    rerender({ text: '', loading: true, revealing: false }); act(() => { vi.advanceTimersByTime(3000) })
    rerender({ text: 'Xin chào, đây là câu trả lời đã chốt.', loading: false, revealing: false })
    expect(records()).toHaveLength(0)   // not closed in the same commit as the end of the stream
    frame()
    const r = records(); expect(r).toHaveLength(1); expect(r[0].first_visible_text).not.toBeNull(); expect(r[0].first_visible_text!).toBeGreaterThanOrEqual(3000)
  })
  it('H-3 a turn that shows no text at all is closed after a short grace period with first_visible_text null (never left open)', () => {
    const { rerender } = renderHook((p: Props) => useLatencyMarks(p.text, p.loading, p.revealing), { initialProps: { text: '', loading: false, revealing: false } })
    rerender({ text: '', loading: true, revealing: false }); rerender({ text: '', loading: false, revealing: false })
    expect(records()).toHaveLength(0); act(() => { vi.advanceTimersByTime(1600) })
    const r = records(); expect(r).toHaveLength(1); expect(r[0].first_visible_text).toBeNull()
  })
  it('H-4 flag off: nothing is recorded or logged', () => {
    window.localStorage.removeItem('tappy_latency')
    const { rerender } = renderHook((p: Props) => useLatencyMarks(p.text, p.loading, p.revealing), { initialProps: { text: '', loading: false, revealing: false } })
    rerender({ text: '', loading: true, revealing: false }); rerender({ text: 'Xin chào', loading: false, revealing: false }); frame(); act(() => { vi.advanceTimersByTime(2000) })
    expect(records()).toHaveLength(0); expect(console.info).not.toHaveBeenCalled()
  })
  it('H-5 no message text is ever stored in the record (lengths only)', () => {
    const { rerender } = renderHook((p: Props) => useLatencyMarks(p.text, p.loading, p.revealing), { initialProps: { text: '', loading: false, revealing: false } })
    rerender({ text: '', loading: true, revealing: false }); rerender({ text: 'BÍ MẬT: nội dung riêng tư của người dùng', loading: false, revealing: false }); frame()
    expect(JSON.stringify(records())).not.toContain('BÍ MẬT')
    expect(records()).toHaveLength(1)
    expect(JSON.stringify((console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls)).not.toContain('BÍ MẬT') // nor the console line
  })
})
