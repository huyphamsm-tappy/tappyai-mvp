// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/history',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

vi.mock('./DeleteConversationButton', () => ({
  __esModule: true,
  default: ({ id }: { id: string }) => <button data-testid={`delete-${id}`} type="button" />,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import HistoryView from './HistoryView'
import { HISTORY_STORAGE_KEY } from '@/lib/scam-shield/history'

// ── V3 Web · History ────────────────────────────────────────────────────────
//
// 🚨 THE REFERENCE DREW FIVE CATEGORIES AND FOUR EXIST. Most of this file pins
// the difference: there is no recent-search section, because nothing in this
// product stores a search, and `user_events` — which is full of rows — is
// ANALYTICS and stays analytics. A history page is a claim about what someone
// did; every row on it has to come from a record of them doing it.

const me = { full_name: 'Huy', avatar_url: null, email: 'h@x.com' }

const conv = (over: Record<string, unknown> = {}) => ({
  id: 'c1', title: 'Gợi ý lịch trình Đà Lạt', category: 'travel',
  updated_at: new Date().toISOString(), messageCount: 6, ...over,
})

const video = (over: Record<string, unknown> = {}) => ({
  reviewId: 'r1', title: 'Ẩm thực đường phố', thumbnail: null,
  contentType: 'video', watchedAt: new Date().toISOString(), ...over,
})

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const renderHistory = (over: { conversations?: unknown[]; videos?: unknown[] } = {}) =>
  render(
    <HistoryView
      userInfo={me}
      conversations={(over.conversations ?? []) as never}
      videos={(over.videos ?? []) as never}
    />,
  )

/**
 * A category card in the MAIN column.
 *
 * 🔑 Targeted by `data-history-section`, not by heading text: the quick-stats
 * rail repeats every category label, so matching on text would find the rail's
 * row and report a section as present when the list is empty.
 */
const section = (id: string) => document.querySelector(`[data-history-section="${id}"]`) as HTMLElement | null
const statsPanel = () => document.querySelector('[data-history-stats]') as HTMLElement

beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

describe('categories render only when they have real data', () => {
  it('shows nothing but a calm empty state when there is no history at all', () => {
    const { container } = renderHistory()
    expect(screen.getByText(/chưa có lịch sử|no history yet/i)).toBeTruthy()
    // 🚨 No example rows are rendered to make the page look populated.
    expect(container.querySelectorAll('[data-testid^="delete-"]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^(tất cả|all)$/i }), 'no filter bar over nothing').toBeNull()
  })

  it('renders the AI section from real conversations, with a real count', () => {
    renderHistory({ conversations: [conv(), conv({ id: 'c2', title: 'Quán cà phê Hội An' })] })
    const card = section('ai')!
    expect(card).toBeTruthy()
    expect(within(card).getByText('2'), 'the count is the list length, never a constant').toBeTruthy()
    expect(screen.getByText('Gợi ý lịch trình Đà Lạt')).toBeTruthy()
  })

  it('renders no video section when nothing has been watched', () => {
    renderHistory({ conversations: [conv()] })
    expect(section('video')).toBeNull()
  })

  it('renders no link-check section when the device store is empty', () => {
    renderHistory({ conversations: [conv()] })
    expect(section('links')).toBeNull()
  })

  it('keeps the per-conversation delete this page already shipped', () => {
    renderHistory({ conversations: [conv({ id: 'keep-me' })] })
    expect(screen.getByTestId('delete-keep-me')).toBeTruthy()
  })
})

describe('the category that does not exist is never offered', () => {
  it('renders no recent-search tab or section, with data present', () => {
    // 🚨 There is no `search_history` table, no recent-search client store and no
    // endpoint that records a query. A tab for it would have to invent contents.
    const { container } = renderHistory({ conversations: [conv()], videos: [video()] })
    expect(container.textContent ?? '').not.toMatch(/tìm kiếm gần đây|recent searches/i)
  })

  it('renders no telemetry-derived activity sentences', () => {
    const { container } = renderHistory({ conversations: [conv()] })
    // `user_events` holds `chat_search`, `hide`, `not_interested`. None of it is
    // a user-facing vocabulary, and none of it appears here.
    expect(container.textContent ?? '').not.toMatch(/not_interested|chat_search|đã ẩn|bạn đã /i)
  })

  it('never reads user_events in the page source', () => {
    const src = readFileSync('src/app/profile/history/page.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(/from\(\s*['"]user_events['"]\s*\)/.test(src)).toBe(false)
  })
})

describe('the plans card links rather than duplicating', () => {
  it('points at the Planner and carries no count', () => {
    renderHistory({ conversations: [conv()] })
    const card = section('plans')!
    const link = within(card).getByRole('link')
    expect(link.getAttribute('href')).toBe('/planner')
    // 🚨 A count would need the full `messages` blob for every conversation —
    // the multi-megabyte read the Planner deliberately bounds. History does not
    // repeat that work, so it shows no number rather than a guessed one.
    expect(card.textContent ?? '').not.toMatch(/\d/)
  })
})

describe('the time range filters real records', () => {
  it('drops rows outside the selected window, and moves the counts with them', () => {
    renderHistory({
      conversations: [conv({ id: 'recent', title: 'Mới' }), conv({ id: 'old', title: 'Cũ', updated_at: daysAgo(20) })],
    })
    // Defaults to all time: both present.
    expect(screen.getByText('Mới')).toBeTruthy()
    expect(screen.getByText('Cũ')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /7 ngày qua|last 7 days/i }))

    expect(screen.getByText('Mới')).toBeTruthy()
    expect(screen.queryByText('Cũ')).toBeNull()
    expect(within(section('ai')!).getByText('1')).toBeTruthy()
  })

  it('shows the empty state when the window contains nothing', () => {
    renderHistory({ conversations: [conv({ updated_at: daysAgo(90) })] })
    fireEvent.click(screen.getByRole('button', { name: /7 ngày qua|last 7 days/i }))
    expect(screen.getByText(/chưa có lịch sử|no history yet/i)).toBeTruthy()
  })

  it('offers a period selector and NOT an activity chart', () => {
    // The reference draws a seven-bar graph. Bucketing three unrelated sources
    // into per-day totals and presenting it as a measurement is the fabrication
    // this avoids.
    const { container } = renderHistory({ conversations: [conv()] })
    const rail = screen.getByText(/thời gian|time range/i).closest('section')!
    expect(within(rail).getAllByRole('button')).toHaveLength(3)
    expect(container.querySelector('svg[class*="chart"], canvas')).toBeNull()
  })
})

describe('quick stats are counts of what is on screen', () => {
  it('reports each category’s real length', () => {
    renderHistory({
      conversations: [conv(), conv({ id: 'c2' })],
      videos: [video(), video({ reviewId: 'r2' }), video({ reviewId: 'r3' })],
    })
    const stats = statsPanel()
    expect(within(stats).getByText('2')).toBeTruthy()
    expect(within(stats).getByText('3')).toBeTruthy()
    // Link checks are genuinely zero here, and zero is shown because it was counted.
    expect(within(stats).getByText('0')).toBeTruthy()
  })
})

describe('watched videos come from the interaction record', () => {
  it('links to the real review and shows no invented duration', () => {
    renderHistory({ videos: [video({ reviewId: 'r9', title: 'Review Phú Quốc' })] })
    const card = section('video')!
    expect(within(card).getByRole('link').getAttribute('href')).toBe('/reviews/r9')
    // 🚨 `review_interactions` stores watch_seconds, not the clip's length. The
    // reference's "12:34" badge would be a number about the video that nothing
    // in this product has ever measured.
    expect(card.textContent ?? '').not.toMatch(/\d+:\d\d/)
  })
})

describe('link-check history is the device store, and says so', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    url: 'https://vietcombank.com.vn/', level: 'SAFE', checkedAt: Date.now(), ...over,
  })

  it('renders real entries with the engine’s own verdict wording', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([entry({ level: 'HIGH', url: 'https://vcb-secure-login.net/' })]))
    renderHistory()
    expect(screen.getByText('https://vcb-secure-login.net/')).toBeTruthy()
    expect(screen.getByText(/nguy cơ cao|high risk/i)).toBeTruthy()
  })

  it('states that the list is device-local rather than implying it syncs', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([entry()]))
    renderHistory()
    expect(screen.getByText(/chỉ được lưu trên thiết bị này|stored on this device only/i)).toBeTruthy()
  })

  it('clears through the real store, not a local flag', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([entry()]))
    renderHistory()
    fireEvent.click(screen.getByRole('button', { name: /xóa lịch sử kiểm tra link|clear link-check history/i }))
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull()
    expect(section('links')).toBeNull()
  })

  it('survives a corrupt device store without breaking the page', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, 'not json')
    renderHistory({ conversations: [conv()] })
    expect(section('ai'), 'a corrupt device store must not take the page down').toBeTruthy()
    expect(section('links')).toBeNull()
  })
})

describe('privacy', () => {
  const src = readFileSync('src/app/profile/history/page.tsx', 'utf8')

  it('scopes every history read to the signed-in user', () => {
    // Belt and braces: RLS covers both tables, and the page filters anyway.
    expect(src).toContain(".eq('user_id', user.id)")
    expect((src.match(/\.eq\('user_id', user\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('redirects a signed-out visitor instead of rendering anything', () => {
    expect(src).toContain("redirect('/login")
  })

  it('never sends the conversation transcript to the client', () => {
    // `messages` is read to be COUNTED and must not cross the boundary.
    expect(src).toContain('messageCount')
    expect(/messages:\s*c\.messages/.test(src), 'the blob stays on the server').toBe(false)
  })
})

describe('i18n', () => {
  it('holds no hardcoded Vietnamese UI text', () => {
    const code = readFileSync('src/app/profile/history/HistoryView.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l))).toEqual([])
  })
})
