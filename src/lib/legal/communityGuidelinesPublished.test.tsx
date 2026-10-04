// @vitest-environment jsdom
// Phase 7 closeout CP6 — the canonical Community Guidelines: 28 sections verbatim, no placeholder ever shown, no editorial notes,
// published only with verified legal facts.
import { describe, it, expect, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PUBLISHED_GUIDELINES_SECTIONS, PUBLISHED_GUIDELINES_META, PUBLISHED_GUIDELINES_TITLE } from './communityGuidelinesPublished'
import { communityGuidelinesConfig, publishedGuidelines } from './communityGuidelinesConfig'

vi.mock('@/components/Header', () => ({ default: () => null }))

const FACTS_ENV = { COMMUNITY_GUIDELINES_EFFECTIVE_DATE: '01/11/2026', LEGAL_OPERATOR_NAME: 'Công ty TNHH Ví Dụ', LEGAL_ADDRESS: '1 Đường Ví Dụ, TP.HCM' }

describe('the canonical document', () => {
  it('28 sections in the owner\'s order, title and the 18+ line', () => {
    expect(PUBLISHED_GUIDELINES_TITLE).toBe('Quy tắc cộng đồng Tappy')
    expect(PUBLISHED_GUIDELINES_SECTIONS).toHaveLength(28)
    expect(PUBLISHED_GUIDELINES_SECTIONS[0].heading).toBe('1. Mục đích và phạm vi')
    expect(PUBLISHED_GUIDELINES_SECTIONS[27].heading).toBe('28. Liên hệ')
    PUBLISHED_GUIDELINES_SECTIONS.forEach((s, i) => expect(s.heading.startsWith(`${i + 1}. `)).toBe(true))
    expect(PUBLISHED_GUIDELINES_META.join(' ')).toMatch(/từ đủ 18 tuổi trở lên/)
  })
  it('keeps reporting, appeals, AI-generated content, affiliate disclosure, enforcement and the contacts', () => {
    const headings = PUBLISHED_GUIDELINES_SECTIONS.map(s => s.heading).join(' | ')
    for (const h of ['Báo cáo', 'Kháng nghị', 'Nội dung AI tạo ra', 'liên kết tiếp thị', 'Xử lý vi phạm']) expect(headings).toContain(h)
    const all = JSON.stringify(PUBLISHED_GUIDELINES_SECTIONS)
    expect(all).toContain('support@tappyai.com')
    expect(all).toContain('tappyai.com')
  })
  it('carries no drafting or editorial note', () => {
    expect(JSON.stringify({ PUBLISHED_GUIDELINES_META, PUBLISHED_GUIDELINES_SECTIONS })).not.toMatch(/ghi chú biên tập|bản nháp|TODO|draft|đề xuất, chờ/i)
  })
})

describe('publishing needs the three verified legal facts', () => {
  it('off when any fact is missing or is itself a placeholder', () => {
    expect(communityGuidelinesConfig({})).toBeNull()
    expect(communityGuidelinesConfig({ ...FACTS_ENV, LEGAL_ADDRESS: '' })).toBeNull()
    expect(communityGuidelinesConfig({ ...FACTS_ENV, LEGAL_OPERATOR_NAME: '[TÊN ĐƠN VỊ VẬN HÀNH]' })).toBeNull()
  })
  it('on with all three — every placeholder substituted, none left anywhere', () => {
    const f = communityGuidelinesConfig(FACTS_ENV)!
    const doc = publishedGuidelines(f)
    const text = [...doc.meta, ...doc.sections.flatMap(x => [x.heading, ...x.blocks.flatMap(b => b.runs.map(r => r.text))])].join(' | ')
    expect(text).not.toMatch(/\[NGÀY HIỆU LỰC\]|\[TÊN ĐƠN VỊ VẬN HÀNH\]|\[ĐỊA CHỈ PHÁP LÝ\]|\[[^\]]{3,60}\]/)
    expect(doc.meta[0]).toBe('Ngày có hiệu lực: 01/11/2026')
    expect(text).toContain('Công ty TNHH Ví Dụ')
  })
  it('the published page renders 28 sections and no placeholder', async () => {
    const { default: PublishedGuidelines } = await import('@/components/legal/PublishedGuidelines')
    const doc = publishedGuidelines(communityGuidelinesConfig(FACTS_ENV)!)
    const { container } = render(<PublishedGuidelines meta={doc.meta} sections={doc.sections} />)
    expect(container.querySelectorAll('[data-guideline-section]')).toHaveLength(28)
    expect(container.textContent).not.toMatch(/\[[^\]]{3,60}\]/)
    cleanup()
  })
})
