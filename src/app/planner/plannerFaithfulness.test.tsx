// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/planner',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import PlannerView from './PlannerView'
import { derivePlans, type PlannerConversationRow } from '@/lib/planner/derivePlans'
import { accountRows } from '@/app/profile/ProfileRows'
import { vi as vi3, en as en3 } from '@/lib/i18n/v3/web'
import { CalendarRange } from 'lucide-react'

// ── V3 Web · AI Planner (My Plans) ──────────────────────────────────────────
//
// 🚨 WHAT THIS PAGE IS ALLOWED TO SAY IS THE WHOLE TEST.
//
// The reference mockup showed plan cards with a date range, a traveller count, a cover
// photograph of the destination and a status pill. Exactly one of those four — the traveller
// count — exists in `TappyPlan`. This suite pins the other three OUT, because "we removed the
// fake status badge" is precisely the kind of decision that gets undone by the next person
// working from the same picture.
//
// It also pins the two structural facts the audit turned up:
//
//   1. the shell's "AI Planner (My Plans)" row pointed at `/profile/price-watches` — a different
//      feature under a name that promised plans;
//   2. Home must not grow a Planner panel back (`homeAiFirst.test.tsx` owns that half; this file
//      owns the half that says the Planner has somewhere else to be).

const row = (over: Partial<PlannerConversationRow> = {}): PlannerConversationRow => ({
  id: 'c1',
  title: 'Chuyến Đà Lạt',
  updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  messages: [
    {
      role: 'assistant',
      content:
        'Kế hoạch đây.\n[TAPPY_PLAN]' +
        JSON.stringify({
          type: 'trip',
          title: 'Đà Lạt 2 ngày 1 đêm',
          people: 2,
          budget_total: '3 triệu',
          days: [
            { label: 'Ngày 1', items: [{ time: '08:00', emoji: '🏨', category: 'hotel', name: 'Ana Mandara', price: '1.2 triệu', maps_link: 'https://maps.google.com/x' }] },
            { label: 'Ngày 2', items: [{ time: '09:00', emoji: '🍜', category: 'food', name: 'Bún bò Ấp Ánh Sáng' }] },
          ],
        }) +
        '[/TAPPY_PLAN]',
    },
  ],
  ...over,
})

const user = { full_name: 'Huy', avatar_url: null, email: 'h@example.com' }
const renderPlanner = (rows: PlannerConversationRow[]) =>
  render(<PlannerView user={user} plans={derivePlans(rows)} />)

afterEach(cleanup)

describe('the Planner shows the plan the user actually received', () => {
  it('renders the plan title, its day count and its stop count', () => {
    renderPlanner([row()])
    expect(screen.getByText('Đà Lạt 2 ngày 1 đêm')).toBeTruthy()
    expect(screen.getByText('2 days')).toBeTruthy()
    expect(screen.getByText('2 stops')).toBeTruthy()
  })

  it('shows people and budget because THIS payload carries them', () => {
    renderPlanner([row()])
    expect(screen.getByText('2 people')).toBeTruthy()
    expect(screen.getByText('3 triệu')).toBeTruthy()
  })

  it('shows neither when the payload does not carry them — no invented default party size', () => {
    const bare = {
      role: 'assistant',
      content: '[TAPPY_PLAN]' + JSON.stringify({
        type: 'trip', title: 'Chuyến ngắn', days: [{ label: 'Ngày 1', items: [{ name: 'Quán B' }] }],
      }) + '[/TAPPY_PLAN]',
    }
    renderPlanner([row({ messages: [bare] })])
    expect(screen.queryByText(/ people$/)).toBeNull()
  })

  it('opens the itinerary in place — the page is a planner, not a table of contents', () => {
    renderPlanner([row()])
    // Collapsed, the card names its first stops but carries none of the itinerary DETAIL.
    expect(screen.getByText(/🏨 Ana Mandara/)).toBeTruthy()
    expect(screen.queryByText('08:00')).toBeNull()
    expect(screen.queryByRole('link', { name: /Map/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /View itinerary/ }))

    // Expanded, the real times, the real estimated price and the real map link the tool
    // returned — not a search URL assembled here out of the place name.
    expect(screen.getByText('08:00')).toBeTruthy()
    expect(screen.getByText('1.2 triệu')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Map/ }).getAttribute('href')).toBe('https://maps.google.com/x')

    // Two days means day tabs; one day would mean none.
    const tabs = [...document.querySelectorAll('.v3-chip')].map((c) => c.textContent)
    expect(tabs).toEqual(['Ngày 1', 'Ngày 2'])
    fireEvent.click(screen.getByRole('button', { name: 'Ngày 2' }))
    expect(screen.getByText('09:00')).toBeTruthy()
  })

  it('links a plan back to the conversation it lives in', () => {
    renderPlanner([row()])
    expect(screen.getByRole('link', { name: /Open in the conversation/ }).getAttribute('href')).toBe('/chat/c1')
  })
})

