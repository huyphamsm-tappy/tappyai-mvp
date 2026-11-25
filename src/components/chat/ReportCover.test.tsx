// @vitest-environment jsdom
// Report layout A: the cover of a finished report. It shows only what the app knows (the day, the source count) and nothing while the research is still running.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import ReportCover from './ReportCover'
import type { ResearchStatus } from '@/lib/ai/research/deepResearch'

afterEach(() => cleanup())
const status = (o: Partial<ResearchStatus> = {}): ResearchStatus => ({ type: 'tappy.research.v1', title: 'Xu hướng trà sữa Hà Nội', phase: 'done', steps: [], sources: 38, ...o })

describe('ReportCover', () => {
  it('a finished report: eyebrow, title, the day and the source count; no confidence label or figures it cannot know', () => {
    setLocale('vi')
    const { container } = render(<ReportCover status={status()} />)
    const text = container.textContent ?? ''
    expect(text).toContain('Báo cáo nghiên cứu · TappyAI'); expect(text).toContain('Xu hướng trà sữa Hà Nội'); expect(text).toContain('38 nguồn'); expect(text).toContain('Cập nhật')
    expect(text).not.toMatch(/tin cậy|độ tin|confidence/i)
    expect(container.querySelector('h1')?.textContent).toBe('Xu hướng trà sữa Hà Nội')
  })
  it('says which kind of report it is (standard or advanced); the existing engine report says nothing', () => {
    setLocale('vi')
    expect(render(<ReportCover status={status({ tier: 'advanced' })} />).container.textContent).toContain('Báo cáo nâng cao')
    cleanup()
    expect(render(<ReportCover status={status({ tier: 'standard' })} />).container.textContent).toContain('Báo cáo tiêu chuẩn')
    cleanup()
    const none = render(<ReportCover status={status()} />).container.textContent ?? ''
    expect(none).not.toContain('tiêu chuẩn'); expect(none).not.toContain('nâng cao')
  })
  it('states the sources the report CITES when the card has its links (the PDF cover does the same), not everything that was gathered; with none known it states no count', () => {
    setLocale('vi')
    const links = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `t${i}`, url: `https://a${i}.example/` }))
    expect(render(<ReportCover status={status({ sources: 120, links })} />).container.textContent).toContain('12 nguồn')
    cleanup()
    const none = render(<ReportCover status={status({ sources: 0 })} />).container.textContent ?? ''
    expect(none).not.toContain('nguồn'); expect(none).toContain('Cập nhật')
  })
  it('English follows the locale', () => {
    setLocale('en')
    expect(render(<ReportCover status={status()} />).container.textContent).toContain('38 sources')
    setLocale('vi')
  })
  it('nothing while the research is still running or when there is no title', () => {
    expect(render(<ReportCover status={status({ phase: 'researching' })} />).container.innerHTML).toBe('')
    expect(render(<ReportCover status={status({ phase: 'writing' })} />).container.innerHTML).toBe('')
    expect(render(<ReportCover status={status({ title: '' })} />).container.innerHTML).toBe('')
  })
  it('the title is rendered as text, never as markup', () => {
    const { container } = render(<ReportCover status={status({ title: '<img src=x onerror=alert(1)>' })} />)
    expect(container.querySelector('img')).toBeNull()
  })
})
