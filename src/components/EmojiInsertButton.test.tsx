// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useRef, useState } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Owner screenshot 27/11/2026: the comment box had no emoji button. A small built-in grid (no new dependency) that
// inserts at the caret, never past maxLength.

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => (k === 'reviews.commentEmoji' ? 'Chọn biểu tượng cảm xúc' : k) }) }))

import EmojiInsertButton, { insertAtSelection, EMOJI_CODEPOINTS } from './EmojiInsertButton'

afterEach(() => cleanup())

describe('insertAtSelection (pure)', () => {
  it('inserts at the caret and returns the new caret just after it', () => {
    expect(insertAtSelection('ab', 1, 1, 'X', 300)).toEqual({ value: 'aXb', caret: 2 })
  })
  it('replaces a selection', () => {
    expect(insertAtSelection('abcd', 1, 3, 'X', 300)).toEqual({ value: 'aXd', caret: 2 })
  })
  it('appends when the caret is unknown (null)', () => {
    expect(insertAtSelection('ab', null, null, 'X', 300)).toEqual({ value: 'abX', caret: 3 })
  })
  it('refuses an insert that would pass maxLength: returns null', () => {
    expect(insertAtSelection('abc', 3, 3, 'XY', 4)).toBeNull()
    expect(insertAtSelection('abc', 3, 3, 'X', 4)).toEqual({ value: 'abcX', caret: 4 })
  })
  it('counts a two-unit emoji as two toward maxLength (what the input does)', () => {
    const smile = String.fromCodePoint(0x1f600)
    expect(smile.length).toBe(2)
    expect(insertAtSelection('abc', 3, 3, smile, 4)).toBeNull()
    expect(insertAtSelection('ab', 2, 2, smile, 4)?.value).toBe('ab' + smile)
  })
})

describe('the emoji list', () => {
  it('is a plain list of code points: no duplicates, all real emoji planes, not too long to scan', () => {
    expect(new Set(EMOJI_CODEPOINTS).size).toBe(EMOJI_CODEPOINTS.length)
    expect(EMOJI_CODEPOINTS.length).toBeGreaterThanOrEqual(32)
    expect(EMOJI_CODEPOINTS.length).toBeLessThanOrEqual(64)
    for (const c of EMOJI_CODEPOINTS) expect(c >= 0x2600 && c <= 0x1faff).toBe(true)
  })
})

function Harness({ maxLength = 300 }: { maxLength?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  const [v, setV] = useState('')
  return (
    <div>
      <input ref={ref} value={v} onChange={e => setV(e.target.value)} maxLength={maxLength} data-testid="box" />
      <EmojiInsertButton inputRef={ref} value={v} onChange={setV} maxLength={maxLength} />
    </div>
  )
}

describe('EmojiInsertButton', () => {
  it('opens a grid, inserts the chosen emoji at the caret, and closes', () => {
    render(<Harness />)
    const box = screen.getByTestId('box') as HTMLInputElement
    fireEvent.change(box, { target: { value: 'hello' } })
    box.setSelectionRange(2, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn biểu tượng cảm xúc' }))
    const first = String.fromCodePoint(EMOJI_CODEPOINTS[0])
    fireEvent.click(screen.getByRole('button', { name: first }))
    expect(box.value).toBe('he' + first + 'llo')
    expect(screen.queryByRole('button', { name: first })).toBeNull()
  })

  it('does not insert past maxLength', () => {
    render(<Harness maxLength={3} />)
    const box = screen.getByTestId('box') as HTMLInputElement
    fireEvent.change(box, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Chọn biểu tượng cảm xúc' }))
    fireEvent.click(screen.getByRole('button', { name: String.fromCodePoint(EMOJI_CODEPOINTS[0]) }))
    expect(box.value).toBe('abc')
  })

  it('Escape closes the grid', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Chọn biểu tượng cảm xúc' }))
    expect(screen.getAllByRole('button').length).toBeGreaterThan(10)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('the comment box uses it', () => {
  it('CommentDrawer renders the emoji button next to the input', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/reviews/feedShared.tsx'), 'utf8')
    expect(src).toMatch(/<EmojiInsertButton inputRef=\{inputRef\}/)
  })
})