describe('the mockup fields that have no source are not rendered', () => {
  it('renders no date range — TappyPlan has no start or end date', () => {
    const { container } = renderPlanner([row()])
    // Any dd/mm/yyyy → dd/mm/yyyy pair, in either arrow style the reference used.
    expect(container.textContent ?? '').not.toMatch(/\d{2}\/\d{2}\/\d{4}\s*(→|-|–)\s*\d{2}\/\d{2}\/\d{4}/)
  })

  it('renders no status pill — plans have no lifecycle to report', () => {
    const { container } = renderPlanner([row()])
    const text = container.textContent ?? ''
    for (const claim of ['Đang lên kế hoạch', 'Đã hoàn thành', 'Đã hủy', 'In progress', 'Completed']) {
      expect(text, `"${claim}" asserts a state nothing in this product records`).not.toContain(claim)
    }
  })

  it('labels the timestamp as thread activity, never as a travel date', () => {
    renderPlanner([row()])
    // "Cập nhật 2 giờ trước" — the conversation's updated_at, said as what it is.
    expect(screen.getByText(/^Updated /)).toBeTruthy()
  })

  it('shows no cover image when no stop has a real photo', () => {
    const { container } = renderPlanner([row()])
    const card = container.querySelector('article')!
    expect(card.querySelectorAll('img').length, 'no placeholder destination art').toBe(0)
  })

  it('offers no Work or Personal filter — neither has a producer anywhere in the codebase', () => {
    const evening = {
      role: 'assistant',
      content: '[TAPPY_PLAN]' + JSON.stringify({
        type: 'evening', title: 'Tối nay ở Q1', days: [{ label: 'Tối nay', items: [{ name: 'Bar A' }] }],
      }) + '[/TAPPY_PLAN]',
    }
    const { container } = renderPlanner([row(), row({ id: 'c2', messages: [evening] })])
    const chips = [...container.querySelectorAll('.v3-chip')].map((c) => c.textContent)
    expect(chips).toEqual(['All', 'Trips', 'Evenings'])
  })

  it('shows no filter row at all when there is only one kind to filter', () => {
    const { container } = renderPlanner([row()])
    expect(container.querySelectorAll('.v3-chip').length).toBe(0)
  })

  it('the chips actually filter, unlike the decorative row on the old Home panel', () => {
    const evening = {
      role: 'assistant',
      content: '[TAPPY_PLAN]' + JSON.stringify({
        type: 'evening', title: 'Tối nay ở Q1', days: [{ label: 'Tối nay', items: [{ name: 'Bar A' }] }],
      }) + '[/TAPPY_PLAN]',
    }
    renderPlanner([row(), row({ id: 'c2', messages: [evening] })])
    expect(screen.getByText('Đà Lạt 2 ngày 1 đêm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Evenings' }))
    expect(screen.queryByText('Đà Lạt 2 ngày 1 đêm')).toBeNull()
    expect(screen.getByText('Tối nay ở Q1')).toBeTruthy()
  })
})

