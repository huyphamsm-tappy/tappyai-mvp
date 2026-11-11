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
