// @vitest-environment jsdom
// The line under a collapsed report: how many sources it rests on, and the button that opens or folds the full report.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import ReportViewBar from './ReportViewBar'

afterEach(() => cleanup())

describe('ReportViewBar', () => {
  it('collapsed: the source count and a button to read the full report', () => {
    setLocale('vi')
    const onToggle = vi.fn()
    const { container, getByRole } = render(<ReportViewBar sources={135} expanded={false} onToggle={onToggle} />)
    expect(container.textContent).toContain('135 nguồn')
    expect(container.textContent).toContain('Xem báo cáo đầy đủ')
    fireEvent.click(getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
  it('expanded: the button folds the report back', () => {
    setLocale('vi')
    const { container } = render(<ReportViewBar sources={3} expanded onToggle={() => {}} />)
    expect(container.textContent).toContain('Thu gọn')
    expect(container.textContent).not.toContain('Xem báo cáo đầy đủ')
  })
  it('no source count when it is not known (never "0 nguồn")', () => {
    setLocale('vi')
    const { container } = render(<ReportViewBar sources={0} expanded={false} onToggle={() => {}} />)
    expect(container.textContent).not.toContain('nguồn')
    expect(container.textContent).toContain('Xem báo cáo đầy đủ')
  })
  it('English follows the locale', () => {
    setLocale('en')
    const { container } = render(<ReportViewBar sources={5} expanded={false} onToggle={() => {}} />)
    expect(container.textContent).toContain('5 sources')
    expect(container.textContent).toContain('View the full report')
    setLocale('vi')
  })
})
