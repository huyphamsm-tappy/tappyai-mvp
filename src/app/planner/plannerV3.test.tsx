// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'

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
import { vi as viCopy, en as enCopy } from '@/lib/i18n/v3/web'

// ── AI Planner — the V3 skin over the SAME derived plans ────────────────────
//
// The reskin (2026-09-13) added a hero with Tappy on the scooter, three feature tiles, a list
// header with the real count, a side CTA card and a composed empty state. It changed nothing about
// where plans come from (`derivePlans`), the one action (`/chat?q=`), the link back to the thread
// (`/chat/<id>`), the in-place itinerary or the filter chips — `plannerFaithfulness.test.tsx`
// still owns those. This file pins the reskin's own claims.

const SRC = readFileSync('src/app/planner/PlannerView.tsx', 'utf8')
const PAGE = readFileSync('src/app/planner/page.tsx', 'utf8')

const plan = (over: Record<string, unknown> = {}) => ({
  type: 'trip',
  title: 'Đà Nẵng 3 ngày 2 đêm — Biển, ẩm thực & thắng cảnh',
  people: 2,
  budget_total: '4.800.000 VND',
  days: [
    { label: 'Ngày 1', items: [{ time: '14:00', emoji: '🏨', category: 'hotel', name: 'M Hotel Da Nang', price: '1.200.000 VND', maps_link: 'https://maps.google.com/m' }] },
    { label: 'Ngày 2', items: [{ time: '09:00', emoji: '🍜', category: 'food', name: 'Mộc quán Seafood' }] },
  ],
  ...over,
})
const row = (p: Record<string, unknown> = plan(), over: Partial<PlannerConversationRow> = {}): PlannerConversationRow => ({
  id: 'c-dn',
  title: 'Đà Nẵng',
  updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  messages: [{ role: 'assistant', content: 'Đây.\n[TAPPY_PLAN]' + JSON.stringify(p) + '[/TAPPY_PLAN]' }],
  ...over,
})
const user = { full_name: 'Huy', avatar_url: null, email: 'h@example.com' }
const renderPlanner = (rows: PlannerConversationRow[]) => render(<PlannerView user={user} plans={derivePlans(rows)} />)
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null

afterEach(cleanup)

