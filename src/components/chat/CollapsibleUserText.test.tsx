// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import CollapsibleUserText from './CollapsibleUserText'

afterEach(() => cleanup())

describe('CollapsibleUserText (owner 20/11/2026)', () => {
  it('a short question renders whole with no button', () => {
    setLocale('vi')
    const { getByTestId, queryByTestId } = render(<CollapsibleUserText html="Xin chào" text="Xin chào" />)
    expect(getByTestId('user-msg-body').textContent).toBe('Xin chào')
    expect(getByTestId('user-msg-body').getAttribute('data-folded')).toBeNull()
    expect(queryByTestId('user-msg-toggle')).toBeNull()
  })
  it('a long question is folded with a "show more" button, opens on a click and folds again', () => {
    setLocale('vi')
    const long = 'Một câu hỏi rất dài. '.repeat(60)
    const { getByTestId } = render(<CollapsibleUserText html={long} text={long} />)
    expect(getByTestId('user-msg-body').getAttribute('data-folded')).toBe('true')
    expect(getByTestId('user-msg-toggle').textContent).toBe('Xem thêm')
    fireEvent.click(getByTestId('user-msg-toggle'))
    expect(getByTestId('user-msg-body').getAttribute('data-folded')).toBeNull()
    expect(getByTestId('user-msg-toggle').textContent).toBe('Thu gọn')
    expect(getByTestId('user-msg-toggle').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(getByTestId('user-msg-toggle'))
    expect(getByTestId('user-msg-body').getAttribute('data-folded')).toBe('true')
  })
  it('English labels', () => {
    setLocale('en')
    const long = 'x '.repeat(400)
    const { getByTestId } = render(<CollapsibleUserText html={long} text={long} />)
    expect(getByTestId('user-msg-toggle').textContent).toBe('Show more')
    setLocale('vi')
  })
  it('the whole text stays in the page when folded (the fold is a style, not a cut), so copy and search still see it', () => {
    setLocale('vi')
    const long = 'dòng\n'.repeat(20)
    const { getByTestId } = render(<CollapsibleUserText html={long} text={long} />)
    expect(getByTestId('user-msg-body').innerHTML.length).toBe(long.length)
  })
})
