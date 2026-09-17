// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/scam-shield',
  useSearchParams: () => new URLSearchParams(),
}))
// The view mints an anonymous identity before spending a shared AI question; not under test here.
vi.mock('@/lib/auth/ensureAnonymousSession', () => ({ ensureAnonymousSession: async () => true }))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/v3/TappyPresence', () => ({ __esModule: true, default: () => <span data-testid="tappy" /> }))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
})

import ScamShieldView from './ScamShieldView'
import ScamKnowledgeSection from './ScamKnowledgeSection'
import { setLocale } from '@/lib/i18n/useTranslation'
import { BOCONGAN_2026 } from '@/lib/scam-shield/knowledge/bocongan2026'

// ── Scam Shield · the official anti-fraud knowledge library, on the page ─────
//
// Static content from `lib/scam-shield/knowledge`, rendered below the tools. These tests pin that
// it is visible, browsable, sourced, and free: opening a scenario makes no request of any kind.

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  localStorage.clear()
  setLocale('vi')
  // A minimal but VALID verdict, so the one test that submits a message renders a real card.
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
    inputType: 'message', risk: { level: 'MEDIUM', score: 40, confidence: 70 }, scamType: null, attackGoal: null,
    signals: [], requestedActions: [], detectedEntities: { urls: [], phoneNumbers: [], emails: [], organizations: [], platforms: [] },
    urlChecks: [], advice: { doNot: [], doNow: [] }, reasoningSummary: 's',
    analysis: { tier: 1, aiStatus: 'used', provider: 'fake', modelRole: 'fast' }, analyzedAt: 1, quota: null,
  }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const section = () => document.querySelector('[data-scam-knowledge]') as HTMLElement
const cards = () => [...document.querySelectorAll('[data-kb-card]')] as HTMLElement[]

