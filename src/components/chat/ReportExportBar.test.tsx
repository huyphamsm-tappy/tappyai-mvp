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
  it('20/11: with no "# " heading, a title written in capitals beats a chatty first line (the real answer opened with a sentence about files)', () => {
    expect(reportTitleOf('Mình gửi bản báo cáo ngắn bên dưới nhé.\nBÁO CÁO DỰ TRÙ CHI PHÍ DU LỊCH ĐÀ LẠT 3 NGÀY 2 ĐÊM\nĐối tượng: 2 người')).toBe('BÁO CÁO DỰ TRÙ CHI PHÍ DU LỊCH ĐÀ LẠT 3 NGÀY 2 ĐÊM')
    expect(reportTitleOf('Mình gửi bản báo cáo.\nTổng cộng: 4.490.000 ĐỒNG\nHết')).toBe('Mình gửi bản báo cáo.') // a figure line in capitals is not a title
    expect(reportTitleOf('# Tiêu đề thật\nBÁO CÁO PHỤ KHÁC NHAU')).toBe('Tiêu đề thật') // the "# " heading still wins
  })
})

describe('ReportExportBar', () => {
  it('shows Markdown, Word and PDF buttons under a Vietnamese label', () => {
    setLocale('vi')
    const { container, getByTestId } = render(<ReportExportBar report={'# T\n\n## A\nx'} format={s => s} />)
    expect(container.textContent).toContain('Tải báo cáo')
    for (const k of ['md', 'docx', 'pdf', 'html']) expect(getByTestId(`report-export-${k}`)).toBeTruthy()
  })
  it('HTML (owner 20/11): one click downloads a standalone .html page with the report text, its title and no script', async () => {
    let blob: Blob | null = null
    let name = ''
    Object.defineProperty(URL, 'createObjectURL', { value: (b: Blob) => { blob = b; return 'blob:x' }, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { name = this.download })
    setLocale('vi')
    const { getByTestId } = render(<ReportExportBar report={'# Thị trường chip\n\n## Mục A\nNội dung có dấu tiếng Việt.'} format={s => s} />)
    await act(async () => { fireEvent.click(getByTestId('report-export-html')) })
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(name).toBe('Thị trường chip.html')
    const html = await (blob as unknown as Blob).text()
    expect((blob as unknown as Blob).type).toContain('text/html')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Thị trường chip')
    expect(html).toContain('Nội dung có dấu tiếng Việt.')
    expect(html).not.toMatch(/<script/i)
    click.mockRestore()
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
