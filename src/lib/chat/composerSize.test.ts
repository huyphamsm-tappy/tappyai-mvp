import { describe, it, expect } from 'vitest'
import { composerSizeFor, COMPOSER_MAX_PX, needsCollapse, COLLAPSE_CHARS, COLLAPSE_LINES } from './composerSize'

describe('composerSizeFor: the typing box grows to a cap, then SCROLLS (owner 20/11/2026: a long question could not be scrolled)', () => {
  it('a short text takes its own height and needs no scrollbar', () => {
    expect(composerSizeFor(48)).toEqual({ heightPx: 48, scrollable: false })
  })
  it('a text exactly at the cap is not scrollable', () => {
    expect(composerSizeFor(COMPOSER_MAX_PX)).toEqual({ heightPx: COMPOSER_MAX_PX, scrollable: false })
  })
  it('a text past the cap is held at the cap and the box scrolls (overflow was hidden before: the mouse wheel did nothing)', () => {
    expect(composerSizeFor(1300)).toEqual({ heightPx: COMPOSER_MAX_PX, scrollable: true })
  })
  it('a bad measurement never makes a zero or NaN height', () => {
    expect(composerSizeFor(0).heightPx).toBeGreaterThan(0)
    expect(composerSizeFor(Number.NaN).heightPx).toBeGreaterThan(0)
  })
})

describe('needsCollapse: a long question collapses under the person\'s bubble once sent', () => {
  it('short and few-line texts stay whole', () => {
    expect(needsCollapse('Xin chào')).toBe(false)
    expect(needsCollapse('a\nb\nc')).toBe(false)
    expect(needsCollapse('x'.repeat(COLLAPSE_CHARS - 1))).toBe(false)
  })
  it('a text of many characters or many lines collapses', () => {
    expect(needsCollapse('x'.repeat(COLLAPSE_CHARS))).toBe(true)
    expect(needsCollapse(Array.from({ length: COLLAPSE_LINES }, (_, i) => `dòng ${i}`).join('\n'))).toBe(true)
  })
  it('empty or odd input is false', () => {
    expect(needsCollapse('')).toBe(false)
    expect(needsCollapse(undefined as never)).toBe(false)
  })
})