describe('the hero says what the page does, with the scooter Tappy', () => {
  it('renders the eyebrow, the three-part headline and the body from the dictionary', () => {
    renderPlanner([row()])
    const hero = q('[data-planner-hero]')!
    expect(hero.textContent).toContain(enCopy['v3.planner.heroTitle1'])
    expect(hero.textContent).toContain(enCopy['v3.planner.heroTitle2'])
    expect(hero.querySelector('.v3-planner-hero-accent')!.textContent).toBe(enCopy['v3.planner.heroTitle3'])
    expect(hero.textContent).toContain(enCopy['v3.planner.heroBody'])
    expect(q('[data-planner-bubble]')!.textContent).toBe(enCopy['v3.planner.bubble'])
  })

  it('the mascot is the owner’s `delivery` pose — Tappy on the blue scooter — and nothing else', () => {
    renderPlanner([row()])
    const img = q<HTMLImageElement>('[data-planner-scene] img')!
    expect(img.getAttribute('src')).toBe('/tappy/delivery.png')
    expect(existsSync('public/tappy/delivery.png')).toBe(true)
    expect(q('[data-planner-scene]')!.getAttribute('aria-hidden')).toBe('true')
    // No other pose leaks onto this page, and no remote artwork.
    for (const pose of ['reading', 'food', 'thinking', 'searching', 'travel', 'wave']) {
      expect(SRC).not.toContain(`pose="${pose}"`)
    }
    expect(SRC).not.toMatch(/https?:\/\/[^\s'"]+\.(png|jpg|jpeg|webp|svg)/)
  })

  it('the three feature tiles describe real behaviour: chat CTA, in-place itinerary, recent threads — no sharing tile', () => {
    renderPlanner([row()])
    const tiles = Array.from(q('[data-planner-features]')!.querySelectorAll('li')).map((li) => li.textContent)
    expect(tiles).toHaveLength(3)
    expect(tiles[0]).toContain(enCopy['v3.planner.featPlan'])
    expect(tiles[1]).toContain(enCopy['v3.planner.featItinerary'])
    expect(tiles[2]).toContain(enCopy['v3.planner.featSource'])
    for (const key of ['v3.planner.featPlan', 'v3.planner.featPlanDesc', 'v3.planner.featItinerary', 'v3.planner.featItineraryDesc', 'v3.planner.featSource', 'v3.planner.featSourceDesc', 'v3.planner.heroBody']) {
      expect(viCopy[key], key).not.toMatch(/chia sẻ|kỷ niệm|thông minh|bạn bè|gia đình/i)
      expect(enCopy[key], key).not.toMatch(/share|memor|smart|friends|family/i)
    }
    // Each tile is backed by code on this page: the chat href, the expand button, the scope note.
    expect(SRC).toContain("`/chat?q=${encodeURIComponent(t('v3.planner.prompt'))}`")
    expect(SRC).toContain("t('v3.planner.expand')")
    expect(PAGE).toContain('const CONVERSATION_WINDOW = 40')
  })
})

describe('the list header and the side card', () => {
  it('shows the real count next to the title, and the CTA is the existing chat link', () => {
    renderPlanner([row(), row(plan({ title: 'Huế 1 ngày' }), { id: 'c-hue' })])
    expect(q('[data-planner-count]')!.textContent).toBe(enCopy['v3.planner.count'].replace('{n}', '2'))
    expect(q('[data-planner-cta]')!.getAttribute('href')).toBe(`/chat?q=${encodeURIComponent(enCopy['v3.planner.prompt'])}`)
  })

  it('hides the count pill when there are no plans', () => {
    renderPlanner([])
    expect(q('[data-planner-count]')).toBeNull()
  })

  it('the side card is a second way into the SAME chat prompt, and appears only beside a list', () => {
    renderPlanner([row()])
    const side = q('[data-planner-side]')!
    expect(side.textContent).toContain(enCopy['v3.planner.sideTitle'])
    const link = side.querySelector('a')!
    expect(link.getAttribute('href')).toBe(q('[data-planner-cta]')!.getAttribute('href'))
    cleanup()
    renderPlanner([])
    expect(q('[data-planner-side]')).toBeNull()
  })
})

describe('the plan card renders the plan the user received', () => {
  it('title, kind pill, days, stops, budget, stop names, thread activity, and the two existing actions', () => {
    renderPlanner([row()])
    const card = q('[data-planner-card]')!
    expect(card.querySelector('h2')!.textContent).toBe('Đà Nẵng 3 ngày 2 đêm — Biển, ẩm thực & thắng cảnh')
    expect(card.querySelector('.v3-planner-kind')!.textContent).toBe(enCopy['v3.planner.travel'])
    const facts = q('[data-planner-facts]')!.textContent
    expect(facts).toContain('2 days')
    expect(facts).toContain('2 stops')
    expect(facts).toContain('2 people')
    expect(facts).toContain('4.800.000 VND')
    expect(card.querySelector('.v3-planner-stops')!.textContent).toContain('🏨 M Hotel Da Nang')
    expect(card.querySelector('.v3-planner-updated')!.textContent).toMatch(/^Updated /)
    expect(screen.getByRole('button', { name: /View itinerary/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open in the conversation/ }).getAttribute('href')).toBe('/chat/c-dn')
  })

  it('draws a glyph, not a picture, when no stop carries a real photo; a real photo when one does', () => {
    renderPlanner([row()])
    expect(q('[data-planner-card] img')).toBeNull()
    expect(q('[data-planner-card] .v3-planner-thumb-glyph')).toBeTruthy()
    cleanup()
    const withPhoto = plan()
    ;(withPhoto.days as { items: Record<string, unknown>[] }[])[0].items[0].photo_url = 'https://places.example/m-hotel.jpg'
    renderPlanner([row(withPhoto)])
    expect(q<HTMLImageElement>('[data-planner-card] img')!.getAttribute('src')).toBe('https://places.example/m-hotel.jpg')
  })

  it('omits people and budget when the plan does not carry them — no invented metadata', () => {
    renderPlanner([row(plan({ people: undefined, budget_total: undefined }))])
    const facts = q('[data-planner-facts]')!.textContent
    expect(facts).toContain('2 days')
    expect(facts).not.toMatch(/people/)
    expect(facts).not.toMatch(/VND/)
    expect(q('[data-planner-card]')!.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('View itinerary opens the day tabs and the real stop fields in place, and collapses again', () => {
    renderPlanner([row()])
    expect(q('[data-planner-itinerary]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /View itinerary/ }))
    const it = q('[data-planner-itinerary]')!
    expect([...it.querySelectorAll('.v3-chip')].map((c) => c.textContent)).toEqual(['Ngày 1', 'Ngày 2'])
    expect(it.textContent).toContain('14:00')
    expect(it.textContent).toContain('1.200.000 VND')
    expect(it.querySelector('a')!.getAttribute('href')).toBe('https://maps.google.com/m')
    fireEvent.click(screen.getByRole('button', { name: /Collapse/ }))
    expect(q('[data-planner-itinerary]')).toBeNull()
  })
})

describe('the empty states', () => {
  it('no plans at all: the scooter, a title, the existing text and the existing chat CTA', () => {
    renderPlanner([])
    const empty = q('[data-planner-empty]')!
    expect(empty.querySelector('[data-planner-empty-mascot] img')!.getAttribute('src')).toBe('/tappy/delivery.png')
    expect(empty.textContent).toContain(enCopy['v3.planner.emptyTitle'])
    expect(empty.textContent).toContain(enCopy['v3.planner.empty'])
    expect(empty.querySelector('a')!.getAttribute('href')).toBe(`/chat?q=${encodeURIComponent(enCopy['v3.planner.prompt'])}`)
    expect(document.querySelectorAll('article')).toHaveLength(0)
  })

  it('filtered to nothing: no mascot, no title, no CTA — the user has plans, just not of that kind', () => {
    const evening = plan({ type: 'evening', title: 'Tối nay ở Q1', days: [{ label: 'Tối nay', items: [{ name: 'Bar A' }] }] })
    renderPlanner([row(), row(evening, { id: 'c-ev' })])
    expect(q('[data-planner-empty]')).toBeNull()
  })

  it('the page has no loading or error surface of its own to fake — the server component renders or redirects', () => {
    expect(PAGE).toContain("if (!user) redirect('/login')")
    expect(existsSync('src/app/planner/loading.tsx')).toBe(false)
    expect(existsSync('src/app/planner/error.tsx')).toBe(false)
    expect(SRC).not.toMatch(/isLoading|setError|skeleton/i)
  })
})

describe('i18n', () => {
  it('vi and en carry the same planner keys, none empty, and the view reads every key it uses from them', () => {
    const viKeys = Object.keys(viCopy).filter((k) => k.startsWith('v3.planner.')).sort()
    const enKeys = Object.keys(enCopy).filter((k) => k.startsWith('v3.planner.')).sort()
    expect(enKeys).toEqual(viKeys)
    for (const k of viKeys) {
      expect(viCopy[k].trim(), k).not.toBe('')
      expect(enCopy[k].trim(), k).not.toBe('')
    }
    const used = Array.from(SRC.matchAll(/'(v3\.planner\.[a-zA-Z0-9]+)'/g)).map((m) => m[1])
    expect(used.length).toBeGreaterThan(20)
    for (const k of used) expect(viCopy, k).toHaveProperty(k)
  })
})