describe('the three primary actions', () => {
  it('shows URL, QR and Phân tích tin nhắn as three visible tabs in a WRAPPING row — no hidden horizontal scroll', () => {
    render(<ScamShieldView />)
    const tabs = screen.getAllByRole('tab').filter(t => t.closest('[data-scam-tabs]'))
    expect(tabs.map(t => t.textContent?.trim())).toEqual(['Kiểm tra URL', 'Quét mã QR', 'Phân tích tin nhắn'])
    const row = document.querySelector('[data-scam-tabs]') as HTMLElement
    expect(row.className).toContain('flex-wrap')
    expect(row.className).not.toContain('v3-scroll-x')
  })

  it('the message tab shows its heading, subtitle and situation example, and still posts to the existing API', async () => {
    render(<ScamShieldView />)
    fireEvent.click(screen.getByRole('tab', { name: 'Phân tích tin nhắn' }))
    const form = document.querySelector('[data-scam-message-form]') as HTMLElement
    expect(within(form).getByRole('heading', { level: 3 }).textContent).toBe('Phân tích tin nhắn')
    expect(form.textContent).toContain('Dán tin nhắn hoặc mô tả tình huống đáng ngờ. AI sẽ phân tích nội dung và các dấu hiệu lừa đảo.')
    // The hint says the question comes from the SHARED pool — not a Scam Alerts allowance.
    expect(form.textContent).toMatch(/lượt hỏi AI chung của Tappy/)
    const textarea = within(form).getByRole('textbox', { name: 'Phân tích tin nhắn' }) as HTMLTextAreaElement
    expect(textarea.placeholder).toMatch(/^Ví dụ: Một người tự xưng là nhân viên ngân hàng/)
    fireEvent.change(textarea, { target: { value: 'Một người tự xưng là công an gọi tôi' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Phân tích ngay' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/scam-shield/analyze')
    await vi.waitFor(() => expect(document.querySelector('[data-scam-message-result]')).not.toBeNull())
  })

  it('the URL and QR tabs are unchanged (same placeholder, same file input)', () => {
    render(<ScamShieldView />)
    expect((document.querySelector('[data-scam-tool] input[type="url"]') as HTMLInputElement).placeholder).toBe('Nhập URL hoặc tên miền...')
    fireEvent.click(screen.getByRole('tab', { name: 'Quét mã QR' }))
    const file = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(file.getAttribute('accept')).toBe('image/*')
    expect(file.getAttribute('capture')).toBe('environment')
  })
})

describe('the knowledge library', () => {
  it('renders on the Scam Shield page, below the tools and above the history', () => {
    render(<ScamShieldView />)
    const kb = section()
    expect(kb).not.toBeNull()
    expect(within(kb).getByRole('heading', { level: 2 }).textContent).toBe('Kiến thức chống lừa đảo')
    expect(kb.textContent).toContain('Các tình huống lừa đảo phổ biến được tổng hợp từ nguồn chính thức.')
    expect(kb.textContent).toContain('Thông tin từ nguồn chính thức')
    expect(kb.textContent).toContain('Nguồn: Bộ Công an')
    const tool = document.querySelector('[data-scam-tool]')!
    const history = document.querySelector('[data-scam-history]')!
    expect(tool.compareDocumentPosition(kb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(kb.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('offers the five official groups plus "all", previews 6 of 25, and expands to all', () => {
    render(<ScamKnowledgeSection />)
    const filters = within(document.querySelector('[data-kb-filters]') as HTMLElement).getAllByRole('button').map(t => t.textContent)
    expect(filters).toEqual(['Tất cả', 'Cơ quan nhà nước', 'AI – Deepfake', 'Đầu tư, việc làm', 'Mua bán trực tuyến', 'Đánh cắp dữ liệu'])
    expect(section().textContent).toContain('25 tình huống')
    expect(cards()).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm tình huống/ }))
    expect(cards()).toHaveLength(25)
    fireEvent.click(screen.getByRole('button', { name: /Thu gọn/ }))
    expect(cards()).toHaveLength(6)
  })

  it('filters by official group with the official counts', () => {
    render(<ScamKnowledgeSection />)
    fireEvent.click(screen.getByRole('button', { name: 'AI – Deepfake' }))
    expect(screen.getByRole('button', { name: 'AI – Deepfake' }).getAttribute('aria-pressed')).toBe('true')
    expect(section().textContent).toContain('3 tình huống')
    expect(cards().map(c => c.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Giả người thân qua video Deepfake')]))
    fireEvent.click(screen.getByRole('button', { name: 'Cơ quan nhà nước' }))
    expect(section().textContent).toContain('10 tình huống')
  })

  it('opening a card shows the official block with a link to the ORIGINAL source, and TappyAI guidance labelled as TappyAI\'s', () => {
    render(<ScamKnowledgeSection />)
    const card = cards().find(c => c.textContent?.includes('Mạo danh cơ quan tố tụng'))!
    fireEvent.click(within(card).getByRole('button'))
    const detail = card.querySelector('[data-kb-detail]') as HTMLElement
    expect(detail).not.toBeNull()
    const official = detail.querySelector('[data-kb-official]') as HTMLElement
    expect(official.textContent).toContain('Thông tin từ nguồn chính thức')
    expect(official.textContent).toContain('Giả làm Công an, Viện kiểm sát, Tòa án, yêu cầu chuyển tiền để “xác minh”.')
    expect(official.textContent).toContain('Nguồn: Bộ Công an')
    expect(official.textContent).toContain('Đăng ngày 2026-09-08')
    expect(official.textContent).toContain('Kịch bản số 3 trong danh sách chính thức')
    const link = official.querySelector('[data-kb-source-link]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(BOCONGAN_2026.source.url)
    expect(link.getAttribute('href')).toMatch(/^https:\/\/bocongan\.gov\.vn\//)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toContain(BOCONGAN_2026.source.title)
    const guidance = detail.querySelector('[data-kb-guidance]') as HTMLElement
    expect(guidance.textContent).toContain('Hướng dẫn của TappyAI')
    expect(guidance.textContent).toContain('không phải trích dẫn nguyên văn')
    expect(guidance.textContent).toContain('KHÔNG làm')
    const prevention = detail.querySelector('[data-kb-prevention]') as HTMLElement
    expect(prevention.textContent).toContain('113')
    // Closes again.
    fireEvent.click(within(card).getAllByRole('button')[0])
    expect(card.querySelector('[data-kb-detail]')).toBeNull()
  })

  it('🚨 browsing consumes no AI quota: no request of any kind is made while filtering and opening scenarios', () => {
    render(<ScamShieldView />)
    fireEvent.click(screen.getByRole('button', { name: 'Cơ quan nhà nước' }))
    fireEvent.click(screen.getByRole('button', { name: /Xem thêm tình huống/ }))
    for (const card of cards()) fireEvent.click(within(card).getAllByRole('button')[0])
    expect(cards()).toHaveLength(10)
    expect(document.querySelectorAll('[data-kb-detail]').length).toBeGreaterThan(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('in English, the chrome is English and the scenario content stays Vietnamese as published, with a note', () => {
    setLocale('en')
    render(<ScamKnowledgeSection />)
    expect(within(section()).getByRole('heading', { level: 2 }).textContent).toBe('Anti-fraud knowledge')
    expect(section().textContent).toContain('Information from an official source')
    expect(section().textContent).toContain('25 scenarios')
    const card = cards()[0]
    expect(card.textContent).toContain(BOCONGAN_2026.scenarios.find(s => s.officialNumber === 1)!.official.title)
    fireEvent.click(within(card).getByRole('button'))
    expect(card.textContent).toContain('Open the original source')
    expect(card.textContent).toContain('Scenario content is shown in Vietnamese, as published by the source.')
  })
})

describe('boundaries', () => {
  it('the section imports only the knowledge module — no model, no fetch, no quota', () => {
    const src = readFileSync('src/app/scam-shield/ScamKnowledgeSection.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect([...src.matchAll(/from '@\/lib\/([^']+)'/g)].map(m => m[1]).sort()).toEqual(['i18n/useTranslation', 'scam-shield/knowledge'])
    expect(src).not.toMatch(/fetch\(|@\/lib\/ai|quota/)
  })
  it('holds no hardcoded Vietnamese UI text', () => {
    const src = readFileSync('src/app/scam-shield/ScamKnowledgeSection.tsx', 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l))).toEqual([])
  })
})

describe('a malformed analyze response', () => {
  it('shows the error message instead of crashing the verdict card', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
    render(<ScamShieldView />)
    fireEvent.click(screen.getByRole('tab', { name: 'Phân tích tin nhắn' }))
    const form = document.querySelector('[data-scam-message-form]') as HTMLElement
    fireEvent.change(within(form).getByRole('textbox', { name: 'Phân tích tin nhắn' }), { target: { value: 'x' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Phân tích ngay' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Chưa phân tích được/)
    expect(document.querySelector('[data-scam-message-result]')).toBeNull()
  })
})
