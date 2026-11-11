// @vitest-environment jsdom
// The export bar of a report recognised by its text (the research card, which carried the buttons, is live-only).
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import ReportExportBar, { reportTitleOf } from './ReportExportBar'

afterEach(() => cleanup())

describe('reportTitleOf', () => {
  it('the first "# " heading, else the first non-empty line; markup characters removed; capped', () => {
    expect(reportTitleOf('Lời dẫn\n\n# **Xu hướng** trà sữa\n## Mục 1')).toBe('Xu hướng trà sữa')
    expect(reportTitleOf('\n\nDòng đầu tiên\nDòng hai')).toBe('Dòng đầu tiên')
    expect(reportTitleOf('# ' + 'x'.repeat(300)).length).toBe(120)
    expect(reportTitleOf('')).toBe('report')
  })
})

describe('ReportExportBar', () => {
  it('shows Markdown, Word and PDF buttons under a Vietnamese label', () => {
    setLocale('vi')
    const { container, getByTestId } = render(<ReportExportBar report={'# T\n\n## A\nx'} format={s => s} />)
    expect(container.textContent).toContain('Tải báo cáo')
    for (const k of ['md', 'docx', 'pdf']) expect(getByTestId(`report-export-${k}`)).toBeTruthy()
  })
})
