// @vitest-environment jsdom
// The export bar of a report recognised by its text (the research card, which carried the buttons, is live-only).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
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
  it('PDF is a FILE that downloads on one click (owner 15/11): a .pdf with the PDF header, and no print frame is opened', async () => {
    let blob: Blob | null = null
    let name = ''
    Object.defineProperty(URL, 'createObjectURL', { value: (b: Blob) => { blob = b; return 'blob:x' }, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download })
    setLocale('vi')
    const { getByTestId } = render(<ReportExportBar report={'# Thị trường chip\n\n## A\nNội dung có dấu tiếng Việt.'} format={s => s} />)
    await act(async () => { fireEvent.click(getByTestId('report-export-pdf')) })
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1), { timeout: 20_000 })
    expect(name).toBe('Thị trường chip.pdf')
    const head = new Uint8Array(await (blob as unknown as Blob).arrayBuffer()).subarray(0, 5)
    expect(String.fromCharCode(...head)).toBe('%PDF-')
    expect(document.querySelector('iframe')).toBeNull()
    click.mockRestore()
  }, 40_000)
})
