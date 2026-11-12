// @vitest-environment jsdom
// RFC-001 6.2: AC-RESP-01 (the reading position of a conversation comes back exactly) and AC-RESP-02 (the half-typed message of each conversation is kept). Per conversation, in the tab's session.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useRef, useState } from 'react'
import { parseReading, readingKey, useReadingState } from './useReadingState'

beforeEach(() => window.sessionStorage.clear())
afterEach(() => cleanup())

function Harness({ id, enabled = true, onBox }: { id: string; enabled?: boolean; onBox?: (b: HTMLDivElement, c: HTMLDivElement, set: (v: string) => void, get: () => string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [input, setInput] = useState('')
  useReadingState({ enabled, conversationId: id, scrollRef, contentRef, pinned, input, setInput })
  return (
    <div>
      <div ref={scrollRef} data-testid="box" data-pinned={String(pinned.current)} style={{ height: 100, overflow: 'auto' }}>
        <div ref={contentRef} style={{ height: 3000 }} />
      </div>
      <input data-testid="in" value={input} onChange={e => setInput(e.target.value)} />
      <button data-testid="probe" onClick={() => onBox?.(scrollRef.current!, contentRef.current!, setInput, () => input)} />
    </div>
  )
}

// jsdom has no layout: give the box the geometry a real one has
function geometry(box: HTMLElement) {
  Object.defineProperty(box, 'scrollHeight', { value: 3000, configurable: true })
  Object.defineProperty(box, 'clientHeight', { value: 100, configurable: true })
}

describe('parseReading', () => {
  it('reads what was written and refuses anything else', () => {
    expect(parseReading(JSON.stringify({ top: 420, atEnd: false, draft: 'xin chào' }))).toEqual({ top: 420, atEnd: false, draft: 'xin chào' })
    expect(parseReading('not json')).toBeNull()
    expect(parseReading(null)).toBeNull()
    expect(parseReading(JSON.stringify({ top: -5, atEnd: 'x', draft: 3 }))).toEqual({ top: 0, atEnd: true, draft: '' })
  })
})

describe('useReadingState', () => {
  it('AC-RESP-01: leaves a conversation mid-reading, comes back, and the scroll position is exactly where it was', () => {
    const a = render(<Harness id="c1" />)
    const box = a.getByTestId('box') as HTMLDivElement
    geometry(box)
    box.scrollTop = 1234
    act(() => { box.dispatchEvent(new Event('scroll')) })
    a.unmount() // the person opens another conversation; this one's state is written on the way out
    expect(parseReading(window.sessionStorage.getItem(readingKey('c1')))).toMatchObject({ top: 1234, atEnd: false })
    const b = render(<Harness id="c1" />)
    expect((b.getByTestId('box') as HTMLDivElement).scrollTop).toBe(1234)
  })
  it('the restore also releases the "stay at the end" pin, so the new content does not drag the page away', () => {
    const pinned = { current: true }
    function P() {
      const scrollRef = useRef<HTMLDivElement>(null); const contentRef = useRef<HTMLDivElement>(null)
      useReadingState({ enabled: true, conversationId: 'c9', scrollRef, contentRef, pinned, input: '', setInput: () => {} })
      return <div ref={scrollRef}><div ref={contentRef} /></div>
    }
    window.sessionStorage.setItem(readingKey('c9'), JSON.stringify({ top: 800, atEnd: false, draft: '' }))
    render(<P />)
    expect(pinned.current).toBe(false)
  })
  it('a reader who was at the end is not restored (the chat opens at its end as before) and nothing is stored for it', () => {
    const a = render(<Harness id="c2" />)
    const box = a.getByTestId('box') as HTMLDivElement
    geometry(box)
    box.scrollTop = 2900 // within 64px of the end
    act(() => { box.dispatchEvent(new Event('scroll')) })
    a.unmount()
    expect(window.sessionStorage.getItem(readingKey('c2'))).toBeNull()
  })
  it('a conversation left at its end with a draft typed: the draft comes back, the scroll is not restored', () => {
    window.sessionStorage.setItem(readingKey('c4'), JSON.stringify({ top: 2900, atEnd: true, draft: 'dở dang' }))
    const a = render(<Harness id="c4" />)
    expect((a.getByTestId('in') as HTMLInputElement).value).toBe('dở dang')
    expect((a.getByTestId('box') as HTMLDivElement).scrollTop).toBe(0)
  })
  it('AC-RESP-02: the half-typed message of each conversation is kept apart and comes back', () => {
    const a = render(<Harness id="c1" />)
    const input = a.getByTestId('in') as HTMLInputElement
    act(() => { input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(input, 'quán phở nào ngon'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    a.unmount()
    const other = render(<Harness id="c2" />)
    expect((other.getByTestId('in') as HTMLInputElement).value).toBe('')
    other.unmount()
    const back = render(<Harness id="c1" />)
    expect((back.getByTestId('in') as HTMLInputElement).value).toBe('quán phở nào ngon')
  })
  it('flag off: nothing is read, written or restored', () => {
    window.sessionStorage.setItem(readingKey('c1'), JSON.stringify({ top: 500, atEnd: false, draft: 'cũ' }))
    const a = render(<Harness id="c1" enabled={false} />)
    expect((a.getByTestId('in') as HTMLInputElement).value).toBe('')
    expect((a.getByTestId('box') as HTMLDivElement).scrollTop).toBe(0)
    a.unmount()
    expect(JSON.parse(window.sessionStorage.getItem(readingKey('c1'))!).draft).toBe('cũ')
  })
  it('storage that refuses is not an error', () => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('quota') }
    try {
      const a = render(<Harness id="c3" />)
      expect(() => a.unmount()).not.toThrow()
    } finally { Storage.prototype.setItem = real }
  })
})
