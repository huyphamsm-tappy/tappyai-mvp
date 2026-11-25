// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import KnowledgeFreshness from './KnowledgeFreshness'
import ScamKnowledgeSection from './ScamKnowledgeSection'
import { setLocale } from '@/lib/i18n/useTranslation'
import { staticKnowledgeMeta, type KnowledgeMeta } from '@/lib/scam-shield/knowledge'

// "Cập nhật lần cuối: dd/mm/yyyy" + the official source link, in both languages, from the knowledge's verifiedAt.

afterEach(() => cleanup())
beforeEach(() => { localStorage.clear() })

const fromDb: KnowledgeMeta = {
  verifiedAt: '2026-11-17', sourceUrl: 'https://bocongan.gov.vn/bai-viet/new-2', sourceTitle: 'Mới', organization: 'Bộ Công an', origin: 'database',
  recent: [{ title: 'Cảnh báo mới nhất', url: 'https://bocongan.gov.vn/bai-viet/new-2', publishedAt: '2026-11-11' }],
}

describe('KnowledgeFreshness', () => {
  it('vi: "Cập nhật lần cuối: dd/mm/yyyy" with the official source link', () => {
    setLocale('vi')
    const { container } = render(<KnowledgeFreshness meta={fromDb} />)
    expect(screen.getByText('Cập nhật lần cuối: 17/11/2026')).toBeTruthy()
    const a = container.querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://bocongan.gov.vn/bai-viet/new-2')
    expect(a.getAttribute('rel')).toContain('noopener')
    expect(container.querySelector('[data-scam-knowledge-updated]')!.getAttribute('data-scam-knowledge-updated')).toBe('2026-11-17')
  })

  it('en: "Last updated: dd/mm/yyyy"', () => {
    setLocale('en')
    render(<KnowledgeFreshness meta={fromDb} />)
    expect(screen.getByText('Last updated: 17/11/2026')).toBeTruthy()
  })

  it('no meta (an older server, or the table not applied): the static dataset date', () => {
    setLocale('vi')
    render(<KnowledgeFreshness />)
    expect(screen.getByText(`Cập nhật lần cuối: 15/09/2026`)).toBeTruthy()
    expect(staticKnowledgeMeta().verifiedAt).toBe('2026-09-15')
  })
})

describe('ScamKnowledgeSection — on the page', () => {
  it('shows the freshness line and the newest official warnings the sync stored', () => {
    setLocale('vi')
    const { container } = render(<ScamKnowledgeSection knowledge={fromDb} />)
    expect(screen.getByText('Cập nhật lần cuối: 17/11/2026')).toBeTruthy()
    const recent = container.querySelector('[data-scam-knowledge-recent]')!
    expect(recent.textContent).toContain('Cảnh báo mới nhất')
    expect(recent.textContent).toContain('11/11/2026')
    expect(recent.querySelector('a')!.getAttribute('href')).toBe('https://bocongan.gov.vn/bai-viet/new-2')
  })

  it('without a sync result the section renders as before, with the static date and no "recent" block', () => {
    setLocale('en')
    const { container } = render(<ScamKnowledgeSection />)
    expect(screen.getByText('Last updated: 15/09/2026')).toBeTruthy()
    expect(container.querySelector('[data-scam-knowledge-recent]')).toBeNull()
  })
})