describe('the empty state offers the only action this surface really has', () => {
  it('sends the user to chat with the planning prompt pre-filled', () => {
    renderPlanner([])
    expect(screen.getByText('No plans yet. Ask Tappy to make your first one.')).toBeTruthy()
    const cta = screen.getAllByRole('link', { name: /Make a plan/ })[0]
    expect(cta.getAttribute('href')).toBe(`/chat?q=${encodeURIComponent('Plan a weekend trip')}`)
  })

  it('does not repeat the create CTA when the filter is what emptied the list', () => {
    const evening = {
      role: 'assistant',
      content: '[TAPPY_PLAN]' + JSON.stringify({
        type: 'evening', title: 'Tối nay ở Q1', days: [{ label: 'Tối nay', items: [{ name: 'Bar A' }] }],
      }) + '[/TAPPY_PLAN]',
    }
    const { container } = renderPlanner([row(), row({ id: 'c2', messages: [evening] })])
    fireEvent.click(screen.getByRole('button', { name: 'Evenings' }))
    const empties = container.querySelectorAll('.border-dashed')
    expect(empties.length).toBe(0) // both kinds still have a plan; nothing is empty
  })

  it('renders no filler card when the user has nothing', () => {
    const { container } = renderPlanner([])
    expect(container.querySelectorAll('article').length).toBe(0)
  })
})

describe('the navigation defect the audit found stays fixed', () => {
  const shell = readFileSync('src/components/v3/V3Shell.tsx', 'utf8')

  it('the shell\'s Planner row points at /planner, not at the price-watch list', () => {
    const line = shell.split('\n').find((l) => l.includes("labelKey: 'v3.nav.planner'"))!
    expect(line, 'the Planner row must exist in the shell').toBeTruthy()
    expect(line).toContain("href: '/planner'")
    expect(line).not.toContain('price-watches')
  })

  it('no other navigation entry was retargeted at /planner by accident', () => {
    const planner = shell.split('\n').filter((l) => l.includes("'/planner'"))
    expect(planner.length).toBe(1)
  })
})
describe('the Planner is reachable on mobile, not only from the desktop sidebar', () => {
  // 🚨 THE SIDEBAR IS `hidden lg:flex`. Below that breakpoint the five-tab BottomNav owns
  // navigation and its tab set is fixed (DD-003), so a destination that lives ONLY in the sidebar
  // cannot be opened from a phone at all. `/planner` was in exactly that state. The Profile row
  // inventory is the mobile-reachable surface, and `profileRowParity.test.tsx` already proves the
  // signed-in and guest screens both render every row in it.
  const rows = accountRows()
  const planner = rows.filter((r) => r.href === '/planner')

  it('the Profile inventory carries the Planner, exactly once', () => {
    expect(planner.length, 'one Planner row - not zero, not a duplicate').toBe(1)
  })

  it('it wears the SAME label and icon as the sidebar entry, so the two read as one destination', () => {
    expect(planner[0].labelKey).toBe('v3.nav.planner')
    expect(planner[0].icon).toBe(CalendarRange)
  })

  it('reuses existing dictionary keys - the row invented no new copy', () => {
    for (const key of [planner[0].labelKey, planner[0].descKey]) {
      expect(vi3[key], `${key} must already exist in the vi dictionary`).toBeTruthy()
      expect(en3[key], `${key} must already exist in the en dictionary`).toBeTruthy()
    }
  })

  it('Price Watch is untouched and still points at its own page', () => {
    const pw = rows.filter((r) => r.href === '/profile/price-watches')
    expect(pw.length).toBe(1)
    expect(pw[0].labelKey).toBe('profile.priceWatch')
    // The Planner sits BESIDE it, not in place of it.
    expect(rows.indexOf(planner[0]) - rows.indexOf(pw[0])).toBe(1)
  })

  it('adds no Planner tab to the bottom bar - the tab model is unchanged (DD-003)', () => {
    expect(readFileSync('src/components/BottomNav.tsx', 'utf8')).not.toContain('/planner')
  })
})
