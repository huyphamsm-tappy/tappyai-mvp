// @vitest-environment jsdom
// Owner 11/11 + 12/11: the chat holds ONLY a progress line (section titles) while a report is written, then a summary card (key points, the NUMBER of sources, one button);
// the full report - sections, table, footnotes, sources list - lives only in the opened view, which closes with Esc / the close button and gives the focus back.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import { formatMessage } from '@/components/ChatInterface'
import ReportInChat from './ReportInChat'

beforeEach(() => setLocale('vi'))
afterEach(cleanup)

const REPORT = [
  '# Xu hướng trà sữa', '', '*Phạm vi: Hà Nội.*', '',
  '## 1. Tóm tắt', '', '- Giá rẻ bùng lên [1].', '- Thị trường phân cực [2].', '',
  '## 2. Quy mô', '', 'CHI-TIẾT-QUY-MÔ-DÀI.', '',
  '## 3. Giá', '', '| Tiêu chí | Giá |', '| --- | --- |', '| BẢNG-DÒNG | 10 |', '',
  '## Nguồn tham khảo', '', '1. Giá trà sữa 2026 — vnexpress.net', '2. Báo cáo ngành — cafef.vn', '',
].join('\n')

const el = (text: string, streaming = false) => <ReportInChat msgId="m1" text={text} streaming={streaming} format={formatMessage} research={null} />

describe('while the report is written', () => {
  it('shows a progress line with the section titles and none of their text', () => {
    const { container } = render(el('# T\n\n## 1. Một\n\nVĂN-BẢN-MỘT\n\n## 2. Hai\n\nđang viết dở', true))
    expect(screen.getByTestId('report-progress').textContent).toContain('1. Một')
    expect(screen.getByTestId('report-progress').textContent).toContain('2. Hai')
    expect(container.textContent).not.toContain('VĂN-BẢN-MỘT')
    expect(container.textContent).not.toContain('đang viết dở')
    expect(screen.queryByTestId('report-summary-card')).toBeNull()
    expect(screen.queryByTestId('report-open')).toBeNull()
  })
})

describe('the finished report in the chat', () => {
  it('is a card: title, key points, the source count and one button; nothing of the other sections, no list, no link, no download', () => {
    const { container } = render(el(REPORT))
    const card = screen.getByTestId('report-summary-card')
    expect(card.textContent).toContain('Xu hướng trà sữa')
    expect(screen.getByTestId('report-bullets').textContent).toContain('Giá rẻ bùng lên')
    expect(screen.getByTestId('report-sources-count').textContent).toBe('Nguồn: 2')
    expect(screen.getByTestId('report-open').textContent).toContain('Xem báo cáo đầy đủ')
    const text = container.textContent ?? ''
    expect(text).not.toContain('CHI-TIẾT-QUY-MÔ')
    expect(text).not.toContain('BẢNG-DÒNG')
    expect(text).not.toMatch(/vnexpress|cafef|Nguồn tham khảo/)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(text).not.toMatch(/PDF|Word|Markdown/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the button opens the full report over the chat: all sections, the table, the sources list; no PDF, Copy Markdown stays', () => {
    render(el(REPORT))
    fireEvent.click(screen.getByTestId('report-open'))
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.textContent).toContain('CHI-TIẾT-QUY-MÔ')
    expect(dlg.textContent).toContain('BẢNG-DÒNG')
    expect(dlg.textContent).toContain('vnexpress.net')
    expect(dlg.textContent).toContain('Sao chép Markdown')
    expect(dlg.textContent).not.toMatch(/PDF/i)
  })

  it('Esc closes it and the focus returns to the button', () => {
    render(el(REPORT))
    const btn = screen.getByTestId('report-open')
    btn.focus()
    fireEvent.click(btn)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(btn)
  })

  it('the close button closes it too; Share (when offered) closes the panel first', async () => {
    let shared = 0
    render(<ReportInChat msgId="m1" text={REPORT} streaming={false} format={formatMessage} research={null} onShare={() => { shared += 1 }} />)
    fireEvent.click(screen.getByTestId('report-open'))
    fireEvent.click(screen.getByTestId('v206-drawer-close'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('report-open'))
    fireEvent.click(screen.getByTestId('research-share'))
    expect(screen.queryByRole('dialog')).toBeNull()
    await new Promise(r => setTimeout(r, 120))
    expect(shared).toBe(1)
  })

  it('the same component goes from the progress line to the card when the stream ends', () => {
    const { rerender } = render(el(REPORT, true))
    expect(screen.getByTestId('report-progress')).toBeTruthy()
    rerender(el(REPORT, false))
    expect(screen.queryByTestId('report-progress')).toBeNull()
    expect(screen.getByTestId('report-summary-card')).toBeTruthy()
  })
})
