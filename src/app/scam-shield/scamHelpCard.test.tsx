// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/scam-shield',
  useSearchParams: () => new URLSearchParams(),
}))
// The view mints an anonymous identity before spending a shared AI question; not under test here.
vi.mock('@/lib/auth/ensureAnonymousSession', () => ({ ensureAnonymousSession: async () => true }))
const decodeMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/scam-shield/qr/clientDecode', () => ({ decodeQrFromFile: decodeMock }))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
// The mascot composition is Home's; here it is a marker so the test can prove the pose.
vi.mock('@/components/v3/TappyPresence', () => ({
  __esModule: true,
  default: ({ pose }: { pose?: string }) => <span data-testid="tappy" data-pose={pose} />,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import ScamShieldView from './ScamShieldView'
import ScamHelpCard from './ScamHelpCard'
import { SCAM_REPORT_HOTLINE } from '@/lib/scam-shield/hotline'
import { readFileSync as read } from 'node:fs'

// "Nghi bị lừa?" — the emergency card (Web equivalent of the iOS card), one canonical hotline, one canonical source.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const CANONICAL_SOURCE = 'https://bocongan.gov.vn/hoi-dap/chi-tiet-cau-hoi/ab7d473e-21c9-4950-8ae2-947c1c7605af?page=/'
const card = () => document.querySelector('[data-scam-help]') as HTMLElement

describe('the canonical source of truth', () => {
  it('is one small module: the number, the tel: URI and the exact official URL (no tracking parameters)', () => {
    expect(SCAM_REPORT_HOTLINE.display).toBe('0692.345.860')
    expect(SCAM_REPORT_HOTLINE.tel).toBe('tel:0692345860')
    expect(SCAM_REPORT_HOTLINE.sourceUrl).toBe(CANONICAL_SOURCE)
    expect(SCAM_REPORT_HOTLINE.sourceUrl).not.toMatch(/utm_|chatgpt/)
  })
})

describe('ScamHelpCard', () => {
  it('renders the title, the body and the one-tap call to the canonical hotline', () => {
    render(<ScamHelpCard />)
    expect(within(card()).getByRole('heading').textContent).toBe('Nghi bị lừa?')
    expect(card().textContent).toContain('Nếu đã chuyển tiền hoặc lộ mã OTP, gọi Công an ngay.')
    const call = card().querySelector('[data-scam-help-call]') as HTMLAnchorElement
    expect(call.textContent).toBe('Gọi 0692.345.860')
    expect(call.getAttribute('href')).toBe('tel:0692345860')
  })
  it('shows the hotline context: Đường Dây Nóng, the agency and what the line receives', () => {
    render(<ScamHelpCard />)
    const ctx = (card().querySelector('[data-scam-help-hotline]') as HTMLElement).textContent!
    expect(ctx).toContain('Đường Dây Nóng')
    expect(ctx).toContain('Cục Cảnh sát hình sự - Bộ Công an')
    expect(ctx).toContain('tiếp nhận tin báo, tố giác về lừa đảo')
  })
  it('the source reads "Nguồn: Bộ Công an"; ONLY "Bộ Công an" is the link; the exact URL is its href and is never visible text', () => {
    render(<ScamHelpCard />)
    const source = card().querySelector('[data-scam-help-source]') as HTMLElement
    expect(source.textContent?.replace(/\s+/g, ' ').trim()).toBe('Nguồn: Bộ Công an')
    const links = source.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toBe('Bộ Công an')
    expect(links[0].getAttribute('href')).toBe(CANONICAL_SOURCE)
    expect(links[0].getAttribute('rel')).toContain('noopener')
    expect(card().textContent).not.toMatch(/https?:\/\/|bocongan\.gov\.vn|utm_/)
  })
  it('no 113 anywhere in the card, and no second hotline', () => {
    render(<ScamHelpCard />)
    expect(card().textContent).not.toMatch(/\b113\b/)
    expect(Array.from(card().querySelectorAll('a')).filter(a => a.getAttribute('href')?.startsWith('tel:'))).toHaveLength(1)
  })
})

describe('placement on the Scam Shield page', () => {
  it('sits after the hero and before the tools, and the tools are still all there', () => {
    render(<ScamShieldView />)
    const hero = document.querySelector('[data-scam-hero]') as HTMLElement
    const tool = document.querySelector('[data-scam-tool]') as HTMLElement
    expect(card()).toBeTruthy()
    expect(hero.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card().compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(tool).getAllByRole('tab')).toHaveLength(3)
    expect(within(tool).getByRole('textbox')).toBeTruthy()
  })
})

describe('what was NOT touched', () => {
  it('per-brand hotlines still come from the official directory (not from the emergency constant)', () => {
    const dir = read('src/lib/scam-shield/directory/officialDirectory.ts', 'utf8')
    expect(dir).toMatch(/id: 'vcb'[^\n]*hotline: '1900 5454/)
    expect(dir).not.toContain('0692')
    expect(dir).not.toContain('SCAM_REPORT_HOTLINE')
  })
  it('the card has Vietnamese and English strings under the same keys', () => {
    const web = read('src/lib/i18n/v3/web.ts', 'utf8')
    const keys = ['title', 'body', 'call', 'hotlineTitle', 'agency', 'hotlineDesc', 'sourceLabel', 'sourceName']
    for (const k of keys) expect(web.match(new RegExp(`'v3\.scam\.help\.${k}'`, 'g')) ?? []).toHaveLength(2)
  })
  it('the scam-verdict "report to the police" line (shown under a message result) uses the canonical hotline, in both languages', async () => {
    const { scamVerdictText } = await import('@/lib/i18n/scamVerdict')
    for (const l of ['vi', 'en'] as const) {
      const s = scamVerdictText(l, 'scamVerdict.scenario.report')
      expect(s).toContain(SCAM_REPORT_HOTLINE.display)
      expect(s).not.toMatch(/\b113\b/)
    }
  })
  it('the TappyAI guidance in the knowledge library points at the canonical hotline; the verbatim official 113 quote is unchanged', async () => {
    const { BOCONGAN_2026 } = await import('@/lib/scam-shield/knowledge/bocongan2026')
    const guidance = BOCONGAN_2026.scenarios.flatMap(s => s.guidance.whatToDo).filter(l => /Công an nơi gần nhất/.test(l))
    expect(guidance.length).toBeGreaterThan(0)
    for (const l of guidance) { expect(l).toContain(SCAM_REPORT_HOTLINE.display); expect(l).not.toMatch(/\b113\b/) }
    expect(BOCONGAN_2026.official.hotline).toBe('113') // the source's own words, kept verbatim (pinned by dataset.test.ts)
  })
})
