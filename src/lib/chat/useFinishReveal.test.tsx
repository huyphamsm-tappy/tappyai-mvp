// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFinishReveal, revealStep, MIN_CHARS, revealDisabledByUser } from './useFinishReveal'

const LONG = 'Đây là câu trả lời đã được duyệt xong, dài đủ để được hiện dần từng phần cho dễ đọc hơn. '.repeat(6)
const safeEnd = (_t: string, end: number) => end

let rafs: Array<() => void> = []
beforeEach(() => {
  rafs = []
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { rafs.push(cb); return rafs.length })
  vi.stubGlobal('cancelAnimationFrame', () => { rafs = [] })
  window.localStorage.removeItem('tappy_reveal')
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never
})
afterEach(() => { vi.unstubAllGlobals() })
const frame = () => act(() => { const f = rafs; rafs = []; f.forEach(cb => cb()) })

describe('useFinishReveal — display only, never changes the text', () => {
  it('reveals a finished reply progressively and ends with EXACTLY the full text', () => {
    const { result, rerender } = renderHook(({ loading }) => useFinishReveal(LONG, loading, true, safeEnd), { initialProps: { loading: true } })
    expect(result.current).toEqual({ text: LONG, revealing: false }) // while streaming the hook does nothing
    rerender({ loading: false })
    frame()
    expect(result.current.revealing).toBe(true)
    expect(LONG.startsWith(result.current.text)).toBe(true)
    expect(result.current.text.length).toBeLessThan(LONG.length)
    const first = result.current.text.length
    frame(); frame()
    expect(result.current.text.length).toBeGreaterThan(first)
    for (let i = 0; i < 400 && result.current.revealing; i++) frame()
    expect(result.current).toEqual({ text: LONG, revealing: false })
  })
  it('does not reveal when the server did not ask, for a short reply, or when reduced motion / the user opt-out is set', () => {
    const run = (text: string, enabled: boolean) => {
      const h = renderHook(({ loading }) => useFinishReveal(text, loading, enabled, safeEnd), { initialProps: { loading: true } })
      h.rerender({ loading: false }); frame()
      return h.result.current
    }
    expect(run(LONG, false)).toEqual({ text: LONG, revealing: false })
    expect(run('Ngắn thôi.', true)).toEqual({ text: 'Ngắn thôi.', revealing: false })
    window.localStorage.setItem('tappy_reveal', 'off')
    expect(revealDisabledByUser()).toBe(true)
    expect(run(LONG, true)).toEqual({ text: LONG, revealing: false })
    window.localStorage.removeItem('tappy_reveal')
    window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never
    expect(revealDisabledByUser()).toBe(true)
    expect(run(LONG, true)).toEqual({ text: LONG, revealing: false })
  })
  it('a reply loaded from history (never streamed in this session) is not revealed', () => {
    const { result } = renderHook(() => useFinishReveal(LONG, false, true, safeEnd))
    frame()
    expect(result.current).toEqual({ text: LONG, revealing: false })
  })
  it('speed: about 150 frames for any length, at least 3 characters per frame', () => {
    expect(revealStep(30)).toBe(3)
    expect(revealStep(1500)).toBe(10)
    expect(Math.ceil(5000 / revealStep(5000))).toBeLessThanOrEqual(150)
    expect(MIN_CHARS).toBe(60)
  })
})
